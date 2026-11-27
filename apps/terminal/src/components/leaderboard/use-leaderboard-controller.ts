import { useEffect, useMemo, useRef, useState } from "react";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { getExplorerAddressUrl, useHyperliquid } from "@/lib/hyperliquid";
import {
	LEADERBOARD_API_MAX_QUERY_LENGTH,
	LEADERBOARD_API_PAGE_SIZES,
	type LeaderboardApiPageSize,
} from "@/lib/leaderboard/leaderboard-api";
import {
	getLeaderboardValueTone,
	type LeaderboardPeriod,
	type LeaderboardSortDirection,
	type LeaderboardSortKey,
	normalizeLeaderboardQuery,
	toggleLeaderboardSort,
} from "./leaderboard-domain";
import {
	LEADERBOARD_STALE_TIME_MS,
	type LeaderboardEmptySnapshotReceipt,
	useLeaderboardEmptySnapshotFreshness,
} from "./leaderboard-freshness";
import { useLeaderboardData } from "./use-leaderboard-data";

const LEADERBOARD_SEARCH_DEBOUNCE_MS = 250;

export type LeaderboardPageState = "normal" | "empty" | "noResults" | "loading" | "paused" | "error";
export type LeaderboardDataNotice = "stale" | "refreshError" | "paused" | null;

function isLeaderboardPageSize(value: number): value is LeaderboardApiPageSize {
	return LEADERBOARD_API_PAGE_SIZES.some((pageSize) => pageSize === value);
}

function deriveLeaderboardPageState(
	result: ReturnType<typeof useLeaderboardData>["data"],
	fetchStatus: ReturnType<typeof useLeaderboardData>["fetchStatus"],
	isError: boolean,
	isEmptySnapshotCurrent: boolean,
	normalizedQuery: string,
	isQueryPending: boolean,
	isOnline: boolean,
): LeaderboardPageState {
	const isPaused = fetchStatus === "paused";
	if (result === undefined) {
		if (fetchStatus === "fetching") return "loading";
		return isPaused ? "paused" : "error";
	}
	if (result.totalRows > 0) return "normal";
	if (fetchStatus === "fetching" || isQueryPending) return "loading";
	if (isPaused) return "paused";
	if (!isOnline) return "loading";
	if (isError || result.stale || !isEmptySnapshotCurrent) return "error";
	if (normalizeLeaderboardQuery(result.query) !== normalizedQuery) return "loading";
	return normalizedQuery ? "noResults" : "empty";
}

function deriveLeaderboardDataNotice(
	hasVisibleRows: boolean,
	fetchStatus: ReturnType<typeof useLeaderboardData>["fetchStatus"],
	isError: boolean,
	stale: boolean,
): LeaderboardDataNotice {
	if (!hasVisibleRows) return null;
	if (fetchStatus === "paused") return "paused";
	if (isError) return "refreshError";
	if (stale) return "stale";
	return null;
}

export function useLeaderboardController() {
	const { isTestnet } = useHyperliquid();
	const isOnline = useOnlineStatus();
	const [period, setPeriodState] = useState<LeaderboardPeriod>("month");
	const [sortKey, setSortKey] = useState<LeaderboardSortKey>("pnl");
	const [sortDirection, setSortDirection] = useState<LeaderboardSortDirection>("descending");
	const [query, setQueryState] = useState("");
	const [requestedQuery, setRequestedQuery] = useState("");
	const [page, setPage] = useState(1);
	const [rowsPerPage, setRowsPerPageState] = useState<LeaderboardApiPageSize>(10);
	const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (searchTimeoutRef.current !== null) globalThis.clearTimeout(searchTimeoutRef.current);
		},
		[],
	);

	const normalizedQuery = normalizeLeaderboardQuery(query);
	const normalizedRequestedQuery = normalizeLeaderboardQuery(requestedQuery);
	const isQueryPending = normalizedQuery !== normalizedRequestedQuery;
	const leaderboardQuery = useLeaderboardData({
		env: isTestnet ? "Testnet" : "Mainnet",
		period,
		sortKey,
		sortDirection,
		query: normalizedRequestedQuery,
		page,
		pageSize: rowsPerPage,
	});
	const result = leaderboardQuery.data;
	const dataUpdatedAt = leaderboardQuery.dataUpdatedAt;
	const emptySnapshotReceipt = useMemo((): LeaderboardEmptySnapshotReceipt | undefined => {
		if (result === undefined || result.totalRows > 0 || result.stale) return undefined;
		const wallNow = Date.now();
		const monotonicNow = performance.now();
		const receivedAt = typeof dataUpdatedAt === "number" && dataUpdatedAt > 0 ? dataUpdatedAt : wallNow;
		const elapsedWallMs = Math.max(0, wallNow - receivedAt);
		return {
			receivedAt,
			monotonicReceivedAt: monotonicNow - elapsedWallMs,
		};
	}, [result, dataUpdatedAt]);
	const emptySnapshotFresh = useLeaderboardEmptySnapshotFreshness(emptySnapshotReceipt, LEADERBOARD_STALE_TIME_MS);
	const isEmptySnapshotCurrent = emptySnapshotFresh && leaderboardQuery.isStale !== true;
	const isPaused = leaderboardQuery.fetchStatus === "paused";
	const hasVisibleRows = result !== undefined && result.totalRows > 0;
	const pageState = deriveLeaderboardPageState(
		result,
		leaderboardQuery.fetchStatus,
		leaderboardQuery.isError,
		isEmptySnapshotCurrent,
		normalizedQuery,
		isQueryPending,
		isOnline,
	);
	const dataNotice = deriveLeaderboardDataNotice(
		hasVisibleRows,
		leaderboardQuery.fetchStatus,
		leaderboardQuery.isError,
		result?.stale ?? false,
	);

	function setPeriod(nextPeriod: LeaderboardPeriod) {
		setPeriodState(nextPeriod);
		setPage(1);
	}

	function setQuery(nextQuery: string) {
		if (Array.from(nextQuery).length > LEADERBOARD_API_MAX_QUERY_LENGTH) return;
		setQueryState(nextQuery);
		if (searchTimeoutRef.current !== null) globalThis.clearTimeout(searchTimeoutRef.current);
		searchTimeoutRef.current = globalThis.setTimeout(() => {
			searchTimeoutRef.current = null;
			setRequestedQuery(nextQuery);
			setPage(1);
		}, LEADERBOARD_SEARCH_DEBOUNCE_MS);
	}

	function setSort(nextKey: LeaderboardSortKey) {
		const nextSort = toggleLeaderboardSort(sortKey, sortDirection, nextKey);
		setSortKey(nextSort.sortKey);
		setSortDirection(nextSort.sortDirection);
		setPage(1);
	}

	function setRowsPerPage(nextRowsPerPage: number) {
		if (!isLeaderboardPageSize(nextRowsPerPage)) return;
		setRowsPerPageState(nextRowsPerPage);
		setPage(1);
	}

	function retry() {
		void leaderboardQuery.refetch();
	}

	return {
		pageState,
		dataNotice,
		period,
		sortKey,
		sortDirection,
		query,
		rowsPerPage,
		rows: (result?.rows ?? []).map((row) => ({
			...row,
			pnlTone: getLeaderboardValueTone(row.pnl),
			roiTone: getLeaderboardValueTone(row.roi),
			href: getExplorerAddressUrl(row.address, isTestnet),
		})),
		totalRows: result?.totalRows ?? 0,
		totalPages: result?.totalPages ?? 1,
		page: result?.page ?? page,
		start: result?.start ?? 0,
		end: result?.end ?? 0,
		isRefreshing: hasVisibleRows && leaderboardQuery.fetchStatus === "fetching",
		canRetry: !isPaused && isOnline,
		onPeriodChange: setPeriod,
		onQueryChange: setQuery,
		onClearQuery: () => setQuery(""),
		onSort: setSort,
		onRowsPerPageChange: setRowsPerPage,
		onPreviousPage: () => setPage(Math.max(1, (result?.page ?? page) - 1)),
		onNextPage: () => setPage(Math.min(result?.totalPages ?? 1, (result?.page ?? page) + 1)),
		onRetry: retry,
	};
}

export type LeaderboardController = ReturnType<typeof useLeaderboardController>;
