import { useMemo } from "react";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import type { AccountModeSetupKind } from "@/domain/trade/account-mode-setup";
import {
	type BalanceRow,
	getMarketQuoteToken,
	getPerpBalanceRows,
	getSpotBalanceRows,
	isQuoteBalanceSharedWithPerps,
} from "@/domain/trade/balances";
import { getDirectionalAvailableToTrade } from "@/domain/trade/order/availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useOrderSide } from "@/stores/use-order-entry-store";
import { type AccountAbstraction, isSupportedAccountAbstraction, useSelectedDexBalances } from "./use-account-balances";
import { useAccountModeSetupKind } from "./use-account-mode-setup";
import { useActiveAssetData } from "./use-active-asset-data";
import { useSpotTokenUsdPrices } from "./use-spot-token-usd-prices";

interface BalanceRowsState {
	accountAbstraction: AccountAbstraction;
	accountDataReady: boolean;
	accountModeReady: boolean;
	accountModeSetup: AccountModeSetupKind;
	balances: BalanceRow[];
	hasAllDexsSnapshot: boolean;
	hasError: boolean;
	internalTransfersEnabled: boolean;
	isConnected: boolean;
	isDataReady: boolean;
	isDataStale: boolean;
	isLoading: boolean;
	isPending: boolean;
	perpFundsActionsEnabled: boolean;
	perpBalances: BalanceRow[];
	showBalanceAccountType: boolean;
	spotBalanceRows: BalanceRow[];
}

export function useBalanceRows(): BalanceRowsState {
	const { address, isConnected } = useWalletSession();
	const side = useOrderSide();
	const { data: activeAssetData, market, status: activeAssetStatus } = useActiveAssetData();
	const {
		dex,
		hasAllDexsSnapshot,
		marginSummary,
		perpSummary,
		spotBalances,
		spotAvailableAfterMaintenance,
		accountAbstraction,
		withdrawable,
		spotStateStatus,
		perpStateStatus,
		isDataStale,
		isLoading,
		hasError,
	} = useSelectedDexBalances();
	const mids = useSpotTokenUsdPrices(isConnected);
	const isPerpMarket = market?.kind === "perp" || market?.kind === "builderPerp";
	const isSpotMarket = market?.kind === "spot";
	const perpQuoteToken = isPerpMarket ? getMarketQuoteToken(market) : DEFAULT_QUOTE_TOKEN;
	const tradeAvailable = isSpotMarket
		? undefined
		: isPerpMarket && activeAssetStatus === "success"
			? getDirectionalAvailableToTrade(activeAssetData?.availableToTrade, side)
			: null;
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const accountModeSetup = useAccountModeSetupKind(accountAbstraction, address);
	const accountDataReady = perpStateStatus === "success" && spotStateStatus === "success" && !hasError;
	const isDataReady =
		!hasError &&
		!isLoading &&
		!isDataStale &&
		(accountModeReady || accountModeSetup === "awaiting-funds") &&
		accountDataReady;
	const isPending = isLoading || (!accountModeReady && accountModeSetup === "pending");
	const quoteBalanceShared = isQuoteBalanceSharedWithPerps(accountAbstraction);

	const perpBalances = useMemo(
		() =>
			getPerpBalanceRows(perpSummary, spotBalances, spotAvailableAfterMaintenance, accountAbstraction, withdrawable, {
				marginSummary,
				quoteToken: perpQuoteToken,
				tokenUsdPrices: mids,
				tradeAvailable,
			}),
		[
			accountAbstraction,
			marginSummary,
			mids,
			perpSummary,
			perpQuoteToken,
			spotAvailableAfterMaintenance,
			spotBalances,
			tradeAvailable,
			withdrawable,
		],
	);
	const spotBalanceRows = useMemo(
		() => getSpotBalanceRows(spotBalances, spotAvailableAfterMaintenance, accountAbstraction, mids, perpQuoteToken),
		[accountAbstraction, mids, perpQuoteToken, spotAvailableAfterMaintenance, spotBalances],
	);
	const balances = useMemo(() => [...perpBalances, ...spotBalanceRows], [perpBalances, spotBalanceRows]);

	return {
		accountAbstraction,
		accountDataReady,
		accountModeReady,
		accountModeSetup,
		balances,
		hasAllDexsSnapshot: Boolean(hasAllDexsSnapshot),
		hasError,
		internalTransfersEnabled: accountDataReady && accountModeReady && !quoteBalanceShared,
		isConnected,
		isDataReady,
		isDataStale,
		isLoading,
		isPending,
		perpFundsActionsEnabled: accountDataReady && accountModeReady && (quoteBalanceShared || dex === ""),
		perpBalances,
		showBalanceAccountType: accountModeReady && !quoteBalanceShared,
		spotBalanceRows,
	};
}
