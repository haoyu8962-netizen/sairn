import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import { useSignTypedData } from "@privy-io/react-auth";
import { useConnectionWalletClient } from "@sairn/hl-react";
import {
	assertExchangeSigningDeadline,
	unwrapExchangeSignerGuardError,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { isAddress, type WalletClient, zeroAddress } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { createActionError } from "@/lib/errors/action-error";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import {
	assertTradingRegionAllowed,
	findTradingRegionBlockedError,
	readTradingRegionVerdict,
} from "@/lib/geo/trading-region";
import type { AgentApprovalOptions, ExchangeParams, ExchangeResponse } from "@/lib/hyperliquid";
import {
	captureAgentRegistrationExecutionLease,
	createExchangeClient,
	HttpTransport,
	type IRequestTransport,
	isAgentRegistrationExecutionLeaseCurrent,
	startAgentRegistrationExecution,
	startAgentRegistrationSubmission,
	useHyperliquid,
	verifyLegalActionAllowed,
} from "@/lib/hyperliquid";
import { createExternalAgentSigner } from "@/lib/wallet/external-agent-signer";
import { createPrivyAgentSigner } from "@/lib/wallet/privy-agent-signer";
import { hasSameWalletAddress } from "@/lib/wallet/privy-wagmi";
import { useWalletSession } from "./use-wallet-session";

export interface ExplicitAgentApproval {
	mutateAsync: (
		params: ExchangeParams<"approveAgent">,
		options?: ExplicitAgentApprovalOptions,
	) => Promise<ExchangeResponse<"approveAgent">>;
	isPending: boolean;
}

export type ExplicitAgentApprovalOptions = AgentApprovalOptions;

/**
 * Agent approval must always be initiated by an explicit master-wallet action.
 * The dedicated Privy signer may hide its second confirmation only after the
 * caller confirms that the user reviewed the permission in the application.
 *
 * A named Agent (an API wallet or the linked phone's `Mobile QR`) is a new grant that can open
 * trades, so it needs an allowed region verdict from this terminal, checked before signing, after
 * the signature and before the request is sent. The unnamed trading-connection Agent and removals
 * (zero address) keep the exit rule of `docs/runtime-guardrails.md` §2.
 */
export function useExplicitAgentApproval(): ExplicitAgentApproval {
	const queryClient = useQueryClient();
	useGeoRestriction();
	const { signTypedData } = useSignTypedData();
	const walletClient = useConnectionWalletClient().data as WalletClient | undefined;
	const { enforceLegalActions, env, exchangeLifecycle, info } = useHyperliquid();
	const { walletAddress, connectedWalletAddress, embeddedWalletAddress, hasWalletAccess, walletIntent } =
		useWalletSession();
	const inFlightRef = useRef<symbol | null>(null);
	const walletClientAddress = walletClient?.account?.address;
	const identityRef = useRef({
		connectedWalletAddress,
		embeddedWalletAddress,
		env,
		hasWalletAccess,
		walletAddress,
		walletClientAddress,
		walletIntent,
	});
	const [isExplicitApprovalPending, setIsExplicitApprovalPending] = useState(false);

	useLayoutEffect(() => {
		identityRef.current = {
			connectedWalletAddress,
			embeddedWalletAddress,
			env,
			hasWalletAccess,
			walletAddress,
			walletClientAddress,
			walletIntent,
		};
	}, [
		connectedWalletAddress,
		embeddedWalletAddress,
		env,
		hasWalletAccess,
		walletAddress,
		walletClientAddress,
		walletIntent,
	]);

	async function mutateAsync(
		params: ExchangeParams<"approveAgent">,
		options: ExplicitAgentApprovalOptions = {},
	): Promise<ExchangeResponse<"approveAgent">> {
		const applicationReview = options.applicationReview === "confirmed" ? "confirmed" : undefined;
		const registrationPublicKey = options.registrationPublicKey;
		throwIfApprovalAborted(options.signal);
		if (!isAddress(params.agentAddress)) throw createActionError("request-invalid");
		if (
			registrationPublicKey &&
			(!isAddress(registrationPublicKey) || registrationPublicKey.toLowerCase() !== params.agentAddress.toLowerCase())
		) {
			throw createActionError("request-invalid");
		}
		if (!hasWalletAccess || !walletAddress) throw createActionError("wallet-unavailable");
		const requiresTradingRegion = isNamedAgentGrant(params);
		const assertGrantRegionAllowed = () => {
			if (requiresTradingRegion) assertTradingRegionAllowed(readTradingRegionVerdict(queryClient));
		};
		const isGrantRegionAllowed = () => {
			try {
				assertGrantRegionAllowed();
				return true;
			} catch {
				return false;
			}
		};
		assertGrantRegionAllowed();
		if (inFlightRef.current) {
			throw new LocalizedActionError(msg`Another wallet approval is already in progress. Try again after it finishes.`);
		}

		const attempt = Symbol("explicit-agent-approval");
		inFlightRef.current = attempt;
		const releaseAttempt = () => {
			if (inFlightRef.current !== attempt) return;
			inFlightRef.current = null;
			setIsExplicitApprovalPending(false);
		};
		options.signal?.addEventListener("abort", releaseAttempt, { once: true });
		try {
			const approvalWalletIntent = walletIntent;
			if (approvalWalletIntent !== "embedded" && approvalWalletIntent !== "external") {
				throw createActionError("wallet-mismatch");
			}
			if (!hasSameWalletAddress(connectedWalletAddress, walletAddress)) throw createActionError("wallet-mismatch");
			if (approvalWalletIntent === "embedded" && !hasSameWalletAddress(embeddedWalletAddress, walletAddress)) {
				throw createActionError("wallet-mismatch");
			}
			if (
				approvalWalletIntent === "external" &&
				(!walletClient || !hasSameWalletAddress(walletClient.account?.address, walletAddress))
			) {
				throw createActionError("wallet-mismatch");
			}
			const assertApprovalSessionCurrent = () => {
				throwIfApprovalAborted(options.signal);
				const current = identityRef.current;
				if (
					!exchangeLifecycle.active ||
					!current.hasWalletAccess ||
					current.env !== env ||
					current.walletIntent !== approvalWalletIntent ||
					!hasSameWalletAddress(current.walletAddress, walletAddress) ||
					!hasSameWalletAddress(current.connectedWalletAddress, walletAddress)
				) {
					throw createActionError("identity-changed");
				}
				if (
					approvalWalletIntent === "embedded" &&
					!hasSameWalletAddress(current.embeddedWalletAddress, walletAddress)
				) {
					throw createActionError("identity-changed");
				}
				if (approvalWalletIntent === "external" && !hasSameWalletAddress(current.walletClientAddress, walletAddress)) {
					throw createActionError("identity-changed");
				}
			};

			setIsExplicitApprovalPending(true);
			if (enforceLegalActions) {
				await verifyLegalActionAllowed({
					queryClient,
					info,
					env,
					owner: walletAddress,
				});
			}
			assertApprovalSessionCurrent();
			const registrationLease = captureAgentRegistrationExecutionLease(
				env,
				walletAddress,
				registrationPublicKey ? { agentPublicKey: registrationPublicKey } : undefined,
			);
			if (!registrationLease) {
				throw createActionError("identity-changed");
			}
			const canSubmit = () => {
				try {
					assertApprovalSessionCurrent();
					return true;
				} catch {
					return false;
				}
			};
			const guarded = await startAgentRegistrationExecution(registrationLease, canSubmit, () => {
				if (options.deadline) assertExchangeSigningDeadline(options.deadline);
				assertGrantRegionAllowed();
				const beforeSubmit = async () => {
					assertApprovalSessionCurrent();
					if (enforceLegalActions) {
						await verifyLegalActionAllowed({
							queryClient,
							info,
							env,
							owner: walletAddress,
							forceFresh: true,
						});
					}
					assertApprovalSessionCurrent();
					if (!(await isAgentRegistrationExecutionLeaseCurrent(registrationLease))) {
						throw createActionError("identity-changed");
					}
					assertApprovalSessionCurrent();
					assertGrantRegionAllowed();
				};
				const beforeSign = async () => {
					assertApprovalSessionCurrent();
					assertGrantRegionAllowed();
					const leaseCurrent = await isAgentRegistrationExecutionLeaseCurrent(registrationLease, options.signal);
					throwIfApprovalAborted(options.signal);
					if (!leaseCurrent) throw createActionError("identity-changed");
					if (options.deadline) assertExchangeSigningDeadline(options.deadline);
					assertApprovalSessionCurrent();
					assertGrantRegionAllowed();
				};
				let signer: AbstractWallet;
				if (approvalWalletIntent === "embedded") {
					signer = createPrivyAgentSigner({
						applicationReview,
						expectedAddress: walletAddress,
						activeAddress: connectedWalletAddress,
						embeddedWalletAddress,
						chainId: env === "Testnet" ? arbitrumSepolia.id : arbitrum.id,
						signTypedData,
						beforeSign,
						beforeSubmit,
						reviewCopy: {
							title: i18n._(msg`Approve mobile trading access`),
							description: i18n._(msg`Review and approve this Hyperliquid Agent permission.`),
							buttonText: i18n._(msg`Approve access`),
						},
					});
				} else {
					if (!walletClient) throw createActionError("wallet-mismatch");
					signer = createExternalAgentSigner({
						expectedAddress: walletAddress,
						walletClient,
						beforeSign,
						beforeSubmit,
					});
				}
				const baseTransport = new HttpTransport({ isTestnet: env === "Testnet" });
				const transport: IRequestTransport = {
					isTestnet: baseTransport.isTestnet,
					async request<T>(endpoint: "info" | "exchange", payload: unknown, signal?: AbortSignal): Promise<T> {
						const execute = () =>
							baseTransport.request<T>(endpoint, payload, registrationPublicKey ? undefined : signal);
						const canSend = () => isGrantRegionAllowed() && canSubmit();
						const submission = registrationPublicKey
							? await startAgentRegistrationSubmission(registrationLease, canSend, execute)
							: await startAgentRegistrationExecution(registrationLease, canSend, execute);
						if (submission.status === "invalidated") {
							assertGrantRegionAllowed();
							throw createActionError("identity-changed");
						}
						return await submission.execution;
					},
				};
				const client = createExchangeClient(signer, env === "Testnet", undefined, transport, options.deadline);
				return client
					.approveAgent(params, options.signal ? { signal: options.signal } : undefined)
					.catch((error: unknown) => {
						const regionError = findTradingRegionBlockedError(error);
						if (regionError) throw regionError;
						return unwrapExchangeSignerGuardError(error);
					});
			});
			if (guarded.status === "invalidated") {
				throw createActionError("identity-changed");
			}
			return await guarded.execution;
		} finally {
			options.signal?.removeEventListener("abort", releaseAttempt);
			releaseAttempt();
		}
	}

	return {
		mutateAsync,
		isPending: isExplicitApprovalPending,
	};
}

function isNamedAgentGrant(params: ExchangeParams<"approveAgent">): boolean {
	return Boolean(params.agentName) && params.agentAddress.toLowerCase() !== zeroAddress;
}

function throwIfApprovalAborted(signal: AbortSignal | undefined): void {
	if (!signal?.aborted) return;
	const error = new Error("The mobile access approval was cancelled before signing.");
	error.name = "AbortError";
	throw error;
}
