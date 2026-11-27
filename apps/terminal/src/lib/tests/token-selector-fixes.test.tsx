// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type {
	MetaResponse,
	PerpConciseAnnotationsResponse,
	PerpDexsResponse,
	SpotMetaResponse,
} from "@nktkas/hyperliquid";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenSelector } from "@/components/trade/chart/token-selector";
import type { MarketRow } from "@/components/trade/chart/token-selector-categories";
import { TokenSelectorContent } from "@/components/trade/chart/token-selector-content";
import { TokenSelectorRow } from "@/components/trade/chart/token-selector-row";
import { useTokenSelector } from "@/components/trade/chart/use-token-selector";
import type { ExchangeScope } from "@/domain/market/scope";
import {
	createMarketCatalogState,
	getRetryableMarketCatalogQueries,
	type MarketCatalogQueries,
	type MarketCatalogState,
} from "@/lib/hyperliquid/markets/market-catalog-state";

const testState = vi.hoisted(() => ({
	annotations: undefined as PerpConciseAnnotationsResponse | undefined,
	annotationsPending: false,
	annotationsError: false,
	refetchAnnotations: vi.fn(),
	markets: [] as MarketRow[],
	favorites: [] as string[],
	marketsLoading: false,
	marketsError: null as Error | null,
	catalogState: undefined as MarketCatalogState | undefined,
	retryMarketCatalog: vi.fn(),
	toggleFavoriteMarket: vi.fn(),
	onValueChange: vi.fn(),
	onOpenChange: vi.fn(),
	exchangeScope: "all" as ExchangeScope,
	exchangeDex: undefined as string | undefined,
	open: true,
	mobile: false,
}));

vi.mock("@sairn/hl-react", () => ({
	useInfo: () => ({
		data: testState.annotations,
		isPending: testState.annotationsPending,
		isError: testState.annotationsError,
		refetch: testState.refetchAnnotations,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: "mainnet" }),
	useMarketsInfo: () => {
		const builderMarkets = testState.markets.filter((market) => market.kind === "builderPerp");
		return {
			markets: testState.markets,
			perpMarkets: testState.markets.filter((market) => market.kind === "perp"),
			spotMarkets: testState.markets.filter((market) => market.kind === "spot"),
			builderPerpMarkets: { all: builderMarkets, xyz: builderMarkets },
			isLoading: testState.marketsLoading,
			error: testState.marketsError,
			catalogState: testState.catalogState,
			retryMarketCatalog: testState.retryMarketCatalog,
			getMarketInfo: vi.fn(),
		};
	},
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.mobile,
}));

vi.mock("@/providers/exchange-scope", () => ({
	useExchangeScope: () => ({ scope: testState.exchangeScope, dex: testState.exchangeDex }),
}));

vi.mock("@/stores/use-market-store", () => ({
	useFavoriteMarkets: () => testState.favorites,
	useMarketActions: () => ({ toggleFavoriteMarket: testState.toggleFavoriteMarket }),
}));

vi.mock("@/lib/performance/render-profile", () => ({
	useRenderCommitTrack: vi.fn(),
}));

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span>{coin}</span>,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function liveMarket(overrides: Partial<MarketRow> & { name: string }): MarketRow {
	const kind = overrides.kind ?? "perp";
	const shortName = overrides.shortName ?? overrides.name;
	if (kind === "spot") {
		return {
			kind: "spot",
			shortName,
			pairName: `${shortName}/USDC`,
			szDecimals: 2,
			markPx: "64.5",
			midPx: "64.45",
			prevDayPx: "60",
			dayNtlVlm: "125000000",
			circulatingSupply: "100000000",
			markPriceStatus: "success",
			markPriceReceivedAt: Date.now(),
			assetContextLive: true,
			tokensInfo: [
				{ name: shortName, displayName: shortName, szDecimals: 2 },
				{ name: "USDC", displayName: "USDC", szDecimals: 6 },
			],
			...overrides,
		} as unknown as MarketRow;
	}
	return {
		kind: "perp",
		shortName,
		pairName: `${shortName}-USDC`,
		szDecimals: 2,
		maxLeverage: 20,
		markPx: "100",
		midPx: "100",
		prevDayPx: "95",
		dayNtlVlm: "1000000",
		openInterest: "5000",
		funding: "0.00001",
		markPriceStatus: "success",
		markPriceReceivedAt: Date.now(),
		assetContextLive: true,
		...overrides,
	} as MarketRow;
}

function makeCatalogState(status: MarketCatalogState["status"]): MarketCatalogState {
	if (status === "error") {
		return {
			status: "error",
			canResolveNotFound: false,
			isRefreshing: false,
			isRestoring: false,
			isPaused: false,
			isStale: true,
			error: new Error("network failed"),
		};
	}
	if (status === "ready") {
		return {
			status: "ready",
			canResolveNotFound: true,
			isRefreshing: false,
			isRestoring: false,
			isPaused: false,
			isStale: false,
			error: null,
		};
	}
	return {
		status,
		canResolveNotFound: false,
		isRefreshing: false,
		isRestoring: status === "restoring",
		isPaused: status === "paused",
		isStale: true,
		error: null,
	};
}

let latestSelector: ReturnType<typeof useTokenSelector> | null = null;

function SelectorHarness({ mobile = false, selectedName = "" }: { mobile?: boolean; selectedName?: string }) {
	const selector = useTokenSelector({
		value: selectedName,
		onValueChange: testState.onValueChange,
		open: testState.open,
		onOpenChange: testState.onOpenChange,
		mobile,
	});
	latestSelector = selector;

	const selectedMarket = testState.markets.find((m) => m.name === selectedName);

	return (
		<I18nProvider i18n={i18n}>
			<TokenSelectorContent
				selectedMarket={selectedMarket}
				scope={selector.scope}
				subcategory={selector.subcategory}
				subcategories={selector.subcategories}
				search={selector.search}
				setSearch={selector.setSearch}
				isLoading={selector.isLoading}
				hasCatalogError={selector.hasCatalogError}
				onRetryCatalog={selector.retryCatalog}
				hasClassificationError={selector.hasClassificationError}
				onRetryClassifications={selector.retryClassifications}
				isFavorite={selector.isFavorite}
				sorting={selector.sorting}
				handleSort={selector.handleSort}
				handleSelect={selector.handleSelect}
				handleSubcategorySelect={selector.handleSubcategorySelect}
				handleScopeSelect={selector.handleScopeSelect}
				toggleFavorite={selector.toggleFavorite}
				table={selector.table}
				rows={selector.rows}
				virtualItems={selector.virtualItems}
				virtualTotalSize={selector.virtualTotalSize}
				containerRef={selector.containerRef}
				searchInputRef={selector.searchInputRef}
				filteredMarkets={selector.filteredMarkets}
				highlightedIndex={selector.highlightedIndex}
				handleListKeyDown={selector.handleKeyDown}
				onFavoriteFocus={selector.handleFavoriteFocus}
				onFavoriteBlur={selector.handleFavoriteBlur}
				onFavoriteButtonRef={selector.setFavoriteButtonRef}
				headingId="test-selector-heading"
				mobile={mobile}
			/>
		</I18nProvider>
	);
}

describe("token selector G3a regression suite", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		latestSelector = null;
		testState.annotations = undefined;
		testState.annotationsPending = false;
		testState.annotationsError = false;
		testState.markets = [
			liveMarket({ name: "BTC", dayNtlVlm: "5000000", openInterest: "100", markPx: "60000", midPx: "60000" }),
			liveMarket({ name: "ETH", dayNtlVlm: "2000000", openInterest: "500", markPx: "3000", midPx: "3000" }),
			liveMarket({ name: "@1", kind: "spot", shortName: "HYPE", dayNtlVlm: "1000000" }),
		];
		testState.favorites = [];
		testState.marketsLoading = false;
		testState.marketsError = null;
		testState.catalogState = makeCatalogState("ready");
		testState.refetchAnnotations.mockReset();
		testState.refetchAnnotations.mockResolvedValue({ data: undefined });
		testState.retryMarketCatalog.mockReset();
		testState.retryMarketCatalog.mockResolvedValue(undefined);
		testState.toggleFavoriteMarket.mockReset();
		testState.onValueChange.mockReset();
		testState.onOpenChange.mockReset();
		testState.exchangeScope = "all";
		testState.exchangeDex = undefined;
		testState.open = true;
		testState.mobile = false;

		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
			width: 900,
			height: 400,
			top: 0,
			left: 0,
			bottom: 400,
			right: 900,
			x: 0,
			y: 0,
			toJSON: () => {},
		}));
		vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
		vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(900);
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	function renderHarness(props: { mobile?: boolean; selectedName?: string } = {}) {
		act(() => {
			root.render(<SelectorHarness {...props} />);
		});
	}

	// r1 A-03 / F-03
	it("exposes combobox, listbox, option and aria-activedescendant for keyboard highlighting", () => {
		renderHarness();

		const input = container.querySelector<HTMLInputElement>('input[type="search"]');
		const listbox = container.querySelector<HTMLElement>('[role="listbox"]');
		expect(input?.getAttribute("role")).toBe("combobox");
		expect(listbox).not.toBeNull();
		expect(input?.getAttribute("aria-controls")).toBe(listbox?.id);

		const initialActiveId = input?.getAttribute("aria-activedescendant");
		expect(initialActiveId).toBeTruthy();
		const initialOption = initialActiveId ? document.getElementById(initialActiveId) : null;
		expect(initialOption?.getAttribute("role")).toBe("option");
		expect(initialOption?.getAttribute("aria-selected")).toBe("true");
		expect(initialOption?.getAttribute("data-index")).toBe("BTC");

		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		});

		const nextActiveId = input?.getAttribute("aria-activedescendant");
		expect(nextActiveId).toBeTruthy();
		expect(nextActiveId).not.toBe(initialActiveId);
		const nextOption = nextActiveId ? document.getElementById(nextActiveId) : null;
		expect(nextOption?.getAttribute("role")).toBe("option");
		expect(nextOption?.getAttribute("aria-selected")).toBe("true");
		expect(nextOption?.getAttribute("data-index")).toBe("ETH");
	});

	it("keeps a highlighted option mounted in the virtual list even when scrolled past the viewport", () => {
		testState.markets = Array.from({ length: 40 }, (_, index) =>
			liveMarket({ name: `MKT${index}`, dayNtlVlm: String(100_000 - index) }),
		);
		renderHarness({ selectedName: "MKT35" });

		const input = container.querySelector<HTMLInputElement>('input[type="search"]');
		const activeId = input?.getAttribute("aria-activedescendant");
		expect(activeId).toBeTruthy();
		const activeOption = activeId ? document.getElementById(activeId) : null;
		expect(activeOption).not.toBeNull();
		expect(activeOption?.getAttribute("data-index")).toBe("MKT35");
		expect(activeOption?.getAttribute("aria-selected")).toBe("true");
	});

	// r1 E-05
	it("uses RTL-logical positioning for mobile favorite button, name padding, and category fades", () => {
		renderHarness({ mobile: true });

		const favButton = container.querySelector<HTMLButtonElement>('button[aria-label^="Add "]');
		expect(favButton?.className).toContain("end-0");
		expect(favButton?.className).not.toContain("right-0");
		expect(favButton?.parentElement?.parentElement?.className).toContain("pe-11");
		expect(favButton?.parentElement?.parentElement?.className).not.toContain("pr-11");

		const fades = [...container.querySelectorAll<HTMLDivElement>("div.pointer-events-none")].filter((el) =>
			el.className.includes("from-transparent"),
		);
		expect(fades.length).toBeGreaterThan(0);
		for (const fade of fades) {
			expect(fade.className).toContain("end-0");
			expect(fade.className).toContain("rtl:bg-linear-to-l");
			expect(fade.className).not.toContain("right-0");
		}
	});

	// r2 A1-01 (requires failing test proof)
	it("hides stale volume, funding, open interest and spot market cap and drops them from sorting", () => {
		const stalePerp = liveMarket({
			name: "STALE_PERP",
			markPx: "64.5",
			midPx: "64.45",
			prevDayPx: "60",
			dayNtlVlm: "999999999",
			openInterest: "2000000",
			funding: "0.00005",
			markPriceStatus: "stale",
			assetContextLive: false,
		});
		const livePerp = liveMarket({
			name: "LIVE_PERP",
			markPx: "10",
			midPx: "10",
			prevDayPx: "9",
			dayNtlVlm: "1000",
			openInterest: "50",
			funding: "0.00001",
		});
		const staleSpot = liveMarket({
			name: "@9",
			kind: "spot",
			shortName: "STALESPOT",
			markPx: "64.5",
			dayNtlVlm: "888888888",
			circulatingSupply: "100000000",
			markPriceStatus: "stale",
			assetContextLive: true,
		});

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ul>
						<TokenSelectorRow
							market={stalePerp}
							mobile={false}
							showDerivativesMetrics
							showSpotMarketCap={false}
							isSelected={false}
							isHighlighted={false}
							isFavorite={false}
							top={0}
							height={48}
							onSelect={vi.fn()}
							onToggleFavorite={vi.fn()}
						/>
						<TokenSelectorRow
							market={staleSpot}
							mobile={false}
							showDerivativesMetrics={false}
							showSpotMarketCap
							isSelected={false}
							isHighlighted={false}
							isFavorite={false}
							top={48}
							height={48}
							onSelect={vi.fn()}
							onToggleFavorite={vi.fn()}
						/>
					</ul>
				</I18nProvider>,
			);
		});

		const rows = container.querySelectorAll("li");
		const perpRowText = rows[0]?.textContent ?? "";
		expect(perpRowText).not.toContain("999,999,999");
		expect(perpRowText).not.toContain("129,000,000");
		expect(perpRowText).not.toContain("0.0400%");

		const spotRowText = rows[1]?.textContent ?? "";
		expect(spotRowText).not.toContain("6,450,000,000");

		testState.markets = [stalePerp, livePerp];
		renderHarness();
		expect(latestSelector?.rows.map((r) => r.original.name)).toEqual(["LIVE_PERP", "STALE_PERP"]);
	});

	// r2 A1-02 + B2-02
	it("shows blank busy region when loading and neutral retry without red alert when catalog or classifications fail", () => {
		testState.markets = [];
		testState.marketsLoading = true;
		testState.catalogState = makeCatalogState("loading");
		renderHarness({ mobile: true });

		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
		expect(container.textContent).not.toContain("No markets found.");
		const loadingTextNode = [...container.querySelectorAll("span")].find(
			(el) => el.textContent?.includes("Loading markets") && !el.className.includes("sr-only"),
		);
		expect(loadingTextNode).toBeUndefined();

		testState.marketsLoading = false;
		testState.marketsError = new Error("catalog error");
		testState.catalogState = makeCatalogState("error");
		renderHarness({ mobile: true });

		expect(container.textContent).not.toContain("No markets found.");
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.querySelector(".text-trading-panel-error")).toBeNull();
		const retryButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Retry",
		);
		expect(retryButton).toBeDefined();
		act(() => retryButton?.click());
		expect(testState.retryMarketCatalog).toHaveBeenCalledTimes(1);

		testState.markets = [liveMarket({ name: "BTC" })];
		testState.marketsError = null;
		testState.catalogState = makeCatalogState("ready");
		testState.annotationsError = true;
		renderHarness({ mobile: true });

		const tradBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Traditional Finance",
		);
		act(() => tradBtn?.click());
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.textContent).not.toContain("Failed to load market categories.");
		const classRetry = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Retry",
		);
		expect(classRetry).toBeDefined();
		act(() => classRetry?.click());
		expect(testState.refetchAnnotations).toHaveBeenCalledTimes(1);
	});

	// r2 A1-03 / F-01
	it("ignores Enter and Arrow keys during IME composition", () => {
		renderHarness();

		const input = container.querySelector<HTMLInputElement>('input[type="search"]');
		const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
		Object.defineProperty(enterEvent, "isComposing", { value: true });
		act(() => {
			input?.dispatchEvent(enterEvent);
		});

		expect(testState.onValueChange).not.toHaveBeenCalled();

		const arrowEvent = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true });
		Object.defineProperty(arrowEvent, "isComposing", { value: true });
		act(() => {
			input?.dispatchEvent(arrowEvent);
		});
		expect(latestSelector?.highlightedIndex).toBe(0);
	});

	// r2 A1-04 (requires failing test proof)
	it("does not select a stale previous result when Enter is pressed while search results are pending", () => {
		renderHarness();

		const input = container.querySelector<HTMLInputElement>('input[type="search"]');
		expect(latestSelector?.rows[0]?.original.name).toBe("BTC");

		act(() => {
			flushSync(() => {
				latestSelector?.setSearch("ETH");
			});
			expect(latestSelector?.isLoading).toBe(true);
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});

		expect(testState.onValueChange).not.toHaveBeenCalled();
	});

	// r2 A1-05 / F-02 / B2-04
	it("resets sort to a visible column when switching scopes and exposes sort direction to assistive tech", () => {
		renderHarness({ mobile: false });

		const oiSortBtn = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by Open Interest"]');
		expect(oiSortBtn).not.toBeNull();
		act(() => oiSortBtn?.click());

		const activeOiBtn = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by Open Interest"]');
		expect(activeOiBtn?.getAttribute("aria-label")).toContain("descending");

		act(() => activeOiBtn?.click());
		const ascOiBtn = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by Open Interest"]');
		expect(ascOiBtn?.getAttribute("aria-label")).toContain("ascending");

		const spotScopeBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Spot",
		);
		act(() => spotScopeBtn?.click());

		expect(latestSelector?.sorting[0]?.id).toBe("volume");
		expect(container.textContent).not.toContain("Sorted by Open Interest");
		expect(container.textContent).toContain("Sorted by Volume");

		const mcapSortBtn = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by Market Cap"]');
		expect(mcapSortBtn).not.toBeNull();
		act(() => mcapSortBtn?.click());
		expect(latestSelector?.sorting[0]?.id).toBe("market-cap");

		const perpScopeBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Perp",
		);
		act(() => perpScopeBtn?.click());
		expect(latestSelector?.sorting[0]?.id).toBe("volume");
		expect(container.textContent).not.toContain("Sorted by Market Cap");
	});

	it("exposes mobile sort field and direction in sort button accessible names", () => {
		renderHarness({ mobile: true });

		const priceSortBtn = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by Last Price"]');
		expect(priceSortBtn?.getAttribute("aria-label")).toBe("Sort by Last Price");

		act(() => priceSortBtn?.click());
		const descBtn = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by Last Price"]');
		expect(descBtn?.getAttribute("aria-label")).toBe("Sort by Last Price, sorted descending");

		act(() => descBtn?.click());
		const ascBtn = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by Last Price"]');
		expect(ascBtn?.getAttribute("aria-label")).toBe("Sort by Last Price, sorted ascending");
	});

	// r2 B2-05 / F-03
	it("uses inset focus outlines on primary scope buttons so horizontal scroll does not clip them", () => {
		renderHarness({ mobile: true });

		const allScopeBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "All",
		);
		expect(allScopeBtn?.className).toContain("-outline-offset-2");
		expect(allScopeBtn?.className).not.toContain("focus-visible:outline-offset-2");
	});

	// r3 E-01
	it("avoids false empty states and hides counts while partial catalog scopes are loading or failed", () => {
		testState.markets = [liveMarket({ name: "BTC", dayNtlVlm: "5000000" })];
		testState.catalogState = {
			status: "ready",
			canResolveNotFound: false,
			isRefreshing: true,
			isRestoring: false,
			isPaused: false,
			isStale: true,
			error: null,
		};
		renderHarness();

		expect(container.textContent).toContain("1 markets");

		const spotScopeBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Spot",
		);
		act(() => spotScopeBtn?.click());

		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
		expect(container.textContent).not.toContain("No markets found.");
		expect(container.textContent).not.toContain("0 markets");

		testState.catalogState = {
			status: "ready",
			canResolveNotFound: false,
			isRefreshing: false,
			isRestoring: false,
			isPaused: false,
			isStale: true,
			error: new Error("spot failed"),
		};
		renderHarness();

		expect(container.textContent).not.toContain("No markets found.");
		expect(container.textContent).not.toContain("0 markets");
		const retryBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Retry",
		);
		expect(retryBtn).toBeDefined();
		act(() => retryBtn?.click());
		expect(testState.retryMarketCatalog).toHaveBeenCalledTimes(1);
	});

	// r3 E-02
	it("tracks the highlighted market by id across live reorders and clears when the market leaves the list", () => {
		testState.markets = [
			liveMarket({ name: "BTC", markPx: "60000", midPx: "60000" }),
			liveMarket({ name: "ETH", markPx: "3000", midPx: "3000" }),
			liveMarket({ name: "SOL", markPx: "100", midPx: "100" }),
		];
		renderHarness();

		const priceSortBtn = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by Last Price"]');
		act(() => priceSortBtn?.click());

		const input = container.querySelector<HTMLInputElement>('input[type="search"]');
		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		});

		const activeIdBefore = input?.getAttribute("aria-activedescendant");
		expect(activeIdBefore).toBeTruthy();
		expect(activeIdBefore ? document.getElementById(activeIdBefore)?.getAttribute("data-index") : null).toBe("ETH");

		testState.markets = [
			liveMarket({ name: "BTC", markPx: "2000", midPx: "2000" }),
			liveMarket({ name: "ETH", markPx: "70000", midPx: "70000" }),
			liveMarket({ name: "SOL", markPx: "100", midPx: "100" }),
		];
		renderHarness();

		expect(latestSelector?.rows.map((row) => row.original.name)).toEqual(["ETH", "BTC", "SOL"]);
		const activeIdAfter = input?.getAttribute("aria-activedescendant");
		expect(activeIdAfter).toBe(activeIdBefore);
		expect(activeIdAfter ? document.getElementById(activeIdAfter)?.getAttribute("data-index") : null).toBe("ETH");

		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(testState.onValueChange).toHaveBeenCalledWith("ETH", expect.objectContaining({ name: "ETH" }));

		testState.onValueChange.mockClear();
		testState.markets = [
			liveMarket({ name: "BTC", markPx: "2000", midPx: "2000" }),
			liveMarket({ name: "SOL", markPx: "100", midPx: "100" }),
		];
		renderHarness();

		expect(input?.getAttribute("aria-activedescendant")).toBeNull();
		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(testState.onValueChange).not.toHaveBeenCalled();
	});

	// r3 E-04
	it("excludes listbox options from Tab order while keeping favorite buttons tabbable and outer trigger a plain button", () => {
		renderHarness();

		const options = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')];
		expect(options.length).toBeGreaterThan(0);
		for (const option of options) {
			expect(option.getAttribute("tabindex")).toBe("-1");
		}

		const favoriteButtons = [...container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Add "]')];
		expect(favoriteButtons.length).toBeGreaterThan(0);
		for (const favBtn of favoriteButtons) {
			expect(favBtn.getAttribute("tabindex")).toBeNull();
		}

		const queryClient = new QueryClient();
		for (const mobile of [false, true]) {
			testState.mobile = mobile;
			act(() => {
				root.render(
					<QueryClientProvider client={queryClient}>
						<I18nProvider i18n={i18n}>
							<TokenSelector selectedMarket={testState.markets[0]} onValueChange={testState.onValueChange} />
						</I18nProvider>
					</QueryClientProvider>,
				);
			});

			const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Select token"]');
			expect(trigger).not.toBeNull();
			expect(trigger?.getAttribute("role")).toBeNull();
		}
	});

	// r3 E-05
	it("ignores IME keyCode 229 and Process events while allowing normal Enter selection", () => {
		renderHarness();

		const input = container.querySelector<HTMLInputElement>('input[type="search"]');
		const imeEnter229 = new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true });
		act(() => {
			input?.dispatchEvent(imeEnter229);
		});
		expect(testState.onValueChange).not.toHaveBeenCalled();

		const imeArrow229 = new KeyboardEvent("keydown", { key: "ArrowDown", keyCode: 229, bubbles: true });
		act(() => {
			input?.dispatchEvent(imeArrow229);
		});
		expect(latestSelector?.highlightedIndex).toBe(0);

		const normalEnter = new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true });
		act(() => {
			input?.dispatchEvent(normalEnter);
		});
		expect(testState.onValueChange).toHaveBeenCalledWith("BTC", expect.objectContaining({ name: "BTC" }));
	});

	// r5 D-01
	it("offers neutral retry instead of busy when an idle catalog is stale or incomplete with zero matches, while showing matches normally", () => {
		const validSpotMeta = {
			tokens: [
				{
					name: "USDC",
					szDecimals: 2,
					weiDecimals: 6,
					index: 0,
					tokenId: "0x00000000000000000000000000000000",
					isCanonical: true,
					evmContract: null,
					fullName: "USD Coin",
					deployerTradingFeeShare: "0",
				},
			],
			universe: [],
		} as SpotMetaResponse;
		const validPerpMetas = [
			{
				universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 40, marginTableId: 0 }],
				marginTables: [],
				collateralToken: 0,
			},
		] as MetaResponse[];
		const validPerpDexs = [null] as unknown as PerpDexsResponse;

		const stalePerpDexsQuery = {
			data: validPerpDexs,
			status: "success" as const,
			fetchStatus: "idle" as const,
			error: null,
			isStale: true,
			refetch: vi.fn(async () => undefined),
		};
		const staleQueries: MarketCatalogQueries = {
			spotMeta: {
				data: validSpotMeta,
				status: "success",
				fetchStatus: "idle",
				error: null,
				isStale: false,
				refetch: vi.fn(async () => undefined),
			},
			perpDexs: stalePerpDexsQuery,
			allPerpMetas: {
				data: validPerpMetas,
				status: "success",
				fetchStatus: "idle",
				error: null,
				isStale: false,
				refetch: vi.fn(async () => undefined),
			},
		};
		expect(getRetryableMarketCatalogQueries(staleQueries)).toEqual([stalePerpDexsQuery]);

		testState.markets = [liveMarket({ name: "BTC", dayNtlVlm: "5000000" })];
		testState.catalogState = createMarketCatalogState({
			isRestoring: false,
			hasUsableMarkets: true,
			queries: staleQueries,
		});
		renderHarness();

		expect(container.textContent).toContain("BTC-USDC");
		expect(container.textContent).toContain("1 markets");

		act(() => {
			latestSelector?.setSearch("NO_SUCH_MARKET");
		});
		expect(container.querySelector('[aria-busy="true"]')).toBeNull();
		expect(container.textContent).not.toContain("No markets found.");
		expect(container.textContent).not.toContain("0 markets");
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.querySelector(".text-trading-panel-error")).toBeNull();
		const staleRetryBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Retry",
		);
		expect(staleRetryBtn).toBeDefined();
		act(() => staleRetryBtn?.click());
		expect(testState.retryMarketCatalog).toHaveBeenCalledTimes(1);

		act(() => {
			latestSelector?.setSearch("");
		});
		expect(container.textContent).toContain("BTC-USDC");

		const invalidSpotQuery = {
			data: { tokens: [null], universe: [] } as unknown as SpotMetaResponse,
			status: "success" as const,
			fetchStatus: "idle" as const,
			error: null,
			isStale: false,
			refetch: vi.fn(async () => undefined),
		};
		const invalidSpotQueries: MarketCatalogQueries = {
			spotMeta: invalidSpotQuery,
			perpDexs: { ...stalePerpDexsQuery, isStale: false },
			allPerpMetas: staleQueries.allPerpMetas,
		};
		expect(getRetryableMarketCatalogQueries(invalidSpotQueries)).toEqual([invalidSpotQuery]);

		testState.catalogState = createMarketCatalogState({
			isRestoring: false,
			hasUsableMarkets: true,
			queries: invalidSpotQueries,
		});
		renderHarness();

		expect(container.textContent).toContain("BTC-USDC");
		const spotScopeBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Spot",
		);
		act(() => spotScopeBtn?.click());

		expect(container.querySelector('[aria-busy="true"]')).toBeNull();
		expect(container.textContent).not.toContain("No markets found.");
		expect(container.textContent).not.toContain("0 markets");
		const invalidSpotRetryBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Retry",
		);
		expect(invalidSpotRetryBtn).toBeDefined();
		act(() => invalidSpotRetryBtn?.click());
		expect(testState.retryMarketCatalog).toHaveBeenCalledTimes(2);

		testState.catalogState = createMarketCatalogState({
			isRestoring: false,
			hasUsableMarkets: true,
			queries: {
				...invalidSpotQueries,
				spotMeta: { ...invalidSpotQuery, fetchStatus: "fetching" },
			},
		});
		renderHarness();
		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
		expect(
			[...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Retry"),
		).toBeUndefined();
	});

	// r5 D-02
	it("clears the active market id once it leaves the list so restoring it does not revive highlight or Enter target", () => {
		testState.markets = [
			liveMarket({ name: "BTC", dayNtlVlm: "5000000" }),
			liveMarket({ name: "ETH", dayNtlVlm: "2000000" }),
			liveMarket({ name: "SOL", dayNtlVlm: "1000000" }),
		];
		renderHarness();

		const input = container.querySelector<HTMLInputElement>('input[type="search"]');
		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		});
		const ethActiveId = input?.getAttribute("aria-activedescendant");
		expect(ethActiveId ? document.getElementById(ethActiveId)?.getAttribute("data-index") : null).toBe("ETH");

		testState.markets = [
			liveMarket({ name: "BTC", dayNtlVlm: "5000000" }),
			liveMarket({ name: "SOL", dayNtlVlm: "1000000" }),
		];
		renderHarness();

		expect(input?.getAttribute("aria-activedescendant")).toBeNull();
		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(testState.onValueChange).not.toHaveBeenCalled();

		testState.markets = [
			liveMarket({ name: "BTC", dayNtlVlm: "5000000" }),
			...Array.from({ length: 35 }, (_, index) =>
				liveMarket({ name: `MKT${index}`, dayNtlVlm: String(4000000 - index * 1000) }),
			),
			liveMarket({ name: "ETH", dayNtlVlm: "1000" }),
		];
		renderHarness();

		expect(input?.getAttribute("aria-activedescendant")).toBeNull();
		expect(container.querySelector('[role="option"][data-index="ETH"]')).toBeNull();
		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(testState.onValueChange).not.toHaveBeenCalled();

		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		});
		const recoveredActiveId = input?.getAttribute("aria-activedescendant");
		expect(recoveredActiveId ? document.getElementById(recoveredActiveId)?.getAttribute("data-index") : null).toBe(
			"BTC",
		);

		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(testState.onValueChange).toHaveBeenCalledWith("BTC", expect.objectContaining({ name: "BTC" }));
	});

	// r5 D-03
	it("moves focus to the adjacent favorite star or search input when unfavoriting removes the focused row", () => {
		testState.markets = [
			liveMarket({ name: "BTC", dayNtlVlm: "5000000" }),
			liveMarket({ name: "ETH", dayNtlVlm: "2000000" }),
			liveMarket({ name: "SOL", dayNtlVlm: "1000000" }),
		];
		testState.favorites = ["BTC", "ETH", "SOL"];
		testState.toggleFavoriteMarket.mockImplementation((name: string) => {
			testState.favorites = testState.favorites.includes(name)
				? testState.favorites.filter((item) => item !== name)
				: [...testState.favorites, name];
		});
		renderHarness();

		const favScopeBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Favorites",
		);
		act(() => favScopeBtn?.click());

		const ethStar = container.querySelector<HTMLButtonElement>('button[aria-label="Remove ETH-USDC from favorites"]');
		expect(ethStar).not.toBeNull();
		act(() => {
			ethStar?.focus();
			ethStar?.click();
		});
		renderHarness();

		const solStar = container.querySelector<HTMLButtonElement>('button[aria-label="Remove SOL-USDC from favorites"]');
		expect(solStar).not.toBeNull();
		expect(document.activeElement).toBe(solStar);

		act(() => {
			solStar?.click();
		});
		renderHarness();

		const btcStar = container.querySelector<HTMLButtonElement>('button[aria-label="Remove BTC-USDC from favorites"]');
		expect(btcStar).not.toBeNull();
		expect(document.activeElement).toBe(btcStar);

		act(() => {
			btcStar?.click();
		});
		renderHarness();

		const searchInput = container.querySelector<HTMLInputElement>('input[type="search"]');
		expect(searchInput).not.toBeNull();
		expect(document.activeElement).toBe(searchInput);
	});

	it("preserves a focused offscreen favorite row and hands focus to the adjacent offscreen favorite when removed", () => {
		testState.markets = Array.from({ length: 40 }, (_, index) =>
			liveMarket({ name: `MKT${index}`, dayNtlVlm: String(100_000 - index) }),
		);
		testState.favorites = testState.markets.map((market) => market.name);
		testState.toggleFavoriteMarket.mockImplementation((name: string) => {
			testState.favorites = testState.favorites.filter((item) => item !== name);
		});
		renderHarness({ selectedName: "MKT35" });

		const favScopeBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Favorites",
		);
		act(() => favScopeBtn?.click());

		// Focus MKT35 while it is mounted, then verify removing it moves focus to MKT36.
		// First select MKT35 via scope re-open with MKT35 highlighted so it is mounted, then focus its star.
		testState.open = false;
		renderHarness({ selectedName: "MKT35" });
		testState.open = true;
		renderHarness({ selectedName: "MKT35" });

		const mkt35Star = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Remove MKT35-USDC from favorites"]',
		);
		expect(mkt35Star).not.toBeNull();
		act(() => {
			mkt35Star?.focus();
			mkt35Star?.click();
		});
		renderHarness({ selectedName: "MKT35" });

		const mkt36Star = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Remove MKT36-USDC from favorites"]',
		);
		expect(mkt36Star).not.toBeNull();
		expect(document.activeElement).toBe(mkt36Star);
	});
});
