import Big from "big.js";
import { toBig, toFixed } from "@/lib/trade/numbers";
import type { BridgeToken } from "./use-balances";

type BridgeAmountToken = Pick<BridgeToken, "amount" | "decimals" | "priceUSD">;

function floorDivNonNegative(numerator: Big, denominator: Big): Big {
	let quotient = numerator.div(denominator).round(0, Big.roundDown);
	while (quotient.gt(0) && quotient.times(denominator).gt(numerator)) {
		quotient = quotient.minus(1);
	}
	while (quotient.plus(1).times(denominator).lte(numerator)) {
		quotient = quotient.plus(1);
	}
	return quotient;
}

function formatAtomicTokenAmount(atomicAmount: Big, decimals: number): string {
	const digits = toFixed(atomicAmount, 0);
	if (decimals <= 0) return digits;
	const padded = digits.padStart(decimals + 1, "0");
	const splitIndex = padded.length - decimals;
	return `${padded.slice(0, splitIndex)}.${padded.slice(splitIndex)}`;
}

function isExactInteger(value: Big): boolean {
	return value.round(0, Big.roundDown).eq(value);
}

export function getBridgeMaxTokenAmount(token: BridgeAmountToken): string | null {
	if (!Number.isInteger(token.decimals) || token.decimals < 0) return null;
	const atomicBalance = toBig(token.amount);
	const price = toBig(token.priceUSD);
	if (!atomicBalance || !price || atomicBalance.lte(0) || price.lte(0) || !isExactInteger(atomicBalance)) return null;
	return formatAtomicTokenAmount(atomicBalance, token.decimals);
}

export function getBridgeUsdShortcut(token: BridgeAmountToken, percent: number): string {
	if (!Number.isInteger(token.decimals) || token.decimals < 0 || percent <= 0) return "0.00";
	const atomicBalance = toBig(token.amount);
	const price = toBig(token.priceUSD);
	if (!atomicBalance || !price || atomicBalance.lte(0) || price.lte(0) || !isExactInteger(atomicBalance)) return "0.00";

	const numerator = atomicBalance.times(price).times(percent);
	const denominator = Big(10).pow(token.decimals);
	const cents = floorDivNonNegative(numerator, denominator);
	return toFixed(cents.div(100), 2);
}

export function resolveBridgeTokenAmount(usdInput: string, token: BridgeAmountToken): string | null {
	if (!usdInput || usdInput === "." || !Number.isInteger(token.decimals) || token.decimals < 0) return null;
	const usd = toBig(usdInput);
	const atomicBalance = toBig(token.amount);
	const price = toBig(token.priceUSD);
	if (
		!usd ||
		!atomicBalance ||
		!price ||
		usd.lte(0) ||
		atomicBalance.lte(0) ||
		price.lte(0) ||
		!isExactInteger(atomicBalance)
	) {
		return null;
	}

	const scale = Big(10).pow(token.decimals);
	const requestedUsdScaled = usd.times(scale);
	const balanceUsdScaled = atomicBalance.times(price);
	if (requestedUsdScaled.gt(balanceUsdScaled)) return null;

	const requestedAtomic = floorDivNonNegative(requestedUsdScaled, price);
	if (requestedAtomic.lte(0) || requestedAtomic.gt(atomicBalance)) return null;

	return formatAtomicTokenAmount(requestedAtomic, token.decimals);
}
