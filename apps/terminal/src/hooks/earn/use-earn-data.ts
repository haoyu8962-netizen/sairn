import type { InfoClient } from "@nktkas/hyperliquid";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import {
	buildEarnSnapshot,
	type EarnInterestEntry,
	type EarnReserve,
	type EarnSnapshot,
	type EarnSpotBalance,
	type EarnTokenMeta,
	type EarnUserState,
	getEarnSpotAvailable,
	parseEarnInterest,
	parseEarnReserves,
	parseEarnUserState,
} from "@/domain/earn";
import {
	type AccountAbstraction,
	isSupportedAccountAbstraction,
	isTokenSpotBalance,
	useDefaultDexBalances,
} from "@/hooks/trade/use-account-balances";
import { accountLedgerQueryKey, useAccountLedger } from "@/hooks/trade/use-account-ledger";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { type HyperliquidEnv, infoQueryOptions, useHyperliquid, useInfo, useSpotTokens } from "@/lib/hyperliquid";
import type { AccountLedgerRow } from "@/lib/trade/account-ledger";
import {
	fetchHistoryPageWithRetry,
	fetchTimeRangeHistory,
	requireCompleteHistorySnapshot,
} from "@/lib/trade/history-pagination";

const EARN_REQUEST_TIMEOUT_MS = 10_000;
const EARN_PUBLIC_REFRESH_MS = 30_000;
const EARN_ACCOUNT_REFRESH_MS = 15_000;
const EARN_INTEREST_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const EARN_INTEREST_WINDOW_ALIGN_MS = 60 * 60 * 1000;
const EMPTY_USER = "";

export type EarnDataStatus = "idle" | "loading" | "ready" | "error";

export interface EarnSnapshotInputs {
	tokens: ReadonlyMap<number, EarnTokenMeta>;
	portfolioMargin: boolean;
	spotBalances: ReadonlyMap<number, EarnSpotBalance>;
	availableAfterMaintenance: ReadonlyMap<number, string>;
}

export interface EarnData {
	ownerAddress: `0x${string}` | undefined;
	isConnected: boolean;
	publicStatus: EarnDataStatus;
	accountStatus: EarnDataStatus;
	interestStatus: EarnDataStatus;
	canConfirmEmptyInterest: boolean;
	historyStatus: EarnDataStatus;
	historyRefreshFailed: boolean;
	historyRefreshing: boolean;
	canConfirmEmptyHistory: boolean;
	snapshot: EarnSnapshot | null;
	snapshotInputs: EarnSnapshotInputs;
	accountAbstraction: AccountAbstraction;
	portfolioMargin: boolean;
	spotStateReceivedAt: number | undefined;
	interest: EarnInterestEntry[];
	history: AccountLedgerRow[];
	retryPublic: () => void;
	retryAccount: () => void;
	retryInterest: () => void;
	retryHistory: () => void;
	fetchFreshState: (signal: AbortSignal) => Promise<EarnFreshState | null>;
}

export interface EarnFreshState {
	reserves: EarnReserve[];
	userState: EarnUserState;
}

interface EmptyInterestReceipt {
	monotonicReceivedAt: number;
	receivedAt: number;
}

function getEmptyInterestRemainingMs(
	receipt: EmptyInterestReceipt,
	wallNow: number,
	monotonicNow: number,
	maxAgeMs: number,
): number {
	const wallAgeMs = wallNow - receipt.receivedAt;
	const monotonicAgeMs = monotonicNow - receipt.monotonicReceivedAt;
	if (!Number.isFinite(wallAgeMs) || !Number.isFinite(monotonicAgeMs) || wallAgeMs < 0) return 0;
	return Math.max(0, maxAgeMs - Math.max(wallAgeMs, monotonicAgeMs));
}

function createEmptyInterestFreshnessClock(receipt: EmptyInterestReceipt | undefined, maxAgeMs: number) {
	let fresh =
		receipt !== undefined && getEmptyInterestRemainingMs(receipt, Date.now(), performance.now(), maxAgeMs) > 0;
	return {
		getSnapshot: () => fresh,
		subscribe(onExpired: () => void) {
			if (receipt === undefined || !fresh) return () => {};
			let timeout: ReturnType<typeof setTimeout> | undefined;
			function checkFreshness() {
				if (!fresh || receipt === undefined) return;
				if (timeout !== undefined) clearTimeout(timeout);
				timeout = undefined;
				const remainingMs = getEmptyInterestRemainingMs(receipt, Date.now(), performance.now(), maxAgeMs);
				if (remainingMs > 0) {
					timeout = setTimeout(checkFreshness, remainingMs);
					return;
				}
				fresh = false;
				onExpired();
			}
			checkFreshness();
			window.addEventListener("focus", checkFreshness);
			document.addEventListener("visibilitychange", checkFreshness);
			return () => {
				if (timeout !== undefined) clearTimeout(timeout);
				window.removeEventListener("focus", checkFreshness);
				document.removeEventListener("visibilitychange", checkFreshness);
			};
		},
	};
}

function useEmptyInterestFreshness(receipt: EmptyInterestReceipt | undefined): boolean {
	const clock = useMemo(() => createEmptyInterestFreshnessClock(receipt, EARN_PUBLIC_REFRESH_MS), [receipt]);
	return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
}

function useAccountLedgerQueryError(
	queryClient: QueryClient,
	env: HyperliquidEnv,
	ownerAddress: `0x${string}` | undefined,
): boolean {
	const queryKey = useMemo(() => (ownerAddress ? accountLedgerQueryKey(env, ownerAddress) : null), [env, ownerAddress]);
	return useSyncExternalStore(
		(onStoreChange) => {
			if (!queryKey) return () => {};
			return queryClient.getQueryCache().subscribe(() => {
				onStoreChange();
			});
		},
		() => (queryKey ? queryClient.getQueryState(queryKey)?.status === "error" : false),
		() => false,
	);
}

function useAccountLedgerQueryFetching(
	queryClient: QueryClient,
	env: HyperliquidEnv,
	ownerAddress: `0x${string}` | undefined,
): boolean {
	const queryKey = useMemo(() => (ownerAddress ? accountLedgerQueryKey(env, ownerAddress) : null), [env, ownerAddress]);
	return useSyncExternalStore(
		(onStoreChange) => {
			if (!queryKey) return () => {};
			return queryClient.getQueryCache().subscribe(() => {
				onStoreChange();
			});
		},
		() => (queryKey ? queryClient.getQueryState(queryKey)?.fetchStatus === "fetching" : false),
		() => false,
	);
}

export function getEarnInterestStartTime(now: number): number {
	return Math.floor((now - EARN_INTEREST_LOOKBACK_MS) / EARN_INTEREST_WINDOW_ALIGN_MS) * EARN_INTEREST_WINDOW_ALIGN_MS;
}

interface RawEarnInterest {
	time: number;
	token: string;
}

function isRawEarnInterest(item: unknown): item is RawEarnInterest {
	return (
		typeof item === "object" &&
		item !== null &&
		typeof (item as { time?: unknown }).time === "number" &&
		typeof (item as { token?: unknown }).token === "string"
	);
}

export async function fetchEarnInterest(
	info: InfoClient,
	user: `0x${string}`,
	now: number,
	signal: AbortSignal,
): Promise<unknown[]> {
	const result = await fetchTimeRangeHistory<unknown>({
		startTime: getEarnInterestStartTime(now),
		endTime: now,
		fetchPage: (pageStartTime, pageEndTime, pageSignal) =>
			fetchHistoryPageWithRetry(
				(requestSignal) =>
					info.userBorrowLendInterest({ user, startTime: pageStartTime, endTime: pageEndTime }, requestSignal),
				{ signal: pageSignal },
			),
		getKey: (item) => (isRawEarnInterest(item) ? `${item.time}:${item.token}` : ""),
		getTime: (item) => (isRawEarnInterest(item) ? item.time : Number.NaN),
		validateItem: isRawEarnInterest,
		signal,
	});
	return requireCompleteHistorySnapshot(result);
}

export async function fetchFreshEarnState(
	queryClient: QueryClient,
	info: InfoClient,
	env: HyperliquidEnv,
	user: `0x${string}`,
	signal: AbortSignal,
): Promise<EarnFreshState | null> {
	const requestOptions = { requestTimeoutMs: EARN_REQUEST_TIMEOUT_MS };
	const reservesOptions = infoQueryOptions(info, "allBorrowLendReserveStates", undefined, env, requestOptions);
	const userOptions = infoQueryOptions(info, "borrowLendUserState", { user }, env, requestOptions);
	const cancelPageRequests = () =>
		Promise.all([
			queryClient.cancelQueries({ exact: true, queryKey: reservesOptions.queryKey }),
			queryClient.cancelQueries({ exact: true, queryKey: userOptions.queryKey }),
		]);
	try {
		signal.throwIfAborted();
		await cancelPageRequests();
		signal.throwIfAborted();
		const [rawReserves, rawUserState] = await Promise.all([
			reservesOptions.queryFn({ signal }),
			userOptions.queryFn({ signal }),
		]);
		signal.throwIfAborted();
		await cancelPageRequests();
		signal.throwIfAborted();
		queryClient.setQueryData(reservesOptions.queryKey, rawReserves);
		queryClient.setQueryData(userOptions.queryKey, rawUserState);
		const reserves = parseEarnReserves(rawReserves);
		const userState = parseEarnUserState(rawUserState);
		return reserves && userState ? { reserves, userState } : null;
	} catch (error) {
		if (signal.aborted) throw signal.reason ?? error;
		return null;
	}
}

export function useEarnData(): EarnData {
	const { address, isConnected } = useWalletSession();
	const ownerAddress = isConnected ? address : undefined;
	const user = ownerAddress ?? EMPTY_USER;
	const { env, info } = useHyperliquid();
	const isOnline = useOnlineStatus();
	const queryClient = useQueryClient();
	const balances = useDefaultDexBalances();
	const { tokens: spotTokens } = useSpotTokens();
	const accountQueryOptions = {
		enabled: Boolean(ownerAddress),
		requestTimeoutMs: EARN_REQUEST_TIMEOUT_MS,
		staleTime: 0,
		refetchInterval: EARN_ACCOUNT_REFRESH_MS,
		refetchOnWindowFocus: true,
		retry: 1,
	} as const;
	const reservesQuery = useInfo("allBorrowLendReserveStates", undefined, {
		requestTimeoutMs: EARN_REQUEST_TIMEOUT_MS,
		staleTime: EARN_ACCOUNT_REFRESH_MS,
		refetchInterval: EARN_PUBLIC_REFRESH_MS,
		retry: 1,
	});
	const userStateQuery = useInfo("borrowLendUserState", { user }, accountQueryOptions);
	const interestQuery = useQuery({
		enabled: Boolean(ownerAddress),
		queryKey: ["hl", "earn-interest", env, user.toLowerCase()],
		queryFn: ({ signal }) => fetchEarnInterest(info, user as `0x${string}`, Date.now(), signal),
		refetchInterval: EARN_PUBLIC_REFRESH_MS,
		refetchOnWindowFocus: true,
		retry: 1,
		staleTime: 0,
	});
	const ledger = useAccountLedger({ enabled: Boolean(ownerAddress) });

	const reserves = parseEarnReserves(reservesQuery.data);
	const userState = parseEarnUserState(userStateQuery.data);
	const interest = parseEarnInterest(interestQuery.data);
	const tokens = new Map<number, EarnTokenMeta>(
		spotTokens.map((token) => [
			token.index,
			{
				index: token.index,
				name: token.name,
				displayName: token.displayName,
				weiDecimals: token.weiDecimals,
				szDecimals: token.szDecimals,
			},
		]),
	);
	const portfolioMargin = balances.accountAbstraction === "portfolioMargin";
	const spotBalances = new Map<number, EarnSpotBalance>();
	for (const balance of balances.spotBalances) {
		if (!isTokenSpotBalance(balance)) continue;
		spotBalances.set(balance.token, {
			token: balance.token,
			total: balance.total,
			available: getEarnSpotAvailable(balance, balances.spotAvailableAfterMaintenance),
		});
	}
	const availableAfterMaintenance = new Map<number, string>(
		balances.spotAvailableAfterMaintenance.map(([token, value]) => [Number(token), String(value)]),
	);
	const snapshotInputs: EarnSnapshotInputs = { tokens, portfolioMargin, spotBalances, availableAfterMaintenance };

	const publicMalformed = reservesQuery.data !== undefined && reserves === null;
	let publicStatus: EarnDataStatus = "loading";
	if (reservesQuery.isError || publicMalformed) publicStatus = "error";
	else if (reserves && tokens.size > 0) publicStatus = "ready";

	const spotReady =
		balances.spotStateStatus === "success" &&
		!balances.isSpotStateStale &&
		isSupportedAccountAbstraction(balances.accountAbstraction);
	const accountMalformed = userStateQuery.data !== undefined && userState === null;
	let accountStatus: EarnDataStatus = "idle";
	if (ownerAddress) {
		if (userStateQuery.isError || accountMalformed) accountStatus = "error";
		else if (userState && spotReady) accountStatus = "ready";
		else accountStatus = "loading";
	}

	let interestStatus: EarnDataStatus = "idle";
	if (ownerAddress) {
		if (interestQuery.isError || (interestQuery.data !== undefined && interest === null)) interestStatus = "error";
		else interestStatus = interest ? "ready" : "loading";
	}
	const isEmptyInterest = Boolean(ownerAddress) && interest !== null && interest.length === 0;
	const interestDataUpdatedAt = interestQuery.dataUpdatedAt;
	const emptyInterestReceipt = useMemo((): EmptyInterestReceipt | undefined => {
		if (!isEmptyInterest || interestDataUpdatedAt <= 0) return undefined;
		const wallNow = Date.now();
		const monotonicNow = performance.now();
		const elapsedWallMs = Math.max(0, wallNow - interestDataUpdatedAt);
		return {
			receivedAt: interestDataUpdatedAt,
			monotonicReceivedAt: monotonicNow - elapsedWallMs,
		};
	}, [isEmptyInterest, interestDataUpdatedAt]);
	const emptyInterestFresh = useEmptyInterestFreshness(emptyInterestReceipt);
	const canConfirmEmptyInterest =
		interestStatus === "ready" &&
		Boolean(ownerAddress) &&
		isOnline &&
		!interestQuery.isError &&
		interestQuery.fetchStatus === "idle" &&
		interest !== null &&
		(interest.length > 0 || emptyInterestFresh);

	let historyStatus: EarnDataStatus = "idle";
	if (ownerAddress) {
		if (ledger.status === "error") historyStatus = "error";
		else historyStatus = ledger.status === "ready" ? "ready" : "loading";
	}
	const ledgerQueryFailed = useAccountLedgerQueryError(queryClient, env, ownerAddress);
	const ledgerQueryFetching = useAccountLedgerQueryFetching(queryClient, env, ownerAddress);
	const historyRefreshing = Boolean(ownerAddress) && (ledger.isRefreshing || ledgerQueryFetching);
	const historyRefreshFailed = Boolean(ownerAddress) && (historyStatus === "error" || ledgerQueryFailed);

	const snapshot =
		reserves && tokens.size > 0
			? buildEarnSnapshot({
					reserves,
					userState: accountStatus === "ready" ? userState : null,
					...snapshotInputs,
				})
			: null;

	function fetchFreshState(signal: AbortSignal) {
		if (!ownerAddress) return Promise.resolve(null);
		return fetchFreshEarnState(queryClient, info, env, ownerAddress, signal);
	}

	function retryHistory() {
		if (!ownerAddress) return;
		const queryKey = accountLedgerQueryKey(env, ownerAddress);
		if (ledger.isRefreshing || queryClient.getQueryState(queryKey)?.fetchStatus === "fetching") return;
		if (queryClient.getQueryCache().find({ exact: true, queryKey })) {
			void queryClient.refetchQueries({ exact: true, queryKey }, { cancelRefetch: false });
			return;
		}
		ledger.retry();
	}

	return {
		ownerAddress,
		isConnected,
		publicStatus,
		accountStatus,
		interestStatus,
		canConfirmEmptyInterest,
		historyStatus,
		historyRefreshFailed,
		historyRefreshing,
		canConfirmEmptyHistory: ledger.canConfirmEmpty,
		snapshot,
		snapshotInputs,
		accountAbstraction: balances.accountAbstraction,
		portfolioMargin,
		spotStateReceivedAt: balances.spotStateReceivedAt,
		interest: interest ?? [],
		history: ledger.earnRows,
		retryPublic: () => {
			void reservesQuery.refetch();
		},
		retryAccount: () => {
			void userStateQuery.refetch();
		},
		retryInterest: () => {
			void interestQuery.refetch();
		},
		retryHistory,
		fetchFreshState,
	};
}
