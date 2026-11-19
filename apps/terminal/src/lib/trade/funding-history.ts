import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { getToolbarFundingTotal } from "@/domain/trade/trading-toolbar-metrics";
import type { FormatOptions, NumberFormatters } from "@/lib/format";
import type { UnifiedMarket } from "@/lib/hyperliquid";
import { getFundingCollateralSymbol, getFundingCollateralToken } from "@/lib/trade/collateral-amount";
import { toBig } from "@/lib/trade/numbers";
import type { UserFunding } from "@/lib/trade/user-funding";

export const FUNDING_HISTORY_WINDOW_DAYS = 30;
export const FUNDING_HISTORY_WINDOW_MS = FUNDING_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const FUNDING_HISTORY_PAGE_SIZES = [5, 10, 25, 50] as const;
export const DEFAULT_FUNDING_HISTORY_PAGE_SIZE = 25;

export type FundingHistoryPageSize = (typeof FUNDING_HISTORY_PAGE_SIZES)[number];
export type FundingHistorySideFilter = "all" | "long" | "short";

export interface FundingHistoryPage {
	currentPage: number;
	endIndex: number;
	rows: UserFunding[];
	startIndex: number;
	totalPages: number;
}

const FUNDING_HISTORY_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function isFundingHistoryAddress(value: unknown): value is `0x${string}` {
	return typeof value === "string" && FUNDING_HISTORY_ADDRESS_PATTERN.test(value);
}

export function isFundingHistoryPageSize(value: number): value is FundingHistoryPageSize {
	return FUNDING_HISTORY_PAGE_SIZES.some((pageSize) => pageSize === value);
}

export function isFundingHistorySideFilter(value: unknown): value is FundingHistorySideFilter {
	return value === "all" || value === "long" || value === "short";
}

export function getFundingHistoryMarkets(fundings: readonly UserFunding[]): string[] {
	return [...new Set(fundings.map((funding) => funding.coin))].sort();
}

export function getFundingHistorySide(positionSize: string): Exclude<FundingHistorySideFilter, "all"> | null {
	const size = toBig(positionSize);
	if (!size || size.eq(0)) return null;
	return size.gt(0) ? "long" : "short";
}

export function filterFundingHistory(
	fundings: readonly UserFunding[],
	market: string | null,
	side: FundingHistorySideFilter,
): UserFunding[] {
	return fundings.filter(
		(funding) =>
			(market === null || funding.coin === market) && (side === "all" || getFundingHistorySide(funding.szi) === side),
	);
}

/**
 * Funding paid or received in one collateral. Payments in different collaterals are never added
 * together; a HIP-3 payment whose collateral the catalog cannot tell has no amount, not a USDC guess.
 */
export interface FundingTotal {
	token: string | null;
	symbol: string | null;
	amount: string | null;
}

export function getFundingTotals(
	fundings: readonly UserFunding[],
	getMarket: (coin: string) => UnifiedMarket | undefined,
): FundingTotal[] {
	const groups = new Map<string | null, { symbol: string | null; payments: UserFunding[] }>();
	for (const funding of fundings) {
		const market = getMarket(funding.coin);
		const token = getFundingCollateralToken(funding.coin, market);
		let group = groups.get(token);
		if (!group) {
			group = { symbol: getFundingCollateralSymbol(funding.coin, market) ?? token, payments: [] };
			groups.set(token, group);
		}
		group.payments.push(funding);
	}
	if (groups.size === 0) return [{ token: DEFAULT_QUOTE_TOKEN, symbol: DEFAULT_QUOTE_TOKEN, amount: "0" }];
	return Array.from(groups, ([token, { symbol, payments }]) => ({
		token,
		symbol,
		amount: token === null ? null : getToolbarFundingTotal(payments),
	})).sort(compareFundingTotals);
}

/** USDC first, other collaterals by protocol name, payments of unknown collateral last. */
function compareFundingTotals(left: FundingTotal, right: FundingTotal): number {
	return getFundingTotalRank(left) - getFundingTotalRank(right) || (left.token ?? "").localeCompare(right.token ?? "");
}

function getFundingTotalRank(total: FundingTotal): number {
	if (total.token === DEFAULT_QUOTE_TOKEN) return 0;
	return total.token === null ? 2 : 1;
}

const fundingTotalFormat: FormatOptions = { compact: false, signDisplay: "exceptZero" };

export function formatFundingTotal(
	total: FundingTotal,
	{ formatUSD, formatToken }: Pick<NumberFormatters, "formatUSD" | "formatToken">,
): string {
	if (total.token === DEFAULT_QUOTE_TOKEN) return formatUSD(total.amount, fundingTotalFormat);
	return formatToken(total.amount, { ...fundingTotalFormat, decimals: 2, symbol: total.symbol ?? undefined });
}

export function getFundingHistoryPage(
	fundings: readonly UserFunding[],
	requestedPage: number,
	pageSize: FundingHistoryPageSize,
): FundingHistoryPage {
	const totalPages = Math.max(1, Math.ceil(fundings.length / pageSize));
	const normalizedPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
	const currentPage = Math.min(Math.max(normalizedPage, 1), totalPages);
	const startIndex = (currentPage - 1) * pageSize;
	const endIndex = Math.min(startIndex + pageSize, fundings.length);

	return {
		currentPage,
		endIndex,
		rows: fundings.slice(startIndex, endIndex),
		startIndex,
		totalPages,
	};
}
