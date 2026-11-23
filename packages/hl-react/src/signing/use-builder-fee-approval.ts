import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useExchange } from "../hooks/useExchange";
import {
	assertExchangeSigningDeadline,
	ExchangeRequestInvalidatedError,
	type ExchangeSigningDeadlineSlot,
	startExchangeActionDeadline,
} from "../internal/exchange/request-scheduler";
import { useHyperliquid } from "../provider";
import { convertFeeToPercentageString } from "./agent-utils";
import { useHyperliquidOwnerSigner } from "./owner-signer-provider";
import type { RegistrationStatus } from "./types";
import { useTradingStatus } from "./use-trading-status";
import { withWalletApprovalTimeout } from "./wallet-approval-timeout";

const WALLET_CHANGED_MESSAGE = "Wallet changed during builder fee approval";

export interface UseBuilderFeeApprovalResult {
	/** `deadline` is the explicit authorization's (ADR 0053); without it the approval starts its own. */
	approve: (deadline?: ExchangeSigningDeadlineSlot) => Promise<void>;
	status: RegistrationStatus;
	error: Error | null;
	reset: () => void;
}

export function useBuilderFeeApproval(): UseBuilderFeeApprovalResult {
	const { builderConfig, clientKey } = useHyperliquid();
	const ownerSigner = useHyperliquidOwnerSigner();
	const address = clientKey === "disconnected" ? undefined : (clientKey as Address);
	const addressRef = useRef(address);
	addressRef.current = address;
	const [isAwaitingWallet, setIsAwaitingWallet] = useState(false);
	const mountedRef = useRef(true);
	const agentStatus = useTradingStatus();
	const approveBuilderFee = useExchange("approveBuilderFee");

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	function setAwaitingWallet(value: boolean) {
		if (mountedRef.current) setIsAwaitingWallet(value);
	}

	function assertSameWallet(startAddress: Address) {
		ownerSigner?.assertCurrent();
		if (addressRef.current?.toLowerCase() !== startAddress.toLowerCase()) {
			throw new Error(WALLET_CHANGED_MESSAGE);
		}
	}

	function walletChangedAfterSubmission(error: unknown): unknown {
		if (error instanceof ExchangeRequestInvalidatedError) return new Error(WALLET_CHANGED_MESSAGE, { cause: error });
		return error;
	}

	function assertSameWalletAfterSubmission(startAddress: Address) {
		try {
			assertSameWallet(startAddress);
		} catch (error) {
			throw walletChangedAfterSubmission(error);
		}
	}

	async function confirmAfterSubmission() {
		try {
			return await agentStatus.refetchBuilderFee();
		} catch (error) {
			throw walletChangedAfterSubmission(error);
		}
	}

	const approval = useMutation({
		mutationKey: ["hl", "builderFeeApproval", address],
		mutationFn: async (flowDeadline?: ExchangeSigningDeadlineSlot): Promise<void> => {
			const deadline = flowDeadline ?? startExchangeActionDeadline();
			const startAddress = address;
			if (!startAddress) throw new Error("No wallet connected");
			assertSameWallet(startAddress);

			const requirements = await agentStatus.refetchBuilderFee();
			assertSameWallet(startAddress);
			if (!requirements.needsBuilderFee) return;
			if (!builderConfig?.b || builderConfig.f === undefined)
				throw new Error("Builder fee configuration is unavailable");
			assertExchangeSigningDeadline(deadline);

			setAwaitingWallet(true);
			const approvalPromise = approveBuilderFee.mutateAsync({
				builder: builderConfig.b,
				maxFeeRate: convertFeeToPercentageString(builderConfig.f),
			});
			try {
				await withWalletApprovalTimeout(approvalPromise);
			} catch (error) {
				void approvalPromise
					.then(() => {
						assertSameWallet(startAddress);
						return agentStatus.refetchBuilderFee();
					})
					.catch(() => undefined);
				throw error;
			} finally {
				setAwaitingWallet(false);
			}

			assertSameWalletAfterSubmission(startAddress);
			const confirmed = await confirmAfterSubmission();
			assertSameWalletAfterSubmission(startAddress);
			if (confirmed.needsBuilderFee) throw new Error("Builder fee approval could not be confirmed");
		},
	});

	let status: RegistrationStatus = "idle";
	if (approval.isError) status = "error";
	else if (approval.isPending) status = isAwaitingWallet ? "approving_fee" : "verifying";

	function reset() {
		approval.reset();
		setIsAwaitingWallet(false);
	}

	return {
		approve: approval.mutateAsync,
		status,
		error: approval.error,
		reset,
	};
}
