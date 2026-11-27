/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileOrdersTab } from "@/components/trade/mobile/mobile-orders-tab";
import type { OpenOrder } from "@/lib/trade/open-orders";
import { getPendingTradingActionActions } from "@/stores/use-pending-trading-action-store";
import { createI18nRoot } from "./harness/react";

const queryClient = new QueryClient();

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111",
	orders: [] as OpenOrder[],
	navigateToMarket: vi.fn(),
	setActiveTab: vi.fn(),
	setSide: vi.fn(),
}));

const builderPerpOrder = {
	children: [],
	cloid: null,
	coin: "xyz:ORCL",
	isPositionTpsl: false,
	isTrigger: false,
	limitPx: "150.25",
	oid: 42,
	orderType: "Limit",
	origSz: "123456.789",
	reduceOnly: false,
	side: "B",
	sz: "123456.789",
	tif: "Gtc",
	timestamp: 1_786_000_000_000,
	triggerCondition: "N/A",
	triggerPx: "0",
} as unknown as OpenOrder;

const groupedTriggerOrder = {
	...builderPerpOrder,
	oid: 44,
	isTrigger: true,
	triggerCondition: "Price below 149.00",
	triggerPx: "149.00",
	children: [
		{ coin: "xyz:ORCL", oid: 50, orderType: "Take Profit Market", triggerPx: "180.5" },
		{ coin: "xyz:ORCL", oid: 51, orderType: "Stop Market", triggerPx: "140.25" },
	],
} as unknown as OpenOrder;

const spotOrder = {
	children: [],
	cloid: null,
	coin: "@1",
	isPositionTpsl: false,
	isTrigger: false,
	limitPx: "24.5",
	oid: 43,
	orderType: "Limit",
	origSz: "50",
	reduceOnly: false,
	side: "A",
	sz: "50",
	tif: "Gtc",
	timestamp: 1_786_000_000_000,
	triggerCondition: "N/A",
	triggerPx: "0",
} as unknown as OpenOrder;

vi.mock("@/lib/geo/get-geo", () => ({
	getGeo: vi.fn().mockResolvedValue({ country: "GB", proxy: false, tradeRestricted: false }),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => mocks.navigateToMarket,
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ setActiveTab: mocks.setActiveTab }),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setSide: mocks.setSide }),
}));

vi.mock("@/hooks/trade/use-order-display-labels", () => ({
	useOrderDisplayLabels: () => ({
		getFullOrderTypeLabel: (currentOrder: OpenOrder) => currentOrder.orderType,
		getOrderSideLabel: (side: "A" | "B") => (side === "B" ? "Buy" : "Sell"),
		getOrderTypeLabel: (orderType: OpenOrder["orderType"]) => orderType,
		getTriggerConditionLabel: (condition: string) => condition,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: mocks.address, isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: () => ({ mutateAsync: vi.fn(), error: null, reset: vi.fn() }),
	useHyperliquid: () => ({ clientKey: mocks.address, env: "Mainnet" as const }),
	useMarkets: () => ({
		error: null,
		isLoading: false,
		getAssetId: (coin: string) => (coin === "@1" ? 10_001 : 120_001),
		getSzDecimals: () => 3,
		getMarket: (coin: string) => {
			if (coin === "@1") {
				return {
					assetId: 10_001,
					kind: "spot" as const,
					name: "@1",
					shortName: "HYPE",
					pairName: "HYPE/USDC",
					szDecimals: 2,
				};
			}
			return {
				assetId: 120_001,
				kind: "builderPerp" as const,
				name: "xyz:ORCL",
				shortName: "ORCL",
				pairName: "ORCL-USDC",
				dex: "xyz",
				szDecimals: 3,
			};
		},
	}),
	useMarketsInfo: () => ({
		getMarketInfo: () => ({
			markPx: "160",
			markPriceStatus: "success" as const,
			markPriceReceivedAt: Date.now(),
		}),
	}),
	useSubscription: () => ({
		data: { orders: mocks.orders },
		error: null,
		isStale: false,
		status: "active" as const,
	}),
}));

describe("MobileOrdersTab market DEX identity and non-truncating details (B-01, B-02)", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeAll(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn((query: string) => ({
				matches: true,
				media: query,
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		});
	});

	beforeEach(() => {
		queryClient.clear();
		queryClient.setQueryData(["geo", null], { country: "GB", proxy: false, tradeRestricted: false });
		getPendingTradingActionActions().reset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.orders = [builderPerpOrder, spotOrder];
		mocks.navigateToMarket.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderOrders() {
		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<MobileOrdersTab scrollMode="page" />
				</QueryClientProvider>,
			);
		});
	}

	it("shows DEX badge on builderPerp orders, pairName on spot orders, and DEX in modify drawer (B-01)", () => {
		renderOrders();

		const perpMarketBtn = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Switch to ORCL (xyz) market"]',
		);
		expect(perpMarketBtn).not.toBeNull();
		expect(perpMarketBtn?.textContent).toContain("ORCL");
		expect(perpMarketBtn?.textContent).toContain("xyz");
		act(() => perpMarketBtn?.click());
		expect(mocks.navigateToMarket).toHaveBeenCalledWith("xyz:ORCL", undefined, { displayedContent: "trade" });

		const spotMarketBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Switch to HYPE/USDC market"]');
		expect(spotMarketBtn).not.toBeNull();
		expect(spotMarketBtn?.textContent).toContain("HYPE/USDC");

		const expandPerp = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Expand ORCL (xyz) order details"]',
		);
		expect(expandPerp).not.toBeNull();
		act(() => expandPerp?.click());

		const modifyBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Modify Order",
		);
		act(() => modifyBtn?.click());

		const marketDd = [...document.body.querySelectorAll("dt")].find(
			(dt) => dt.textContent?.trim() === "Market",
		)?.nextElementSibling;
		expect(marketDd?.textContent?.trim()).toBe("ORCL (xyz)");
	});

	it("renders expanded order metrics in a non-truncating 2-column grid with full-width trigger and TP/SL (B-02)", () => {
		mocks.orders = [groupedTriggerOrder];
		renderOrders();

		const expandPerp = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Expand ORCL (xyz) order details"]',
		);
		act(() => expandPerp?.click());

		const detailsId = container
			.querySelector<HTMLButtonElement>('button[aria-label="Collapse ORCL (xyz) order details"]')
			?.getAttribute("aria-controls");
		const details = detailsId ? document.getElementById(detailsId) : null;
		expect(details).not.toBeNull();
		expect(details?.querySelectorAll(".truncate")).toHaveLength(0);

		const grid = details?.querySelector<HTMLDivElement>(":scope > div.grid");
		expect(grid?.className).toContain("grid-cols-2");

		const triggerMetric = [...(details?.querySelectorAll<HTMLElement>("div") ?? [])].find(
			(el) => el.children.length === 0 && el.textContent?.trim() === "Trigger Condition",
		)?.parentElement;
		const tpSlMetric = [...(details?.querySelectorAll<HTMLElement>("div") ?? [])].find(
			(el) => el.children.length === 0 && el.textContent?.trim() === "TP/SL",
		)?.parentElement;
		expect(triggerMetric?.className).toContain("col-span-2");
		expect(tpSlMetric?.className).toContain("col-span-2");
	});
});
