import { formatUnits } from "viem";
import { CCTP_MAX_DEPOSIT_USDC, CCTP_TESTNET_MAX_DEPOSIT_USDC } from "@/config/cctp-deposit";
import type { AmountLimitActionFailure } from "@/lib/errors/action-error";

const USDC_DECIMALS = 6;

/** The Circle limit a deposit of `amountRaw` USDC base units exceeds, or null when it is within both limits. */
export function getCctpDepositLimitFailure(amountRaw: bigint, testnet: boolean): AmountLimitActionFailure | null {
	if (amountRaw > CCTP_MAX_DEPOSIT_USDC) {
		return {
			kind: "action-error",
			code: "cctp-mainnet-deposit-limit",
			amount: formatUnits(CCTP_MAX_DEPOSIT_USDC, USDC_DECIMALS),
		};
	}
	if (testnet && amountRaw > CCTP_TESTNET_MAX_DEPOSIT_USDC) {
		return {
			kind: "action-error",
			code: "cctp-testnet-deposit-limit",
			amount: formatUnits(CCTP_TESTNET_MAX_DEPOSIT_USDC, USDC_DECIMALS),
		};
	}
	return null;
}
