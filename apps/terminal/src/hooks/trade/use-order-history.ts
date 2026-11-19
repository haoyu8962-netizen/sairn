import type { HistoricalOrdersResponse, InfoClient } from "@nktkas/hyperliquid";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { useHyperliquid } from "@/lib/hyperliquid";
import { isValidHistoricalOrderHistoryItem, mergeHistoricalOrderSources } from "@/lib/trade/historical-orders";
import { fetchHistoryPageWithRetry, MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import { buildOrderHistoryEntries } from "@/lib/trade/order-history";
import {
	isOrderHistoryAddress,
	ORDER_HISTORY_API_LIMIT,
	type OrdinaryOrderHistoryEntry,
} from "@/lib/trade/order-history-page";

const ORDER_HISTORY_STALE_TIME_MS = 30_000;
const EMPTY_ORDERS: HistoricalOrdersResponse = [];

export interface OrderHistorySnapshot {
	orders: HistoricalOrdersResponse;
	reachedLimit: boolean;
	/** Newest status time among the returned orders; null when the endpoint returned none. */
	newestStatusTime: number | null;
}

export type OrderHistoryStatus = "disabled" | "error" | "loading" | "offline" | "ready";

interface OrderHistoryResult {
	entries: OrdinaryOrderHistoryEntry[];
	error: unknown;
	/** The latest request failed; an earlier snapshot may still be in `orders`. */
	hasFailed: boolean;
	isFetching: boolean;
	isOffline: boolean;
	isRefreshing: boolean;
	orders: HistoricalOrdersResponse;
	/** `OrderHistorySnapshot.newestStatusTime` of the snapshot in `orders`. */
	newestStatusTime: number | null;
	reachedLimit: boolean;
	refresh: () => void;
	status: OrderHistoryStatus;
}

interface OrderHistoryOptions {
	enabled?: boolean;
}

export async function fetchOrderHistorySnapshot(
	info: InfoClient,
	user: `0x${string}`,
	signal: AbortSignal,
): Promise<OrderHistorySnapshot> {
	const response = await fetchHistoryPageWithRetry((requestSignal) => info.historicalOrders({ user }, requestSignal), {
		signal,
	});
	if (
		!Array.isArray(response) ||
		response.length > ORDER_HISTORY_API_LIMIT ||
		response.some((entry) => !isValidHistoricalOrderHistoryItem(entry))
	) {
		throw new MalformedHistoryPageError();
	}

	const orders = mergeHistoricalOrderSources(response as HistoricalOrdersResponse);
	return {
		orders,
		reachedLimit: response.length === ORDER_HISTORY_API_LIMIT,
		newestStatusTime: orders[0]?.statusTimestamp ?? null,
	};
}

export function useOrderHistory(
	address: string,
	{ enabled: requested = true }: OrderHistoryOptions = {},
): OrderHistoryResult {
	const { env, info } = useHyperliquid();
	const isOnline = useOnlineStatus();
	const enabled = requested && isOrderHistoryAddress(address);
	const normalizedAddress = address.toLowerCase();
	const query = useQuery({
		enabled,
		queryFn: async ({ signal }): Promise<OrderHistorySnapshot> => {
			if (!isOrderHistoryAddress(address)) throw new Error("Invalid account address.");
			return fetchOrderHistorySnapshot(info, address, signal);
		},
		queryKey: ["hl", "order-history", "historicalOrders", env, normalizedAddress],
		refetchOnReconnect: true,
		refetchOnWindowFocus: false,
		retry: false,
		staleTime: ORDER_HISTORY_STALE_TIME_MS,
	});

	let status: OrderHistoryStatus = "loading";
	if (!enabled) status = "disabled";
	else if (query.data !== undefined) status = "ready";
	else if (!isOnline || query.fetchStatus === "paused") status = "offline";
	else if (query.isError) status = "error";

	const orders = query.data?.orders ?? EMPTY_ORDERS;
	const entries = useMemo(
		() =>
			buildOrderHistoryEntries(orders, []).filter(
				(entry): entry is OrdinaryOrderHistoryEntry => entry.kind === "order",
			),
		[orders],
	);

	return {
		entries,
		error: query.error,
		hasFailed: query.isError,
		isFetching: query.isFetching,
		isOffline: !isOnline || query.fetchStatus === "paused",
		isRefreshing: query.isFetching && query.data !== undefined,
		newestStatusTime: query.data?.newestStatusTime ?? null,
		orders,
		reachedLimit: query.data?.reachedLimit ?? false,
		refresh: () => void query.refetch({ cancelRefetch: false }),
		status,
	};
}
