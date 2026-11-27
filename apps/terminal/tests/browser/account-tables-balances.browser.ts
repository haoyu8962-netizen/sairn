import { getFixtureDefaultBalances } from "./account-tables.browser";

export * from "../../src/hooks/trade/use-account-balances";

export function useDefaultDexBalances() {
	return getFixtureDefaultBalances();
}

export function useSelectedDexBalances() {
	return getFixtureDefaultBalances();
}

export function useDexBalances() {
	return getFixtureDefaultBalances();
}
