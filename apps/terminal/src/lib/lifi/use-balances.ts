import type { ChainType, ExtendedChain, WalletTokenExtended } from "@lifi/sdk";
import { getChains, getWalletBalances } from "@lifi/sdk";
import { focusManager, useQuery, useQueryClient } from "@tanstack/react-query";
import Big from "big.js";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDataReceivedSinceMount } from "@/hooks/portfolio/use-data-received-since-mount";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { getPassiveQueryState, type PassiveQueryState } from "@/lib/passive-query-state";

const DUST_THRESHOLD_USD = 2;
const BRIDGE_BALANCES_STALE_TIME_MS = 60_000;

function subscribeForeground(onChange: () => void) {
	const unsubscribeFocus = focusManager.subscribe(onChange);
	if (typeof document === "undefined") return unsubscribeFocus;
	document.addEventListener("visibilitychange", onChange);
	return () => {
		unsubscribeFocus();
		document.removeEventListener("visibilitychange", onChange);
	};
}

function isDocumentForeground(): boolean {
	if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
	return focusManager.isFocused();
}

export interface BridgeToken {
	chainId: number;
	address: string;
	symbol: string;
	name: string;
	decimals: number;
	logoURI: string | undefined;
	priceUSD: string;
	amount: string;
	amountUSD: number;
	chainName: string;
	chainLogoURI: string | undefined;
	isDust: boolean;
}

function buildTokenList(
	balancesByChain: Record<number, WalletTokenExtended[]>,
	chainsMap: Map<number, ExtendedChain>,
): BridgeToken[] {
	const tokens: BridgeToken[] = [];

	for (const [chainIdStr, chainTokens] of Object.entries(balancesByChain)) {
		const chainId = Number(chainIdStr);
		const chain = chainsMap.get(chainId);

		for (const token of chainTokens) {
			if (!token.amount || token.amount === "0") continue;

			const scale = Big(10).pow(token.decimals);
			const exactUsdNumerator = Big(token.amount).times(token.priceUSD || "0");
			if (exactUsdNumerator.lte(0)) continue;

			const amountUSD = exactUsdNumerator.div(scale).toNumber();
			const isDust = exactUsdNumerator.lt(scale.times(DUST_THRESHOLD_USD));

			tokens.push({
				chainId,
				address: token.address,
				symbol: token.symbol,
				name: token.name,
				decimals: token.decimals,
				logoURI: token.logoURI,
				priceUSD: token.priceUSD,
				amount: token.amount,
				amountUSD,
				chainName: chain?.name ?? `Chain ${chainId}`,
				chainLogoURI: chain?.logoURI,
				isDust,
			});
		}
	}

	tokens.sort((a, b) => b.amountUSD - a.amountUSD);
	return tokens;
}

export function useBridgeBalances(walletAddress: string | undefined) {
	const normalizedAddress = walletAddress?.toLowerCase() ?? "";
	const queryClient = useQueryClient();
	const isOnline = useOnlineStatus();
	const isForeground = useSyncExternalStore(subscribeForeground, isDocumentForeground, () => true);
	const mountedRef = useRef(true);
	const attemptedRefreshKeysRef = useRef<Set<string>>(new Set());
	const [refreshStatusByKey, setRefreshStatusByKey] = useState<Record<string, "in-flight" | "settled">>({});
	const query = useQuery({
		queryKey: ["lifi-balances", normalizedAddress],
		queryFn: async () => {
			const [balancesByChain, chains] = await Promise.all([
				getWalletBalances(walletAddress as string),
				getChains({ chainTypes: ["EVM" as ChainType] }),
			]);

			const chainsMap = new Map<number, ExtendedChain>();
			for (const chain of chains) {
				chainsMap.set(chain.id, chain);
			}

			return buildTokenList(balancesByChain, chainsMap);
		},
		enabled: !!walletAddress,
		staleTime: BRIDGE_BALANCES_STALE_TIME_MS,
		refetchOnWindowFocus: () => isDocumentForeground(),
		refetchOnReconnect: () => isDocumentForeground(),
	});
	const receivedSinceMount = useDataReceivedSinceMount(normalizedAddress, query.dataUpdatedAt);
	const hasSnapshot = Array.isArray(query.data);
	const snapshotKey = hasSnapshot ? `${normalizedAddress}:${query.dataUpdatedAt}` : null;
	const isFetching = query.fetchStatus === "fetching";
	const isStaleIdle =
		Boolean(walletAddress) &&
		isOnline &&
		hasSnapshot &&
		query.isStale &&
		!query.isError &&
		query.fetchStatus === "idle";
	const staleRefreshKey = isStaleIdle && isForeground ? snapshotKey : null;
	const staleFetchingKey = Boolean(walletAddress) && hasSnapshot && query.isStale && isFetching ? snapshotKey : null;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (!staleFetchingKey) return;
		attemptedRefreshKeysRef.current.add(staleFetchingKey);
		setRefreshStatusByKey((prev) => (prev[staleFetchingKey] ? prev : { ...prev, [staleFetchingKey]: "settled" }));
	}, [staleFetchingKey]);

	useEffect(() => {
		if (!staleRefreshKey) return;
		if (attemptedRefreshKeysRef.current.has(staleRefreshKey)) return;
		attemptedRefreshKeysRef.current.add(staleRefreshKey);
		const refreshKey = staleRefreshKey;
		setRefreshStatusByKey((prev) => ({ ...prev, [refreshKey]: "in-flight" }));
		void queryClient
			.refetchQueries({ exact: true, queryKey: ["lifi-balances", normalizedAddress] }, { cancelRefetch: false })
			.finally(() => {
				if (!mountedRef.current) return;
				setRefreshStatusByKey((prev) => ({ ...prev, [refreshKey]: "settled" }));
			});
	}, [normalizedAddress, queryClient, staleRefreshKey]);

	const needsStaleRetry = staleRefreshKey !== null && refreshStatusByKey[staleRefreshKey] === "settled";
	const isSnapshotCurrent =
		Boolean(walletAddress) &&
		isOnline &&
		hasSnapshot &&
		!query.isError &&
		!query.isStale &&
		query.fetchStatus === "idle";
	const failed = query.isError && !isFetching;
	const passiveState: PassiveQueryState = getPassiveQueryState({
		hasData: isSnapshotCurrent || (hasSnapshot && failed),
		failed,
		receivedSinceMount,
	});

	return {
		...query,
		isSnapshotCurrent,
		needsStaleRetry,
		passiveState,
	};
}
