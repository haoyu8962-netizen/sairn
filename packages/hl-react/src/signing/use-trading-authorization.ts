import { useMutation } from "@tanstack/react-query";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import {
	ExchangeActionDeadlineError,
	ExchangeRequestInvalidatedError,
	startExchangeActionDeadline,
} from "../internal/exchange/request-scheduler";
import { readPersistTradingConnection } from "./agent-storage";
import { type HyperliquidOwnerSigner, useHyperliquidOwnerSigner } from "./owner-signer-provider";
import type { RegistrationStatus } from "./types";
import { useAgentRegistration } from "./use-agent-registration";
import { useBuilderFeeApproval } from "./use-builder-fee-approval";
import { type TradingRequirements, useTradingStatus } from "./use-trading-status";

/**
 * The Agent approval of this authorization went through and the builder-fee step after it was not sent: it was
 * not signed in time, or the scheduler dropped it because the session changed. It is not reported as the
 * deadline or identity-change error, whose texts say that nothing was signed or sent.
 */
export class TradingAuthorizationIncompleteError extends Error {
	constructor(options?: ErrorOptions) {
		super("The Agent was approved, but the builder fee approval was not signed in time", options);
		this.name = "TradingAuthorizationIncompleteError";
	}
}

/**
 * After an approval was submitted, an owner that is no longer current must not be reported as "not sent"
 * (ADR 0058): the approval may already be on the exchange.
 */
function changedAfterSubmission(error: unknown): unknown {
	if (error instanceof ExchangeRequestInvalidatedError) {
		return new Error("The wallet or network changed during trading authorization", { cause: error });
	}
	return error;
}

function assertOwnerAfterSubmission(ownerSigner: HyperliquidOwnerSigner | null): void {
	try {
		ownerSigner?.assertCurrent();
	} catch (error) {
		throw changedAfterSubmission(error);
	}
}

/** A status query after a submission: the owner checks inside it must not turn into "not sent" either. */
async function queryAfterSubmission<T>(query: () => Promise<T>): Promise<T> {
	try {
		return await query();
	} catch (error) {
		throw changedAfterSubmission(error);
	}
}

export interface UseTradingAuthorizationResult {
	authorize: () => Promise<Address>;
	status: RegistrationStatus;
	error: Error | null;
}

export interface UseTradingAuthorizationOptions {
	requiresBuilderFee?: boolean;
}

export function useTradingAuthorization(options: UseTradingAuthorizationOptions = {}): UseTradingAuthorizationResult {
	const requiresBuilderFee = options.requiresBuilderFee !== false;
	const ownerSigner = useHyperliquidOwnerSigner();
	const tradingStatus = useTradingStatus();
	const agentRegistration = useAgentRegistration({ enabled: tradingStatus.signerMode === "agent" });
	const builderFeeApproval = useBuilderFeeApproval();

	const authorization = useMutation({
		mutationKey: [
			"hl",
			"tradingAuthorization",
			tradingStatus.signerMode,
			tradingStatus.signerAddress,
			requiresBuilderFee,
		],
		// The deadline starts at the click (ADR 0053); the request never waits offline before it.
		networkMode: "always",
		mutationFn: async (): Promise<Address> => {
			ownerSigner?.assertCurrent();
			const deadline = startExchangeActionDeadline();
			const refetchRequirements = requiresBuilderFee ? tradingStatus.refetch : tradingStatus.refetchSigner;
			let registeredAddress = tradingStatus.signerAddress;
			let newlyVerifiedAgentAddress: Address | undefined;
			let builderFeeDeadline = deadline;
			let submitted = false;
			let requirements = await refetchRequirements();
			ownerSigner?.assertCurrent();

			if (requirements.needsAgent) {
				registeredAddress = await agentRegistration.register({
					persistConnection: readPersistTradingConnection(),
					deadline,
				});
				// The user has just confirmed the Agent approval in the wallet, which can take longer than the limit:
				// the builder-fee step, itself a wallet prompt on this path, counts from here (ADR 0053 decision 8).
				builderFeeDeadline = startExchangeActionDeadline();
				submitted = true;
				assertOwnerAfterSubmission(ownerSigner);
				newlyVerifiedAgentAddress = registeredAddress;
				requirements = await queryAfterSubmission(() => refetchRequirements(newlyVerifiedAgentAddress));
				assertOwnerAfterSubmission(ownerSigner);
			}

			if (requiresBuilderFee && requirements.needsBuilderFee) {
				submitted = true;
				try {
					await builderFeeApproval.approve(builderFeeDeadline);
				} catch (error) {
					if (
						newlyVerifiedAgentAddress &&
						(error instanceof ExchangeActionDeadlineError || error instanceof ExchangeRequestInvalidatedError)
					) {
						throw new TradingAuthorizationIncompleteError({ cause: error });
					}
					throw error;
				}
				assertOwnerAfterSubmission(ownerSigner);
			}

			let confirmed: TradingRequirements;
			if (submitted) {
				confirmed = await queryAfterSubmission(() => refetchRequirements(newlyVerifiedAgentAddress));
				assertOwnerAfterSubmission(ownerSigner);
			} else {
				confirmed = await refetchRequirements(newlyVerifiedAgentAddress);
				ownerSigner?.assertCurrent();
			}
			if (!confirmed.isSignerReady || (requiresBuilderFee && !confirmed.isBuilderFeeReady)) {
				throw new Error("Trading authorization could not be confirmed");
			}
			return registeredAddress ?? zeroAddress;
		},
	});

	let status: RegistrationStatus = "idle";
	if (requiresBuilderFee && builderFeeApproval.status === "approving_fee") status = "approving_fee";
	else if (agentRegistration.status === "approving_agent") status = "approving_agent";
	else if (authorization.isPending) status = "verifying";
	else if (
		authorization.isError ||
		(requiresBuilderFee && builderFeeApproval.status === "error") ||
		agentRegistration.status === "error"
	) {
		status = "error";
	}

	return {
		authorize: authorization.mutateAsync,
		status,
		error: authorization.error ?? (requiresBuilderFee ? builderFeeApproval.error : null) ?? agentRegistration.error,
	};
}
