const OWNER = "0x1111111111111111111111111111111111111111";
const NOW = Date.UTC(2026, 10, 20, 9, 30, 0);

interface FixtureMarket {
	kind: "perp" | "spot" | "builderPerp";
	name: string;
	pairName: string;
	shortName: string;
	szDecimals: number;
	dex?: string;
	tokensInfo?: { name: string }[];
	quoteToken?: { name: string; displayName: string };
}

const MARKETS: Record<string, FixtureMarket> = {
	BTC: { kind: "perp", name: "BTC", pairName: "BTC-USDC", shortName: "BTC", szDecimals: 5 },
	"@107": {
		kind: "spot",
		name: "@107",
		pairName: "HYPE/USDC",
		shortName: "HYPE",
		szDecimals: 2,
		tokensInfo: [{ name: "HYPE" }, { name: "USDC" }],
	},
	"xyz:SMALL2000": {
		kind: "builderPerp",
		name: "xyz:SMALL2000",
		dex: "xyz",
		pairName: "SMALL2000-USDC",
		shortName: "SMALL2000",
		szDecimals: 3,
		quoteToken: { name: "USDC", displayName: "USDC" },
	},
	"flx:TSLA": {
		kind: "builderPerp",
		name: "flx:TSLA",
		dex: "flx",
		pairName: "TSLA-USDT",
		shortName: "TSLA",
		szDecimals: 3,
		quoteToken: { name: "USDT0", displayName: "USDT" },
	},
};

function fill(index: number, coin: string, overrides: Record<string, unknown> = {}) {
	return {
		coin,
		px: coin === "BTC" ? "98765.4" : "1234.56",
		sz: "123456.789",
		side: index % 2 ? "A" : "B",
		time: NOW - index * 3_600_000,
		startPosition: "0",
		dir: index % 2 ? "Close Long" : "Open Long",
		closedPnl: index % 2 ? "-1234567.89" : "0",
		hash: `0x${(index + 1).toString(16).padStart(64, "a")}`,
		oid: 1000 + index,
		crossed: index % 2 === 0,
		fee: "12345.678901",
		tid: 500 + index,
		feeToken: coin === "flx:TSLA" ? "USDT0" : "USDC",
		...overrides,
	};
}

const FILLS = [
	fill(0, "BTC"),
	fill(1, "@107", { dir: "Sell", startPosition: "200000" }),
	fill(2, "xyz:SMALL2000"),
	fill(3, "flx:TSLA"),
	fill(4, "BTC", { liquidation: { liquidatedUser: OWNER, markPx: "98000", method: "market" } }),
];

const ORDERS = [
	["BTC", "Limit", "filled", false],
	["@107", "Stop Market", "canceled", true],
	["xyz:SMALL2000", "Take Profit Limit", "marginCanceled", false],
	["flx:TSLA", "Limit", "rejected", true],
].map(([coin, orderType, status, reduceOnly], index) => ({
	status,
	statusTimestamp: NOW - index * 7_200_000,
	order: {
		coin,
		isTrigger: orderType !== "Limit",
		limitPx: "98765.4",
		oid: 2000 + index,
		orderType,
		origSz: "123456.789",
		reduceOnly,
		side: index % 2 ? "A" : "B",
		timestamp: NOW - index * 7_200_000 - 60_000,
		triggerPx: orderType === "Limit" ? "0" : "97000",
	},
}));

const ORDER_ENTRIES = ORDERS.map((entry) => ({
	coin: entry.order.coin,
	createdAt: entry.order.timestamp,
	key: `order:${entry.order.oid}`,
	kind: "order",
	order: entry,
	reduceOnly: entry.order.reduceOnly,
	side: entry.order.side,
	size: entry.order.origSz,
	type: entry.order.orderType,
	updatedAt: entry.statusTimestamp,
}));

const FUNDINGS = ["BTC", "xyz:SMALL2000", "flx:TSLA"].map((coin, index) => ({
	coin,
	fundingRate: index % 2 ? "-0.00012345" : "0.00012345",
	szi: index % 2 ? "-123456.789" : "123456.789",
	time: NOW - index * 3_600_000,
	usdc: index % 2 ? "-1234567.89" : "1234567.89",
	nSamples: null,
}));

const READY = {
	error: null,
	hasFailed: false,
	isFetching: false,
	isOffline: false,
	isRefreshing: false,
	refresh: () => undefined,
	status: "ready" as const,
};

export function useWalletSession() {
	return { address: OWNER, isConnected: true, isResolving: false, hasWalletAccess: true };
}

export function useUserFills() {
	return {
		bufferedFills: FILLS,
		error: null,
		isConnected: true,
		isOffline: false,
		isStale: false,
		status: "ready",
		fills: FILLS,
	};
}

export function useTradeHistory() {
	return { ...READY, fills: FILLS, newestFillTime: NOW, reachedLimit: false };
}

export function useHistoricalOrders() {
	return {
		bufferedOrders: ORDERS,
		oldestBufferedStatusTime: null,
		entries: ORDER_ENTRIES,
		error: null,
		isConnected: true,
		isOffline: false,
		isStale: false,
		status: "ready",
		orders: ORDERS,
	};
}

export function useOrderHistory() {
	return { ...READY, newestStatusTime: null, orders: ORDERS, reachedLimit: false };
}

export function useFundingHistory() {
	return { ...READY, fundings: FUNDINGS, rangeEndTime: null, rangeStartTime: null };
}

export function useUserFunding() {
	return {
		bufferedFundings: FUNDINGS,
		oldestBufferedFundingTime: null,
		error: null,
		fundings: FUNDINGS,
		isConnected: true,
		isOffline: false,
		isStale: false,
		status: "ready",
	};
}

const csvExport = () => ({ exportCsv: async () => undefined, isExporting: false });
export const useFundingHistoryCsvExport = csvExport;
export const useHistoricalOrdersCsvExport = csvExport;
export const useUserFillsCsvExport = csvExport;

export function useMarketNavigation() {
	return () => undefined;
}

export function getExplorerTxUrl(hash: string) {
	return `https://explorer.invalid/tx/${hash}`;
}

export function useHyperliquid() {
	return { env: "Mainnet", info: {} };
}

export function useMarkets() {
	return {
		getMarket: (coin: string) => MARKETS[coin],
		getToken: () => undefined,
		getSzDecimals: (coin: string) => MARKETS[coin]?.szDecimals ?? 4,
		getTokenDisplayName: (name: string) => (name === "USDT0" ? "USDT" : name),
	};
}

export function useSubscription() {
	return { data: undefined, status: "active", error: null };
}
