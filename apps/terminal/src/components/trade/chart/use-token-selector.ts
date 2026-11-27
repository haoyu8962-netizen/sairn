import { useInfo } from "@sairn/hl-react";
import { getCoreRowModel, getSortedRowModel, type Row, type SortingState, useReactTable } from "@tanstack/react-table";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { TOKEN_SELECTOR_OVERSCAN, TOKEN_SELECTOR_ROW_HEIGHT_PX } from "@/config/layout";
import { marketSearchConfig } from "@/config/search";
import type { ExchangeScope } from "@/domain/market";
import { CRYPTO_MARKET_SECTORS } from "@/domain/market/crypto-taxonomy";
import { useMarketsInfo } from "@/lib/hyperliquid";
import { createSearcher, type SearchConfig } from "@/lib/search";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useFavoriteMarkets, useMarketActions } from "@/stores/use-market-store";
import {
	createMarketRows,
	filterMarketRowsByScope,
	getDefaultMarketSubcategory,
	getMarketClassificationState,
	getSpotQuoteSubcategories,
	type MarketSubcategory,
} from "./token-selector-categories";
import {
	DEFAULT_MARKET_SORT,
	type MarketRow,
	type MarketScope,
	resolveVisibleMarketSorting,
	TOKEN_SELECTOR_COLUMNS,
} from "./token-selector-columns";
import { resolveMarketCatalogDisplayState } from "./token-selector-metrics";

const PERP_ANNOTATIONS_STALE_TIME_MS = 5 * 60 * 1_000;

const TRADITIONAL_FINANCE_SUBCATEGORIES: MarketSubcategory[] = [
	{ value: "all", label: "All" },
	{ value: "stocks", label: "Stocks" },
	{ value: "indices", label: "Indices" },
	{ value: "commodities", label: "Commodities" },
	{ value: "fx", label: "FX" },
	{ value: "preipo", label: "Pre-IPO" },
];

const CRYPTO_MARKET_SUBCATEGORY_LABELS = {
	ai: "AI",
	defi: "Defi",
	gaming: "Gaming",
	layer1: "Layer 1",
	layer2: "Layer 2",
	meme: "Meme",
} as const;

const CRYPTO_MARKET_SUBCATEGORIES: MarketSubcategory[] = [
	{ value: "all", label: "All" },
	...CRYPTO_MARKET_SECTORS.map((sector) => ({ value: sector, label: CRYPTO_MARKET_SUBCATEGORY_LABELS[sector] })),
];

const TOKEN_SELECTOR_SEARCH_CONFIG: SearchConfig<MarketRow> = {
	...marketSearchConfig,
	fields: {
		...marketSearchConfig.fields,
		annotationDisplayName: {
			extract: (market) => market.annotation?.displayName,
			weight: 1.8,
		},
		annotationKeywords: {
			extract: (market) => market.annotation?.keywords,
			weight: 1,
		},
	},
};

export interface UseTokenSelectorOptions {
	value: string;
	onValueChange: (value: string, market?: MarketRow) => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	mobile?: boolean;
}

export interface UseTokenSelectorReturn {
	open: boolean;
	setOpen: (open: boolean) => void;
	scope: MarketScope;
	subcategory: string;
	subcategories: MarketSubcategory[];
	search: string;
	setSearch: (search: string) => void;
	isLoading: boolean;
	hasCatalogError: boolean;
	retryCatalog: () => void;
	hasClassificationError: boolean;
	retryClassifications: () => void;
	isFavorite: (name: string) => boolean;
	sorting: SortingState;
	handleSort: (columnId: string) => void;
	handleSelect: (name: string) => void;
	handleSubcategorySelect: (sub: string) => void;
	handleScopeSelect: (scope: MarketScope) => void;
	toggleFavorite: (name: string) => void;
	table: ReturnType<typeof useReactTable<MarketRow>>;
	rows: Row<MarketRow>[];
	virtualItems: VirtualItem[];
	virtualTotalSize: number;
	containerRef: React.RefObject<HTMLDivElement | null>;
	searchInputRef: React.RefObject<HTMLInputElement | null>;
	filteredMarkets: MarketRow[];
	highlightedIndex: number;
	handleKeyDown: (e: React.KeyboardEvent) => void;
	handleFavoriteFocus: (name: string) => void;
	handleFavoriteBlur: (name: string) => void;
	setFavoriteButtonRef: (name: string, node: HTMLButtonElement | null) => void;
}

function mapExchangeToMarketScope(es: ExchangeScope): MarketScope {
	if (es === "builders-perp") return "hip3";
	if (es === "perp" || es === "spot") return es;
	return "all";
}

type MarketsInfo = ReturnType<typeof useMarketsInfo>;

function computeSubcategories(
	scope: MarketScope,
	builderPerpMarkets: MarketsInfo["builderPerpMarkets"],
	spotMarkets: MarketsInfo["spotMarkets"],
): MarketSubcategory[] {
	if (scope === "traditional") return TRADITIONAL_FINANCE_SUBCATEGORIES;
	if (scope === "crypto") return CRYPTO_MARKET_SUBCATEGORIES;
	if (scope === "perp") return [];
	if (scope === "spot") return getSpotQuoteSubcategories(spotMarkets);

	if (scope === "hip3") {
		const dexNames = Object.keys(builderPerpMarkets).filter((k) => k !== "all");
		return [{ value: "all", label: "All" }, ...dexNames.map((d) => ({ value: d, label: d }))];
	}

	return [];
}

function extractVirtualRangeWithPreserved(
	range: { startIndex: number; endIndex: number; overscan: number; count: number },
	preservedIndices: readonly number[],
): number[] {
	const start = Math.max(range.startIndex - range.overscan, 0);
	const end = Math.min(range.endIndex + range.overscan, range.count - 1);
	const indices: number[] = [];
	for (let i = start; i <= end; i++) {
		indices.push(i);
	}
	let added = false;
	for (const preservedIndex of preservedIndices) {
		if (preservedIndex >= 0 && preservedIndex < range.count && !indices.includes(preservedIndex)) {
			indices.push(preservedIndex);
			added = true;
		}
	}
	if (added) {
		indices.sort((a, b) => a - b);
	}
	return indices;
}

function resolveHighlightIndex(prevName: string | null, resetToFirst: boolean, rows: Row<MarketRow>[]): number {
	if (prevName !== null) {
		return rows.findIndex((row) => row.original.name === prevName);
	}
	return resetToFirst && rows.length > 0 ? 0 : -1;
}

function isImeCompositionEvent(e: React.KeyboardEvent): boolean {
	return e.nativeEvent.isComposing || e.key === "Process" || e.keyCode === 229 || e.nativeEvent.keyCode === 229;
}

export function useTokenSelector({
	value,
	onValueChange,
	open: controlledOpen,
	onOpenChange,
	mobile = false,
}: UseTokenSelectorOptions): UseTokenSelectorReturn {
	const { scope: exchangeScope, dex: exchangeDex } = useExchangeScope();
	const initialScope = mapExchangeToMarketScope(exchangeScope);
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const [localScope, setLocalScope] = useState<MarketScope>(initialScope);
	const [subcategoryByScope, setSubcategoryByScope] = useState<Partial<Record<MarketScope, string>>>(() => ({
		[initialScope]: exchangeDex ?? getDefaultMarketSubcategory(initialScope),
	}));
	const [search, setSearch] = useState("");
	const [deferredSearch, setDeferredSearch] = useState("");
	const [isSearchPending, startTransition] = useTransition();
	const [sorting, setSorting] = useState<SortingState>(DEFAULT_MARKET_SORT);
	const [highlightedMarketName, setHighlightedMarketName] = useState<string | null>(null);
	const [resetHighlightToFirst, setResetHighlightToFirst] = useState(false);
	const [focusedFavoriteMarketName, setFocusedFavoriteMarketName] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const favoriteButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
	const pendingFavoriteFocusRef = useRef<{
		toggledName: string;
		wasFavorite: boolean;
		fallbackName: string | null;
	} | null>(null);
	const hasInitializedRef = useRef(false);
	const initScrollFrameRef = useRef<number | null>(null);
	const exchangeKey = `${exchangeScope}:${exchangeDex ?? ""}`;
	const previousExchangeKeyRef = useRef(exchangeKey);
	const open = controlledOpen ?? uncontrolledOpen;
	const setOpen = onOpenChange ?? setUncontrolledOpen;

	const scope = localScope;

	function handleSearchChange(nextValue: string) {
		setSearch(nextValue);
		startTransition(() => setDeferredSearch(nextValue));
		if (open && hasInitializedRef.current) {
			setHighlightedMarketName(null);
			setResetHighlightToFirst(true);
		}
	}

	const {
		markets,
		spotMarkets,
		builderPerpMarkets,
		isLoading: marketsLoading,
		error: marketsError,
		catalogState,
		retryMarketCatalog,
	} = useMarketsInfo();
	const {
		data: perpAnnotations,
		isPending: annotationsPending,
		isError: annotationsError,
		refetch: refetchAnnotations,
	} = useInfo("perpConciseAnnotations", undefined, {
		staleTime: PERP_ANNOTATIONS_STALE_TIME_MS,
	});

	const favorites = useFavoriteMarkets();
	const { toggleFavoriteMarket } = useMarketActions();

	const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
	const isFavorite = useCallback((name: string) => favoriteSet.has(name), [favoriteSet]);

	const subcategories = useMemo(
		() => computeSubcategories(scope, builderPerpMarkets, spotMarkets),
		[scope, builderPerpMarkets, spotMarkets],
	);
	const requestedSubcategory = subcategoryByScope[scope] ?? getDefaultMarketSubcategory(scope);
	const subcategory =
		subcategories.length === 0 || subcategories.some(({ value }) => value === requestedSubcategory)
			? requestedSubcategory
			: getDefaultMarketSubcategory(scope);
	const selectorMarkets = useMemo(() => createMarketRows(markets, perpAnnotations), [markets, perpAnnotations]);
	const classificationState = getMarketClassificationState(scope, perpAnnotations, {
		isPending: annotationsPending,
		isError: annotationsError,
	});

	useEffect(() => {
		if (previousExchangeKeyRef.current === exchangeKey) return;
		previousExchangeKeyRef.current = exchangeKey;

		const nextScope = mapExchangeToMarketScope(exchangeScope);
		const nextSubcategory = exchangeDex ?? getDefaultMarketSubcategory(nextScope);
		setLocalScope(nextScope);
		setSorting((prev) => resolveVisibleMarketSorting(prev, nextScope, mobile));
		setSubcategoryByScope((previous) =>
			previous[nextScope] === nextSubcategory ? previous : { ...previous, [nextScope]: nextSubcategory },
		);
	}, [exchangeScope, exchangeDex, exchangeKey, mobile]);

	function handleScopeSelect(newScope: MarketScope) {
		setLocalScope(newScope);
		setSorting((prev) => resolveVisibleMarketSorting(prev, newScope, mobile));
		setSubcategoryByScope((previous) =>
			previous[newScope] ? previous : { ...previous, [newScope]: getDefaultMarketSubcategory(newScope) },
		);
		if (open && hasInitializedRef.current) {
			resetListNavigation();
		}
	}

	// Semantic ref stability: when the popover is closed, freeze scopeFilteredMarkets to
	// the previous reference whenever the membership key (scope|subcategory|names) is unchanged,
	// so hidden rows don't re-render on every WS price tick. When open, always pass the live
	// reference through so prices update.
	const stableScopeFilteredRef = useRef<{ key: string; value: MarketRow[] }>({ key: "", value: [] });
	const filteredByScope = useMemo(
		() => filterMarketRowsByScope(selectorMarkets, scope, subcategory, favoriteSet, classificationState),
		[classificationState, selectorMarkets, scope, subcategory, favoriteSet],
	);
	const scopeKey = `${scope}|${subcategory}|${filteredByScope.length}|${filteredByScope.map((m) => m.name).join(",")}`;
	let scopeFilteredMarkets: MarketRow[];
	if (open) {
		stableScopeFilteredRef.current = { key: scopeKey, value: filteredByScope };
		scopeFilteredMarkets = filteredByScope;
	} else if (stableScopeFilteredRef.current.key === scopeKey) {
		scopeFilteredMarkets = stableScopeFilteredRef.current.value;
	} else {
		stableScopeFilteredRef.current = { key: scopeKey, value: filteredByScope };
		scopeFilteredMarkets = filteredByScope;
	}

	const searcher = useMemo(
		() => createSearcher(scopeFilteredMarkets, TOKEN_SELECTOR_SEARCH_CONFIG),
		[scopeFilteredMarkets],
	);

	const filteredMarkets = useMemo(() => {
		if (!deferredSearch) {
			return scopeFilteredMarkets;
		}

		const marketByName = new Map(scopeFilteredMarkets.map((m) => [m.name, m]));
		return searcher
			.search(deferredSearch)
			.map((result) => marketByName.get(result.item.name))
			.filter((m): m is MarketRow => m != null);
	}, [deferredSearch, scopeFilteredMarkets, searcher]);

	const effectiveSorting = resolveVisibleMarketSorting(sorting, scope, mobile);

	function handleSort(columnId: string) {
		setSorting((prev) => {
			const visible = resolveVisibleMarketSorting(prev, scope, mobile);
			const current = visible[0];
			if (current?.id === columnId) return [{ id: columnId, desc: !current.desc }];
			return [{ id: columnId, desc: true }];
		});
	}

	const table = useReactTable({
		data: filteredMarkets,
		columns: TOKEN_SELECTOR_COLUMNS,
		getRowId: (row) => row.name,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		state: { sorting: effectiveSorting },
		onSortingChange: setSorting,
		enableSortingRemoval: false,
	});

	const sortedRows = table.getRowModel().rows;
	// Semantic: `rows` is used as an effect dep below — keep referential stability so the
	// initialization effect doesn't re-run on every render.
	const rows = useMemo(() => {
		const favoriteNames = new Set(favorites);
		const favoriteRows = sortedRows.filter((r) => favoriteNames.has(r.original.name));
		const nonFavoriteRows = sortedRows.filter((r) => !favoriteNames.has(r.original.name));
		return [...favoriteRows, ...nonFavoriteRows];
	}, [sortedRows, favorites]);

	const catalogDisplayState = resolveMarketCatalogDisplayState({
		visibleMarketCount: rows.length,
		isLoading: marketsLoading,
		error: marketsError,
		catalogState,
	});

	const isSearchStale = isSearchPending || search !== deferredSearch;
	const hasCatalogError = open && !isSearchStale && catalogDisplayState === "error";
	const hasClassificationError =
		open && !isSearchStale && catalogDisplayState === "ready" && classificationState === "error";
	const isSelectorLoading =
		open &&
		(isSearchStale ||
			catalogDisplayState === "loading" ||
			(catalogDisplayState === "ready" && classificationState === "pending"));
	const isResultSetAvailable = open && !isSelectorLoading && !hasCatalogError && !hasClassificationError;
	const isListReady = isResultSetAvailable && rows.length > 0;
	const effectiveHighlightedIndex = isListReady
		? resolveHighlightIndex(highlightedMarketName, resetHighlightToFirst, rows)
		: -1;
	const focusedFavoriteIndex =
		isListReady && focusedFavoriteMarketName !== null
			? rows.findIndex((row) => row.original.name === focusedFavoriteMarketName)
			: -1;

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => containerRef.current,
		estimateSize: () => TOKEN_SELECTOR_ROW_HEIGHT_PX,
		overscan: TOKEN_SELECTOR_OVERSCAN,
		rangeExtractor: (range) =>
			extractVirtualRangeWithPreserved(range, [effectiveHighlightedIndex, focusedFavoriteIndex]),
	});
	const virtualItems = virtualizer.getVirtualItems();
	const virtualTotalSize = virtualizer.getTotalSize();

	function resetListNavigation() {
		setHighlightedMarketName(null);
		setResetHighlightToFirst(true);
		virtualizer.scrollToIndex(0, { align: "start" });
	}

	function handleFavoriteFocus(name: string) {
		setFocusedFavoriteMarketName(name);
	}

	function handleFavoriteBlur(name: string) {
		setFocusedFavoriteMarketName((prev) => (prev === name ? null : prev));
	}

	function setFavoriteButtonRef(name: string, node: HTMLButtonElement | null) {
		if (node) {
			favoriteButtonRefs.current.set(name, node);
		} else {
			favoriteButtonRefs.current.delete(name);
		}
	}

	function handleToggleFavorite(name: string) {
		const favoriteButton = favoriteButtonRefs.current.get(name);
		const wasFocused =
			typeof document !== "undefined" && favoriteButton != null && document.activeElement === favoriteButton;
		if (wasFocused) {
			const currentIndex = rows.findIndex((row) => row.original.name === name);
			let fallbackName: string | null = null;
			if (currentIndex >= 0) {
				fallbackName = rows[currentIndex + 1]?.original.name ?? rows[currentIndex - 1]?.original.name ?? null;
			}
			const wasFavorite = favoriteSet.has(name);
			pendingFavoriteFocusRef.current = {
				toggledName: name,
				wasFavorite,
				fallbackName,
			};
			if (scope === "favorites" && wasFavorite) {
				setFocusedFavoriteMarketName(fallbackName);
			}
		}
		toggleFavoriteMarket(name);
	}

	useEffect(() => {
		if (!open) return;

		virtualizer.measure();
		const frameId = window.requestAnimationFrame(() => virtualizer.measure());
		const timeoutId = window.setTimeout(() => virtualizer.measure(), 250);
		return () => {
			window.cancelAnimationFrame(frameId);
			window.clearTimeout(timeoutId);
		};
	}, [open, virtualizer]);

	useEffect(() => {
		if (!open) return;

		function handleWindowBlur() {
			setOpen(false);
		}

		window.addEventListener("blur", handleWindowBlur);
		return () => window.removeEventListener("blur", handleWindowBlur);
	}, [open, setOpen]);

	useEffect(() => {
		if (!open) {
			hasInitializedRef.current = false;
			pendingFavoriteFocusRef.current = null;
			setHighlightedMarketName(null);
			setResetHighlightToFirst(false);
			setFocusedFavoriteMarketName(null);
			if (initScrollFrameRef.current !== null) {
				window.cancelAnimationFrame(initScrollFrameRef.current);
				initScrollFrameRef.current = null;
			}
			return;
		}

		if (!isResultSetAvailable) return;

		if (!hasInitializedRef.current) {
			if (!isListReady) return;
			hasInitializedRef.current = true;
			const index = value ? rows.findIndex((row) => row.original.name === value) : -1;
			const initialIndex = index >= 0 ? index : 0;
			setHighlightedMarketName(rows[initialIndex]?.original.name ?? null);
			setResetHighlightToFirst(false);
			if (index > 0) {
				if (initScrollFrameRef.current !== null) {
					window.cancelAnimationFrame(initScrollFrameRef.current);
				}
				initScrollFrameRef.current = window.requestAnimationFrame(() => {
					initScrollFrameRef.current = null;
					virtualizer.scrollToIndex(index, { align: "center" });
				});
			}
			return;
		}

		if (resetHighlightToFirst) {
			if (!isListReady) return;
			setHighlightedMarketName(rows[0]?.original.name ?? null);
			setResetHighlightToFirst(false);
			return;
		}

		if (highlightedMarketName !== null && !rows.some((row) => row.original.name === highlightedMarketName)) {
			setHighlightedMarketName(null);
		}
	}, [open, isResultSetAvailable, isListReady, rows, value, virtualizer, resetHighlightToFirst, highlightedMarketName]);

	useLayoutEffect(() => {
		if (!open) return;
		const pending = pendingFavoriteFocusRef.current;
		if (!pending) return;
		if (favoriteSet.has(pending.toggledName) === pending.wasFavorite) return;

		const toggledIndex = rows.findIndex((row) => row.original.name === pending.toggledName);
		if (toggledIndex >= 0) {
			const isToggledMounted = virtualItems.some((item) => item.index === toggledIndex);
			const currentButton = isToggledMounted ? favoriteButtonRefs.current.get(pending.toggledName) : undefined;
			if (!currentButton) {
				setFocusedFavoriteMarketName(pending.toggledName);
				return;
			}
			pendingFavoriteFocusRef.current = null;
			if (document.activeElement !== currentButton) {
				currentButton.focus();
			}
			return;
		}

		let targetName: string | null = rows[0]?.original.name ?? null;
		if (pending.fallbackName && rows.some((row) => row.original.name === pending.fallbackName)) {
			targetName = pending.fallbackName;
		}

		if (targetName) {
			const targetIndex = rows.findIndex((row) => row.original.name === targetName);
			const isTargetMounted = virtualItems.some((item) => item.index === targetIndex);
			const targetButton = isTargetMounted ? favoriteButtonRefs.current.get(targetName) : undefined;
			if (!targetButton) {
				setFocusedFavoriteMarketName(targetName);
				if (targetIndex >= 0) {
					virtualizer.scrollToIndex(targetIndex, { align: "auto" });
				}
				return;
			}
			pendingFavoriteFocusRef.current = null;
			if (targetIndex >= 0) {
				virtualizer.scrollToIndex(targetIndex, { align: "auto" });
			}
			targetButton.focus();
			return;
		}

		pendingFavoriteFocusRef.current = null;
		setFocusedFavoriteMarketName(null);
		searchInputRef.current?.focus();
	}, [open, favoriteSet, rows, virtualItems, virtualizer]);

	useEffect(() => {
		return () => {
			if (initScrollFrameRef.current !== null) {
				window.cancelAnimationFrame(initScrollFrameRef.current);
				initScrollFrameRef.current = null;
			}
		};
	}, []);

	function handleKeyDown(e: React.KeyboardEvent) {
		if (isImeCompositionEvent(e)) return;
		if (e.key === "Escape") {
			setOpen(false);
			return;
		}
		if (!isListReady) return;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setResetHighlightToFirst(false);
				setHighlightedMarketName((prevName) => {
					const prevIndex = resolveHighlightIndex(prevName, resetHighlightToFirst, rows);
					const base = prevIndex < 0 ? -1 : prevIndex;
					const next = Math.min(base + 1, rows.length - 1);
					virtualizer.scrollToIndex(next, { align: "auto" });
					return rows[next]?.original.name ?? null;
				});
				break;
			case "ArrowUp":
				e.preventDefault();
				setResetHighlightToFirst(false);
				setHighlightedMarketName((prevName) => {
					const prevIndex = resolveHighlightIndex(prevName, resetHighlightToFirst, rows);
					const base = prevIndex < 0 ? 0 : prevIndex;
					const next = Math.max(base - 1, 0);
					virtualizer.scrollToIndex(next, { align: "auto" });
					return rows[next]?.original.name ?? null;
				});
				break;
			case "Enter":
				e.preventDefault();
				if (effectiveHighlightedIndex >= 0 && rows[effectiveHighlightedIndex]) {
					handleSelect(rows[effectiveHighlightedIndex].original.name);
				}
				break;
		}
	}

	function handleSelect(name: string) {
		const market = markets.find((row) => row.name === name);
		onValueChange(name, market);
		setOpen(false);
		setSearch("");
		setDeferredSearch("");
	}

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			setSearch("");
			setDeferredSearch("");
		}
	}

	function handleSubcategorySelect(next: string) {
		setSubcategoryByScope((previous) => ({ ...previous, [scope]: next }));
		if (open && hasInitializedRef.current) {
			resetListNavigation();
		}
	}

	function retryClassifications() {
		void refetchAnnotations();
	}

	function retryCatalog() {
		void retryMarketCatalog?.();
	}

	return {
		open,
		setOpen: handleOpenChange,
		scope,
		subcategory,
		subcategories,
		search,
		setSearch: handleSearchChange,
		isLoading: isSelectorLoading,
		hasCatalogError,
		retryCatalog,
		hasClassificationError,
		retryClassifications,
		isFavorite,
		sorting: effectiveSorting,
		handleSort,
		handleSelect,
		handleSubcategorySelect,
		handleScopeSelect,
		toggleFavorite: handleToggleFavorite,
		table,
		rows,
		virtualItems,
		virtualTotalSize,
		containerRef,
		searchInputRef,
		filteredMarkets,
		highlightedIndex: effectiveHighlightedIndex,
		handleKeyDown,
		handleFavoriteFocus,
		handleFavoriteBlur,
		setFavoriteButtonRef,
	};
}
