import { createColumnHelper, type SortingFn, type SortingState } from "@tanstack/react-table";
import { getMarketSelectorChange, getMarketSelectorPrice } from "@/domain/market/selector-quote";
import { type Big, toBig } from "@/lib/trade/numbers";
import type { MarketRow, MarketScope } from "./token-selector-categories";
import {
	getLiveSelectorFunding,
	getLiveSelectorOiUsd,
	getLiveSelectorSpotMarketCapUsd,
	getLiveSelectorVolume,
} from "./token-selector-metrics";

export type { MarketRow, MarketScope } from "./token-selector-categories";

export type MarketTableLayout = "default" | "spot";

export const DEFAULT_MARKET_SORT: SortingState = [{ id: "volume", desc: true }];

export function isMarketSortColumnVisible(columnId: string, scope: MarketScope, mobile = false): boolean {
	if (scope === "spot") {
		return columnId !== "oi" && columnId !== "funding";
	}
	if (columnId === "market-cap") return false;
	if (mobile && columnId === "funding") return false;
	return true;
}

export function resolveVisibleMarketSorting(sorting: SortingState, scope: MarketScope, mobile = false): SortingState {
	const active = sorting[0];
	if (!active || isMarketSortColumnVisible(active.id, scope, mobile)) return sorting;
	return DEFAULT_MARKET_SORT;
}

const DEFAULT_MARKET_TABLE_GRID_CLASS = "grid-cols-[minmax(150px,1fr)_100px_160px_130px_140px_150px]";
const SPOT_MARKET_TABLE_GRID_CLASS = "grid-cols-[minmax(150px,1fr)_100px_160px_140px_150px]";

/**
 * The desktop selector is 960px wide with 16px horizontal padding. The default
 * grid has a 890px minimum footprint including its five 12px gaps; with the
 * 32px padding budget that is 922px, inside the 926px bordered content box.
 */
export function getMarketTableGridClass(layout: MarketTableLayout): string {
	return layout === "spot" ? SPOT_MARKET_TABLE_GRID_CLASS : DEFAULT_MARKET_TABLE_GRID_CLASS;
}

const columnHelper = createColumnHelper<MarketRow>();

const numericStringSortFn: SortingFn<MarketRow> = (rowA, rowB, columnId) => {
	const a = Number(rowA.getValue(columnId));
	const b = Number(rowB.getValue(columnId));
	if (Number.isNaN(a) || Number.isNaN(b)) return 0;
	return a - b;
};

const decimalSortFn: SortingFn<MarketRow> = (rowA, rowB, columnId) => {
	const a = rowA.getValue<Big | undefined>(columnId);
	const b = rowB.getValue<Big | undefined>(columnId);
	if (!a || !b) return 0;
	return a.cmp(b);
};

export const TOKEN_SELECTOR_COLUMNS = [
	columnHelper.accessor("pairName", {
		size: 220,
		enableSorting: false,
	}),
	columnHelper.accessor((row: MarketRow) => toBig(getMarketSelectorPrice(row)) ?? undefined, {
		id: "price",
		size: 80,
		sortUndefined: "last",
		sortingFn: decimalSortFn,
	}),
	columnHelper.accessor((row: MarketRow) => getMarketSelectorChange(row)?.ratio, {
		id: "24h-change",
		size: 112,
		sortUndefined: "last",
		sortingFn: decimalSortFn,
	}),
	columnHelper.accessor((row: MarketRow) => getLiveSelectorFunding(row) ?? undefined, {
		id: "funding",
		size: 112,
		sortUndefined: "last",
		sortingFn: numericStringSortFn,
	}),
	columnHelper.accessor((row: MarketRow) => getLiveSelectorVolume(row), {
		id: "volume",
		size: 80,
		sortUndefined: "last",
		sortingFn: numericStringSortFn,
	}),
	columnHelper.accessor((row: MarketRow) => getLiveSelectorSpotMarketCapUsd(row) ?? undefined, {
		id: "market-cap",
		size: 160,
		sortUndefined: "last",
		sortingFn: numericStringSortFn,
	}),
	columnHelper.accessor((row: MarketRow) => getLiveSelectorOiUsd(row) ?? undefined, {
		id: "oi",
		size: 128,
		sortUndefined: "last",
	}),
];
