// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketRow } from "@/components/trade/chart/token-selector-categories";
import { TokenSelectorContent } from "@/components/trade/chart/token-selector-content";
import { useTokenSelector } from "@/components/trade/chart/use-token-selector";
import { STORAGE_KEYS } from "@/config/app";
import { createMarketCatalogState, type MarketCatalogState } from "@/lib/hyperliquid/markets/market-catalog-state";

const testState = vi.hoisted(() => ({
	markets: [] as MarketRow[],
	catalogState: undefined as MarketCatalogState | undefined,
	onValueChange: vi.fn(),
	onOpenChange: vi.fn(),
}));

vi.mock("@sairn/hl-react", () => ({
	useInfo: () => ({
		data: undefined,
		isPending: false,
		isError: false,
		refetch: vi.fn(async () => ({ data: undefined })),
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarketsInfo: () => ({
		markets: testState.markets,
		perpMarkets: testState.markets.filter((market) => market.kind === "perp"),
		spotMarkets: testState.markets.filter((market) => market.kind === "spot"),
		builderPerpMarkets: { all: [] },
		isLoading: false,
		error: null,
		catalogState: testState.catalogState,
		retryMarketCatalog: vi.fn(async () => undefined),
		getMarketInfo: vi.fn(),
	}),
}));

vi.mock("@/providers/exchange-scope", () => ({
	useExchangeScope: () => ({ scope: "all" as const, dex: undefined }),
}));

vi.mock("@/lib/performance/render-profile", () => ({
	useRenderCommitTrack: vi.fn(),
}));

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span>{coin}</span>,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function livePerpMarket(name: string): MarketRow {
	return {
		name,
		kind: "perp",
		shortName: name,
		pairName: `${name}-USDC`,
		szDecimals: 4,
		maxLeverage: 40,
		markPx: "3000",
		midPx: "3000",
		prevDayPx: "2900",
		dayNtlVlm: "2000000",
		openInterest: "500",
		funding: "0.00001",
		markPriceStatus: "success",
		markPriceReceivedAt: Date.now(),
		assetContextLive: true,
	} as MarketRow;
}

function makeStaleIdleCatalogState(): MarketCatalogState {
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
			universe: [{ name: "ETH", szDecimals: 4, maxLeverage: 40, marginTableId: 0 }],
			marginTables: [],
			collateralToken: 0,
		},
	] as MetaResponse[];
	const validPerpDexs = [null] as unknown as PerpDexsResponse;

	return createMarketCatalogState({
		isRestoring: false,
		hasUsableMarkets: true,
		queries: {
			spotMeta: {
				data: validSpotMeta,
				status: "success",
				fetchStatus: "idle",
				error: null,
				isStale: false,
				refetch: vi.fn(async () => undefined),
			},
			perpDexs: {
				data: validPerpDexs,
				status: "success",
				fetchStatus: "idle",
				error: null,
				isStale: true,
				refetch: vi.fn(async () => undefined),
			},
			allPerpMetas: {
				data: validPerpMetas,
				status: "success",
				fetchStatus: "idle",
				error: null,
				isStale: false,
				refetch: vi.fn(async () => undefined),
			},
		},
	});
}

function SelectorWithRealMarketStore() {
	const selector = useTokenSelector({
		value: "",
		onValueChange: testState.onValueChange,
		open: true,
		onOpenChange: testState.onOpenChange,
	});

	return (
		<I18nProvider i18n={i18n}>
			<TokenSelectorContent
				selectedMarket={undefined}
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
				headingId="real-store-selector-heading"
			/>
		</I18nProvider>
	);
}

describe("token selector cross-tab favorites sync with real market store", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		localStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.markets = [livePerpMarket("ETH")];
		testState.catalogState = makeStaleIdleCatalogState();
		testState.onValueChange.mockReset();
		testState.onOpenChange.mockReset();

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
		localStorage.clear();
		vi.restoreAllMocks();
	});

	function syncFavoritesFromOtherTab(favoriteMarkets: string[]) {
		const raw = JSON.stringify({
			state: {
				selectedMarkets: { all: "BTC", perp: "BTC", spot: "@1", "builders-perp": "xyz:XYZ100" },
				favoriteMarkets,
			},
			version: 3,
		});
		localStorage.setItem(STORAGE_KEYS.MARKET_PREFS, raw);
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: STORAGE_KEYS.MARKET_PREFS,
					newValue: raw,
					storageArea: window.localStorage,
				}),
			);
		});
	}

	it("does not revive ETH highlight or Enter navigation after unfavoriting the last favorite and restoring via storage sync", () => {
		syncFavoritesFromOtherTab(["ETH"]);

		act(() => {
			root.render(<SelectorWithRealMarketStore />);
		});

		const favScopeBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent === "Favorites",
		);
		act(() => favScopeBtn?.click());

		const input = container.querySelector<HTMLInputElement>('input[type="search"]');
		const initialActiveId = input?.getAttribute("aria-activedescendant");
		expect(initialActiveId).toBeTruthy();
		expect(initialActiveId ? document.getElementById(initialActiveId)?.getAttribute("data-index") : null).toBe("ETH");

		const ethStar = container.querySelector<HTMLButtonElement>('button[aria-label="Remove ETH-USDC from favorites"]');
		expect(ethStar).not.toBeNull();
		act(() => {
			ethStar?.focus();
			ethStar?.click();
		});

		expect(document.activeElement).toBe(input);
		expect(
			[...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Retry"),
		).toBeDefined();

		syncFavoritesFromOtherTab(["ETH"]);

		expect(container.querySelector('[role="option"][data-index="ETH"]')).not.toBeNull();
		expect(input?.getAttribute("aria-activedescendant")).toBeNull();

		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(testState.onValueChange).not.toHaveBeenCalled();

		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		});
		const recoveredActiveId = input?.getAttribute("aria-activedescendant");
		expect(recoveredActiveId).toBeTruthy();
		expect(recoveredActiveId ? document.getElementById(recoveredActiveId)?.getAttribute("data-index") : null).toBe(
			"ETH",
		);

		act(() => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(testState.onValueChange).toHaveBeenCalledWith("ETH", expect.objectContaining({ name: "ETH" }));
	});
});
