import type { FrontendOpenOrdersResponse, MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import { buildHistoricalOrderEntries } from "@/lib/trade/order-history";
import { createMarkets } from "../../src/lib/hyperliquid/markets/use-markets";
import { ACCOUNT_TABLES_NOW } from "./account-tables-clock";

/**
 * Fixed account data for the account-table layout fixture (docs/layout-integrity.md). Every value is
 * local: no request leaves the page (ADR 0056). The values are deliberately long where real accounts
 * produce long text: HIP-3 market names, many decimals, large amounts, TP/SL, isolated margin, trigger
 * and TWAP orders, every TWAP status and the longer order statuses and directions.
 */
export const OWNER = "0x1111111111111111111111111111111111111111";
const NOW = ACCOUNT_TABLES_NOW;
const HOUR = 3_600_000;

function perpAsset(name: string, szDecimals: number, maxLeverage: number, onlyIsolated = false) {
	return { name, szDecimals, maxLeverage, marginTableId: maxLeverage, ...(onlyIsolated ? { onlyIsolated } : null) };
}

const mainMeta = {
	universe: [
		perpAsset("BTC", 5, 40),
		perpAsset("ETH", 4, 25),
		perpAsset("HYPE", 2, 10),
		perpAsset("FARTCOIN", 1, 10),
		perpAsset("kPEPE", 0, 10),
	],
	marginTables: [],
	collateralToken: 0,
} as unknown as MetaResponse;

const xyzMeta = {
	universe: [perpAsset("xyz:SMALL2000", 3, 10, true), perpAsset("xyz:XYZ100", 4, 20)],
	marginTables: [],
	collateralToken: 0,
} as unknown as MetaResponse;

const flxMeta = {
	universe: [perpAsset("flx:TSLA", 3, 10)],
	marginTables: [],
	collateralToken: 268,
} as unknown as MetaResponse;

function token(name: string, index: number, szDecimals: number, weiDecimals: number) {
	return {
		name,
		index,
		szDecimals,
		weiDecimals,
		tokenId: `0x${index.toString(16).padStart(32, "0")}`,
		isCanonical: index === 0,
		evmContract: null,
		fullName: null,
		deployerTradingFeeShare: "0",
	};
}

const spotMeta = {
	tokens: [token("USDC", 0, 8, 8), token("HYPE", 150, 2, 8), token("UBTC", 197, 5, 10), token("USDT0", 268, 2, 8)],
	universe: [
		{ tokens: [150, 0], name: "@107", index: 107, isCanonical: false },
		{ tokens: [197, 0], name: "@142", index: 142, isCanonical: false },
	],
} as unknown as SpotMetaResponse;

const perpDexs = [
	null,
	{ name: "xyz", fullName: "XYZ", deployer: OWNER, oracleUpdater: null, feeRecipient: null, deployerFeeScale: "1" },
	{ name: "flx", fullName: "Felix", deployer: OWNER, oracleUpdater: null, feeRecipient: null, deployerFeeScale: "1" },
] as unknown as PerpDexsResponse;

const catalog = createMarkets({
	env: "Mainnet",
	perpMeta: mainMeta,
	spotMeta,
	allPerpMetas: [mainMeta, xyzMeta, flxMeta],
	perpDexs,
	isLoading: false,
	error: null,
});

const marketsValue = {
	...catalog,
	catalogState: { status: "ready" },
	catalogQueries: {},
	retryMarketCatalog: async () => undefined,
};

const MARK_PRICES: Record<string, string> = {
	BTC: "97654.3",
	ETH: "3456.78",
	HYPE: "34.567",
	FARTCOIN: "1.1234",
	kPEPE: "0.012345",
	"xyz:SMALL2000": "2234.56",
	"xyz:XYZ100": "21234.5",
	"flx:TSLA": "356.78",
	"@107": "34.561",
	"@142": "97612",
};

function position(
	coin: string,
	szi: string,
	entryPx: string,
	options: { isolated?: boolean; leverage: number; liquidationPx: string | null; pnl: string; roe: string },
) {
	const dex = coin.includes(":") ? coin.split(":")[0] : "";
	const value = (Math.abs(Number(szi)) * Number(MARK_PRICES[coin] ?? entryPx)).toFixed(2);
	const margin = (Number(value) / options.leverage).toFixed(2);
	return {
		coin,
		dex,
		szi,
		entryPx,
		positionValue: value,
		unrealizedPnl: options.pnl,
		returnOnEquity: options.roe,
		liquidationPx: options.liquidationPx,
		marginUsed: margin,
		maxLeverage: catalog.getMarket(coin)?.kind === "spot" ? 1 : options.leverage,
		leverage: options.isolated
			? { type: "isolated" as const, value: options.leverage, rawUsd: `-${value}` }
			: { type: "cross" as const, value: options.leverage },
		cumFunding: { allTime: "-12345.678901", sinceOpen: "-1234.567891", sinceChange: "-123.456789" },
	};
}

const POSITIONS = [
	position("BTC", "12.34567", "98765.4", { leverage: 40, liquidationPx: "87654.3", pnl: "-12345.6789", roe: "-0.4123" }),
	position("xyz:SMALL2000", "-1234.567", "2345.678", {
		isolated: true,
		leverage: 10,
		liquidationPx: "2567.891",
		pnl: "137037.94",
		roe: "0.4733",
	}),
	position("FARTCOIN", "1234567.8", "1.2345", {
		isolated: true,
		leverage: 5,
		liquidationPx: "0.98765",
		pnl: "-136913.57",
		roe: "-0.4495",
	}),
	position("kPEPE", "-98765432", "0.012345", { leverage: 10, liquidationPx: null, pnl: "0", roe: "0" }),
	position("flx:TSLA", "123.456", "345.67", { leverage: 5, liquidationPx: "280.12", pnl: "1371.6", roe: "0.1607" }),
];

type FrontendOpenOrder = FrontendOpenOrdersResponse[number];
type OrderType = FrontendOpenOrder["orderType"];

interface OrderInput {
	coin: string;
	side: "B" | "A";
	orderType: OrderType;
	sz: string;
	origSz?: string;
	limitPx: string;
	triggerPx?: string;
	reduceOnly?: boolean;
	isPositionTpsl?: boolean;
	tif?: FrontendOpenOrder["tif"];
	children?: FrontendOpenOrder[];
}

function frontendOrder(index: number, input: OrderInput): FrontendOpenOrder {
	const isTrigger = input.triggerPx !== undefined;
	const above =
		(input.orderType.startsWith("Take Profit") && input.side === "A") ||
		(input.orderType.startsWith("Stop") && input.side === "B");
	return {
		coin: input.coin,
		side: input.side,
		limitPx: input.limitPx,
		sz: input.sz,
		oid: 3000 + index,
		timestamp: NOW - index * 1_800_000,
		origSz: input.origSz ?? input.sz,
		triggerCondition: isTrigger ? `Price ${above ? "above" : "below"} ${input.triggerPx}` : "N/A",
		isTrigger,
		triggerPx: input.triggerPx ?? "0.0",
		children: input.children ?? [],
		isPositionTpsl: input.isPositionTpsl ?? false,
		reduceOnly: input.reduceOnly ?? false,
		orderType: input.orderType,
		tif: input.tif === undefined ? (isTrigger ? null : "Gtc") : input.tif,
		cloid: null,
	};
}

const OPEN_ORDERS = [
	frontendOrder(0, { coin: "BTC", side: "B", orderType: "Limit", sz: "1.23456", origSz: "2.5", limitPx: "95000" }),
	frontendOrder(1, {
		coin: "BTC",
		side: "A",
		orderType: "Stop Market",
		sz: "12.34567",
		limitPx: "78123.4",
		triggerPx: "87000",
		reduceOnly: true,
		isPositionTpsl: true,
	}),
	frontendOrder(2, {
		coin: "BTC",
		side: "A",
		orderType: "Take Profit Market",
		sz: "12.34567",
		limitPx: "108000",
		triggerPx: "120000",
		reduceOnly: true,
		isPositionTpsl: true,
	}),
	frontendOrder(3, {
		coin: "xyz:SMALL2000",
		side: "B",
		orderType: "Stop Limit",
		sz: "1234.567",
		limitPx: "2650.5",
		triggerPx: "2600.25",
		reduceOnly: true,
	}),
	frontendOrder(4, {
		coin: "xyz:SMALL2000",
		side: "B",
		orderType: "Take Profit Limit",
		sz: "617.283",
		limitPx: "2090.75",
		triggerPx: "2100.5",
		reduceOnly: true,
	}),
	frontendOrder(5, {
		coin: "FARTCOIN",
		side: "A",
		orderType: "Limit",
		sz: "1234567.8",
		limitPx: "1.5678",
		tif: "Alo",
	}),
	frontendOrder(6, { coin: "@107", side: "B", orderType: "Limit", sz: "12345.67", limitPx: "34.567", tif: "Ioc" }),
	frontendOrder(7, {
		coin: "flx:TSLA",
		side: "B",
		orderType: "Limit",
		sz: "123.456",
		limitPx: "340.12",
		children: [
			frontendOrder(8, {
				coin: "flx:TSLA",
				side: "A",
				orderType: "Take Profit Market",
				sz: "123.456",
				limitPx: "360",
				triggerPx: "400",
				reduceOnly: true,
			}),
			frontendOrder(9, {
				coin: "flx:TSLA",
				side: "A",
				orderType: "Stop Market",
				sz: "123.456",
				limitPx: "280",
				triggerPx: "300",
				reduceOnly: true,
			}),
		],
	}),
];

function twapState(
	coin: string,
	options: {
		side: "B" | "A";
		sz: string;
		executedSz: string;
		minutes: number;
		reduceOnly?: boolean;
		randomize?: boolean;
		ageHours: number;
		stopPx?: string;
		trigger?: { px: string; above: boolean };
	},
) {
	const px = Number(MARK_PRICES[coin] ?? "1");
	return {
		coin,
		executedNtl: (Number(options.executedSz) * px).toFixed(2),
		executedSz: options.executedSz,
		minutes: options.minutes,
		randomize: options.randomize ?? false,
		reduceOnly: options.reduceOnly ?? false,
		side: options.side,
		stopPx: options.stopPx ?? null,
		sz: options.sz,
		timestamp: NOW - options.ageHours * HOUR,
		trigger: options.trigger ?? null,
		user: OWNER,
	};
}

const TWAP_STATES = [
	[
		101,
		twapState("BTC", { side: "B", sz: "12.34567", executedSz: "4.12345", minutes: 1440, randomize: true, ageHours: 3 }),
	],
	[
		102,
		twapState("xyz:SMALL2000", {
			side: "B",
			sz: "1234.567",
			executedSz: "617.283",
			minutes: 30,
			reduceOnly: true,
			ageHours: 0.25,
			stopPx: "2600.25",
			trigger: { px: "2300.5", above: false },
		}),
	],
] as const;

const TWAP_HISTORY = (
	[
		[201, "BTC", { status: "activated" }],
		[202, "xyz:SMALL2000", { status: "waitingForTrigger" }],
		[203, "FARTCOIN", { status: "finished" }],
		[204, "ETH", { status: "terminated" }],
		[205, "flx:TSLA", { status: "stopped" }],
		[206, "kPEPE", { status: "error", description: "Insufficient margin to place order." }],
	] as const
).map(([twapId, coin, status], index) => ({
	time: Math.floor((NOW - index * 6 * HOUR) / 1000),
	state: twapState(coin, {
		side: index % 2 ? "A" : "B",
		sz: coin === "kPEPE" ? "98765432" : "1234.567",
		executedSz: coin === "kPEPE" ? "0" : "617.283",
		minutes: index % 2 ? 30 : 1440,
		randomize: index % 2 === 0,
		reduceOnly: index === 4,
		ageHours: index * 6,
		...(index === 1 ? { trigger: { px: "2300.5", above: false }, stopPx: "2600.25" } : null),
	}),
	status,
	twapId,
}));

function fill(index: number, coin: string, overrides: Record<string, unknown> = {}) {
	return {
		coin,
		px: MARK_PRICES[coin] ?? "1234.56",
		sz: coin === "kPEPE" ? "98765432" : "123456.789",
		side: index % 2 ? "A" : "B",
		time: NOW - index * HOUR,
		startPosition: "0",
		dir: index % 2 ? "Close Long" : "Open Long",
		closedPnl: index % 2 ? "-1234567.89" : "0",
		hash: `0x${(index + 1).toString(16).padStart(64, "a")}`,
		oid: 1000 + index,
		crossed: index % 2 === 0,
		fee: "12345.678901",
		tid: 500 + index,
		feeToken: coin === "flx:TSLA" ? "USDT0" : "USDC",
		twapId: null,
		...overrides,
	};
}

const FILLS = [
	fill(0, "BTC"),
	fill(1, "@107", { dir: "Sell", startPosition: "200000" }),
	fill(2, "xyz:SMALL2000", { dir: "Open Short", side: "A" }),
	fill(3, "flx:TSLA"),
	fill(4, "BTC", { liquidation: { liquidatedUser: OWNER, markPx: "98000", method: "market" } }),
	fill(5, "FARTCOIN", { dir: "Long > Short", startPosition: "1234.5" }),
	fill(6, "kPEPE", { dir: "Close Short", side: "B", closedPnl: "98765.4321" }),
	fill(7, "@142", { dir: "Buy" }),
];

const TWAP_FILLS = [
	fill(10, "BTC", { twapId: 101, sz: "0.41234", dir: "Open Long" }),
	fill(11, "xyz:SMALL2000", { twapId: 102, sz: "61.728", dir: "Close Short", side: "B" }),
	fill(12, "FARTCOIN", { twapId: 203, sz: "12345.6", dir: "Open Long" }),
];

const HISTORY_ORDERS: ReadonlyArray<[string, OrderType, string, boolean, Partial<OrderInput>?]> = [
	["BTC", "Limit", "filled", false, { tif: "Alo" }],
	["@107", "Stop Market", "canceled", true],
	["xyz:SMALL2000", "Take Profit Limit", "marginCanceled", false],
	["flx:TSLA", "Limit", "rejected", true],
	["BTC", "Market", "filled", false, { tif: "FrontendMarket" }],
	["FARTCOIN", "Stop Limit", "triggered", true],
	["ETH", "Take Profit Market", "open", true],
	["kPEPE", "Limit", "reduceOnlyCanceled", true],
	["xyz:XYZ100", "Stop Market", "siblingFilledCanceled", true],
	["BTC", "Limit", "perpMarginRejected", false],
	["HYPE", "Limit", "minTradeNtlRejected", false],
	["xyz:SMALL2000", "Limit", "positionIncreaseAtOpenInterestCapRejected", false],
	["BTC", "Market", "liquidatedCanceled", false, { tif: "LiquidationMarket" }],
	["ETH", "Twap Slice", "filled", false],
	["@142", "Spot Dust Conversion", "filled", false],
	["BTC", "Vault Close", "filled", true],
	["FARTCOIN", "Limit", "canceled", false, { origSz: "2469135.6" }],
];

const ORDERS = HISTORY_ORDERS.map(([coin, orderType, status, reduceOnly, extra], index) => {
	const isTrigger = orderType.startsWith("Stop") || orderType.startsWith("Take Profit");
	const order = frontendOrder(40 + index, {
		coin,
		side: index % 2 ? "A" : "B",
		orderType,
		sz: status === "filled" ? "0.0" : "123456.789",
		origSz: "123456.789",
		limitPx: MARK_PRICES[coin] ?? "98765.4",
		reduceOnly,
		...(isTrigger ? { triggerPx: "97000" } : null),
		...extra,
	});
	return { status, statusTimestamp: NOW - index * 2 * HOUR, order: { ...order, timestamp: order.timestamp - 60_000 } };
});

const FUNDINGS = ["BTC", "xyz:SMALL2000", "flx:TSLA", "FARTCOIN", "kPEPE"].map((coin, index) => ({
	coin,
	fundingRate: index % 2 ? "-0.00012345" : "0.00012345",
	szi: index % 2 ? "-123456.789" : "123456.789",
	time: NOW - index * HOUR,
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

const PERP_SUMMARY = {
	accountValue: "4567890.12",
	totalNtlPos: "6789012.34",
	totalRawUsd: "1234567.89",
	totalMarginUsed: "567890.12",
};

const BALANCES = {
	dex: "",
	allDexClearinghouseStates: [],
	hasAllDexsSnapshot: true,
	hasSpotStateSnapshot: true,
	marginSummary: PERP_SUMMARY,
	perpSummary: PERP_SUMMARY,
	perpPositions: [],
	spotBalances: [
		{ coin: "USDC", token: 0, total: "123456.78", hold: "1234.5", entryNtl: "0" },
		{ coin: "HYPE", token: 150, total: "1234.56", hold: "0", entryNtl: "40000" },
	],
	spotAvailableAfterMaintenance: [],
	portfolioMarginRatio: null,
	accountAbstraction: "unifiedAccount" as const,
	perpsAtOpenInterestCap: [],
	withdrawable: "123456.78",
	crossMaintenanceMarginUsed: "12345.67",
	spotStateStatus: "success" as const,
	perpStateStatus: "success" as const,
	spotStateReceivedAt: NOW,
	perpStateReceivedAt: NOW,
	isPerpStateStale: false,
	isSpotStateStale: false,
	isDataStale: false,
	isLoading: false,
	hasError: false,
};

export function getFixtureDefaultBalances() {
	return BALANCES;
}

export function useWalletSession() {
	return {
		address: OWNER,
		authenticated: true,
		hasWalletAccess: true,
		isConnected: true,
		isResolving: false,
		ready: true,
		sessionMode: "wallet",
		user: null,
		walletIntent: "external",
	};
}

export function useGeoRestriction() {
	return {
		actionsBlocked: false,
		tradeRestricted: false,
		country: "GB",
		proxy: false,
		isResolving: false,
		isError: false,
		isResolved: true,
		retry: async () => undefined,
	};
}

export function useHyperliquid() {
	return { clientKey: OWNER, env: "Mainnet", info: {} };
}

export function useHyperliquidOptional() {
	return useHyperliquid();
}

export function useMarkets() {
	return marketsValue;
}

function marketInfo(coin: string) {
	const market = marketsValue.getMarket(coin);
	if (!market) return undefined;
	const markPx = MARK_PRICES[coin];
	return {
		...market,
		markPx,
		midPx: markPx,
		oraclePx: markPx,
		markPriceStatus: "success" as const,
		markPriceReceivedAt: NOW,
		midPriceReceivedAt: NOW,
		marginMetadataReady: true,
		assetContextLive: true,
	};
}

export function useMarketsInfo() {
	return { getMarketInfo: marketInfo, isLoading: false, error: null };
}

export function useSelectedMarketInfo() {
	return { data: marketInfo("BTC"), isLoading: false, error: null, isResolved: true };
}

export function useUserPositions() {
	return {
		positions: POSITIONS,
		getPosition: (coin: string, dex = "") =>
			POSITIONS.find((entry) => entry.coin === coin && entry.dex === dex) ?? null,
		hasPosition: (coin: string, dex = "") => POSITIONS.some((entry) => entry.coin === coin && entry.dex === dex),
		withdrawable: BALANCES.withdrawable,
		isLoading: false,
		hasError: false,
		isStale: false,
		receivedAt: NOW,
	};
}

export function useSubscription(method: string) {
	if (method === "openOrders") {
		return { data: { user: OWNER, dex: "ALL_DEXS", orders: OPEN_ORDERS }, status: "active", isStale: false, error: null };
	}
	if (method === "twapStates") {
		return { data: { user: OWNER, dex: "ALL_DEXS", states: TWAP_STATES }, status: "active", isStale: false, error: null };
	}
	return { data: undefined, status: "active", isStale: false, error: null };
}

export function useInfo() {
	return {
		data: undefined,
		dataUpdatedAt: 0,
		error: null,
		isError: false,
		isFetchedAfterMount: false,
		isFetching: false,
		isLoading: false,
		isPending: false,
		isPlaceholderData: false,
		isSuccess: false,
		refetch: async () => undefined,
		status: "pending",
	};
}

export function useExchange() {
	return { error: null, isPending: false, mutate: () => undefined, mutateAsync: async () => undefined, reset: () => {} };
}

export function useTradingStatus() {
	return { isReady: true, needsTrading: false, status: "ready" };
}

export function useLegalStatus() {
	return { data: { status: "accepted" }, status: "success", isLoading: false, error: null };
}

export function useTermsAcceptance() {
	return { accept: async () => undefined, isPending: false, error: null };
}

export function classifyLegalStatusError() {
	return "unknown";
}

export function getAccountLedgerRefreshKey() {
	return undefined;
}

export function getExplorerTxUrl(hash: string) {
	return `http://127.0.0.1:4192/explorer/tx/${hash}`;
}

export function getInfoClient() {
	return {};
}

export function getSubscriptionClient() {
	return {};
}

export function parseAssetId(assetId: number) {
	return assetId >= 100_000
		? { kind: "builderPerp", dexIndex: Math.floor((assetId - 100_000) / 10_000), index: assetId % 10_000 }
		: { kind: "perp", index: assetId };
}

export function useAccountOverview() {
	return { accountAbstraction: "unifiedAccount", defaultBalances: BALANCES, fundsActionsReady: true };
}

export function useDepositAvailability() {
	return {
		available: true,
		path: "external",
		reason: null,
		releasePathEnabled: true,
		signerReady: true,
		geoResolutionStatus: "resolved",
		unavailableLabel: "",
		unavailableReason: null,
	};
}

export function useFundsActionAvailability() {
	const available = { available: true, reason: null, unavailableReason: null };
	return { assertFreshGeoAllowed: async () => undefined, internalTransfer: available, withdrawal: available };
}

export function useMarketNavigation() {
	return () => undefined;
}

export function usePositionMarketCloseAction() {
	return { open: () => undefined, pendingAssetId: null };
}

export function usePositionCloseAllAction() {
	return { canOpen: true, open: () => undefined, unavailableReason: null };
}

export function useTwapCancel() {
	return { cancelTwap: () => undefined, cancellingTwapId: null, feedback: null };
}

const historyPage = {
	canConfirmEmpty: true,
	error: null,
	hasMore: false,
	isConnected: true,
	isRealtimeDegraded: false,
	loadMore: () => undefined,
	realtimeError: null,
	retryRealtime: () => undefined,
	status: "ready" as const,
};

export function useTwapHistory() {
	return { ...historyPage, history: TWAP_HISTORY, latestHistory: TWAP_HISTORY };
}

export function useTwapSliceFills() {
	return { ...historyPage, fills: TWAP_FILLS };
}

export function useTwapFillHistoryCsv() {
	return { exportCsv: async () => undefined, isExporting: false };
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

const ORDER_ENTRIES = buildHistoricalOrderEntries(ORDERS as Parameters<typeof buildHistoricalOrderEntries>[0]);

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
