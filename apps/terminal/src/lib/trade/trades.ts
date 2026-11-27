import type { TradesWsEvent } from "@nktkas/hyperliquid";
import Big from "big.js";
import { formatTime, type NumberFormatters, szDecimalsToPriceDecimals } from "@/lib/format";
import { BIG_ZERO, toBig, toNumber } from "@/lib/trade/numbers";
import { getPriceGroupingOptions } from "@/lib/trade/orderbook";

export type RawTrade = TradesWsEvent[number];

export type ProcessedTrade = {
	id: string;
	hash: string;
	time: string;
	price: string;
	size: string;
	side: "buy" | "sell";
};

export function getTradeKey(time: number, coin: string, tid: number | string): string {
	return `${time}:${coin}:${tid}`;
}

export function getTradePriceDecimals(
	markPx: string | number | null | undefined,
	szDecimals: number,
	marketType: "perp" | "spot",
): number {
	const markPrice = toNumber(markPx);
	const maxPriceDecimals = szDecimalsToPriceDecimals(szDecimals, marketType);
	return getPriceGroupingOptions(markPrice ?? undefined, maxPriceDecimals)[0]?.decimals ?? maxPriceDecimals;
}

function getBigPriceDisplayDecimals(value: Big, maxDecimals: number): number {
	if (value.eq(0)) return maxDecimals;
	return Math.max(0, Math.min(4 - value.e, maxDecimals));
}

export function getTradeRowPriceDecimals(
	price: string | number | null | undefined,
	szDecimals: number,
	marketType: "perp" | "spot",
): number {
	const maxPriceDecimals = szDecimalsToPriceDecimals(szDecimals, marketType);
	const exactPrice = toBig(price);
	if (!exactPrice || exactPrice.lte(0)) return maxPriceDecimals;
	const initialDecimals = getBigPriceDisplayDecimals(exactPrice, maxPriceDecimals);
	const rounded = exactPrice.round(initialDecimals, Big.roundHalfUp);
	return getBigPriceDisplayDecimals(rounded, maxPriceDecimals);
}

export function formatTradeDecimal(
	value: string | number | null | undefined,
	decimals: number,
	formatDecimalString: NumberFormatters["formatDecimalString"],
): string {
	const parsed = toBig(value);
	if (!parsed) return formatDecimalString(null);
	const places = Number.isFinite(decimals) ? Math.max(0, Math.trunc(decimals)) : 0;
	const rounded = parsed.round(places, Big.roundHalfUp);
	return formatDecimalString((rounded.eq(0) ? BIG_ZERO : rounded).toFixed(places));
}

export function processTrades(trades: RawTrade[], locale?: string): ProcessedTrade[] {
	return trades.map((trade) => ({
		id: getTradeKey(trade.time, trade.coin, trade.tid),
		hash: trade.hash,
		time: formatTime(trade.time, {
			locale,
			hour: "2-digit",
			hourCycle: "h23",
			minute: "2-digit",
			second: "2-digit",
		}),
		price: trade.px,
		size: trade.sz,
		side: trade.side === "B" ? "buy" : "sell",
	}));
}

export interface InitialTrades {
	coin: string;
	ids: Set<string> | null;
}

/**
 * The trades a panel treats as history rather than as new fills: the first displayable snapshot of
 * the coin it subscribes to. A change of coin drops the old set at once, so returning to a market
 * re-captures it from that market's next snapshot. Returns `stored` unchanged when nothing changes,
 * so a caller can keep the result in state and update it only when the identity differs.
 */
export function getInitialTrades(
	stored: InitialTrades,
	coin: string,
	processed: readonly { id: string }[],
): InitialTrades {
	if (stored.coin === coin && (stored.ids !== null || processed.length === 0)) return stored;
	return { coin, ids: processed.length > 0 ? new Set(processed.map((trade) => trade.id)) : null };
}
