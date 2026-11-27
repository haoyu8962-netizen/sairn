// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandMenu } from "@/components/trade/components/command-menu";
import { createMarketCatalogState, type MarketCatalogQueries } from "@/lib/hyperliquid/markets/market-catalog-state";

const mocks = vi.hoisted(() => ({
	markets: [] as unknown[],
	isLoading: false,
	error: null as Error | null,
	catalogState: undefined as unknown,
	retryMarketCatalog: vi.fn(),
}));

vi.mock("@/components/ui/command", () => ({
	CommandDialog: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
		<div data-title={title} data-description={description}>
			{children}
		</div>
	),
	CommandInput: ({
		placeholder,
		value,
		onValueChange,
	}: {
		placeholder: string;
		value?: string;
		onValueChange?: (value: string) => void;
	}) => (
		<input placeholder={placeholder} value={value ?? ""} onChange={(event) => onValueChange?.(event.target.value)} />
	),
	CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CommandEmpty: ({ children }: { children: ReactNode }) => <p data-empty="">{children}</p>,
	CommandItem: ({ children }: { children: ReactNode }) => <div data-item="">{children}</div>,
}));

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span>{coin}</span>,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarketsInfo: () => ({
		markets: mocks.markets,
		isLoading: mocks.isLoading,
		error: mocks.error,
		catalogState: mocks.catalogState,
		retryMarketCatalog: mocks.retryMarketCatalog,
	}),
}));
vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));
vi.mock("@/stores/use-global-modal-store", () => ({
	useCommandMenuOpen: () => true,
	useCommandMenuActions: () => ({ close: vi.fn() }),
}));

const MENU_MESSAGES = [
	"Search markets",
	"Search for a market to trade",
	"Search markets...",
	"No markets found.",
	"Perp",
	"Spot",
];

function readChineseMessages(): Messages {
	const catalog = readFileSync(resolve(__dirname, "../../locales/zh/messages.po"), "utf8");
	return Object.fromEntries(
		MENU_MESSAGES.map((message) => {
			const match = new RegExp(`\\nmsgid "${message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\nmsgstr "(.+)"\\n`).exec(
				catalog,
			);
			if (!match) throw new Error(`no Chinese translation for ${message}`);
			return [createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6), match[1]];
		}),
	);
}

describe("command menu", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		mocks.isLoading = false;
		mocks.error = null;
		mocks.catalogState = {
			status: "ready",
			canResolveNotFound: true,
			isRefreshing: false,
			isRestoring: false,
			isPaused: false,
			isStale: false,
			error: null,
		};
		mocks.retryMarketCatalog.mockReset();
		mocks.retryMarketCatalog.mockResolvedValue(undefined);
		const now = Date.now();
		mocks.markets = [
			{
				kind: "perp",
				name: "BTC",
				shortName: "BTC",
				pairName: "BTC-USDC",
				szDecimals: 5,
				markPx: "77559.123",
				markPriceStatus: "success",
				markPriceReceivedAt: now,
			},
			{
				kind: "spot",
				name: "@107",
				shortName: "HYPE",
				pairName: "HYPE/USDC",
				tokensInfo: [{ name: "HYPE" }, { name: "USDC" }],
				szDecimals: 0,
				markPx: "0.0012345678",
				markPriceStatus: "success",
				markPriceReceivedAt: now,
			},
			{
				kind: "builderPerp",
				name: "xyz:AAPL",
				shortName: "AAPL",
				pairName: "AAPL-USDC",
				dex: "xyz",
				quoteToken: null,
				szDecimals: 2,
				markPx: "0.123456",
				markPriceStatus: "success",
				markPriceReceivedAt: now,
			},
		];
		i18n.loadAndActivate({ locale: "zh", messages: readChineseMessages() });
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<CommandMenu />
				</I18nProvider>,
			),
		);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("names the dialog, the search field and the empty result in the interface language", () => {
		const dialog = container.querySelector<HTMLElement>("[data-title]");

		expect(dialog?.dataset.title).toBe("搜索市场");
		expect(dialog?.dataset.description).toBe("搜索要交易的市场");
		expect(container.querySelector("input")?.placeholder).toBe("搜索市场...");
		expect(container.querySelector("[data-empty]")?.textContent).toBe("未找到市场。");
	});

	it("labels each market kind like the market selector and prices spot markets with spot decimals", () => {
		const rows = [...container.querySelectorAll("[data-item]")].map((row) => row.textContent);

		expect(rows).toEqual(["BTC$77,559永续", "@107$0.0012346现货", "xyz:AAPL$0.1235xyz"]);
	});

	it("renders a placeholder instead of stale prices when quote freshness fails", () => {
		mocks.markets = [
			{
				kind: "perp",
				name: "BTC",
				shortName: "BTC",
				pairName: "BTC-USDC",
				szDecimals: 5,
				markPx: "77559.123",
				markPriceStatus: "stale",
				markPriceReceivedAt: Date.now() - 20_000,
			},
		];
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<CommandMenu />
				</I18nProvider>,
			),
		);

		const rows = [...container.querySelectorAll("[data-item]")].map((row) => row.textContent);
		expect(rows).toEqual(["BTC-永续"]);
	});

	it("renders a busy placeholder while the catalog is loading and neutral retry on catalog error", () => {
		mocks.markets = [];
		mocks.isLoading = true;
		mocks.catalogState = {
			status: "loading",
			canResolveNotFound: false,
			isRefreshing: false,
			isRestoring: false,
			isPaused: false,
			isStale: true,
			error: null,
		};
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<CommandMenu />
				</I18nProvider>,
			),
		);

		expect(container.querySelector("[data-empty]")).toBeNull();
		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

		mocks.isLoading = false;
		mocks.error = new Error("boom");
		mocks.catalogState = {
			status: "error",
			canResolveNotFound: false,
			isRefreshing: false,
			isRestoring: false,
			isPaused: false,
			isStale: true,
			error: mocks.error,
		};
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<CommandMenu />
				</I18nProvider>,
			),
		);

		expect(container.querySelector("[data-empty]")).toBeNull();
		expect(container.querySelector('[role="alert"]')).toBeNull();
		const retryBtn = container.querySelector<HTMLButtonElement>("button");
		expect(retryBtn).not.toBeNull();
		act(() => retryBtn?.click());
		expect(mocks.retryMarketCatalog).toHaveBeenCalledTimes(1);
	});

	it("keeps available markets visible and avoids false empty states when only part of the catalog is loaded", () => {
		const now = Date.now();
		mocks.markets = [
			{
				kind: "perp",
				name: "BTC",
				shortName: "BTC",
				pairName: "BTC-USDC",
				szDecimals: 5,
				markPx: "77559.123",
				markPriceStatus: "success",
				markPriceReceivedAt: now,
			},
		];
		mocks.catalogState = {
			status: "ready",
			canResolveNotFound: false,
			isRefreshing: true,
			isRestoring: false,
			isPaused: false,
			isStale: true,
			error: null,
		};
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<CommandMenu />
				</I18nProvider>,
			),
		);

		expect(container.querySelectorAll("[data-item]")).toHaveLength(1);
		expect(container.querySelector("[data-empty]")).toBeNull();

		const input = container.querySelector<HTMLInputElement>("input");
		expect(input).not.toBeNull();
		const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		act(() => {
			valueSetter?.call(input, "HYPE");
			input?.dispatchEvent(new Event("input", { bubbles: true }));
		});

		expect(container.querySelector("[data-empty]")).toBeNull();
		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

		mocks.catalogState = {
			status: "ready",
			canResolveNotFound: false,
			isRefreshing: false,
			isRestoring: false,
			isPaused: false,
			isStale: true,
			error: new Error("spot catalog failed"),
		};
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<CommandMenu />
				</I18nProvider>,
			),
		);

		expect(container.querySelector("[data-empty]")).toBeNull();
		expect(container.querySelector('[role="alert"]')).toBeNull();
		const retryBtn = container.querySelector<HTMLButtonElement>("button");
		expect(retryBtn).not.toBeNull();
		act(() => retryBtn?.click());
		expect(mocks.retryMarketCatalog).toHaveBeenCalledTimes(1);
	});

	// r5 D-01
	it("shows neutral retry when an idle catalog is stale or incomplete with zero matches, while keeping matches visible", () => {
		const now = Date.now();
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

		const staleQueries: MarketCatalogQueries = {
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
		};

		mocks.markets = [
			{
				kind: "perp",
				name: "BTC",
				shortName: "BTC",
				pairName: "BTC-USDC",
				szDecimals: 5,
				markPx: "77559.123",
				markPriceStatus: "success",
				markPriceReceivedAt: now,
			},
		];
		mocks.catalogState = createMarketCatalogState({
			isRestoring: false,
			hasUsableMarkets: true,
			queries: staleQueries,
		});
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<CommandMenu />
				</I18nProvider>,
			),
		);

		expect(container.querySelectorAll("[data-item]")).toHaveLength(1);
		expect(container.querySelector("[data-empty]")).toBeNull();
		expect(container.querySelector('[aria-busy="true"]')).toBeNull();

		const input = container.querySelector<HTMLInputElement>("input");
		const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		act(() => {
			valueSetter?.call(input, "NO_SUCH_MARKET");
			input?.dispatchEvent(new Event("input", { bubbles: true }));
		});

		expect(container.querySelector('[aria-busy="true"]')).toBeNull();
		expect(container.querySelector("[data-empty]")).toBeNull();
		expect(container.querySelector('[role="alert"]')).toBeNull();
		const retryBtn = container.querySelector<HTMLButtonElement>("button");
		expect(retryBtn).not.toBeNull();
		act(() => retryBtn?.click());
		expect(mocks.retryMarketCatalog).toHaveBeenCalledTimes(1);

		mocks.catalogState = createMarketCatalogState({
			isRestoring: false,
			hasUsableMarkets: true,
			queries: {
				...staleQueries,
				spotMeta: {
					data: { tokens: [null], universe: [] } as unknown as SpotMetaResponse,
					status: "success",
					fetchStatus: "idle",
					error: null,
					isStale: false,
					refetch: vi.fn(async () => undefined),
				},
				perpDexs: { ...staleQueries.perpDexs, isStale: false },
			},
		});
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<CommandMenu />
				</I18nProvider>,
			),
		);

		expect(container.querySelector('[aria-busy="true"]')).toBeNull();
		expect(container.querySelector("[data-empty]")).toBeNull();
		const invalidRetryBtn = container.querySelector<HTMLButtonElement>("button");
		expect(invalidRetryBtn).not.toBeNull();
		act(() => invalidRetryBtn?.click());
		expect(mocks.retryMarketCatalog).toHaveBeenCalledTimes(2);

		mocks.catalogState = createMarketCatalogState({
			isRestoring: false,
			hasUsableMarkets: true,
			queries: {
				...staleQueries,
				perpDexs: { ...staleQueries.perpDexs, fetchStatus: "fetching" },
			},
		});
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<CommandMenu />
				</I18nProvider>,
			),
		);

		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
		expect(container.querySelector("button")).toBeNull();
	});
});
