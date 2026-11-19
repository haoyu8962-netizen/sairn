// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserFunding } from "@/lib/trade/user-funding";

type HistoricalOrder = HistoricalOrdersResponse[number];

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const BASE_TIME = 1_800_000_000_000;

const live = vi.hoisted(() => {
	type Snapshot = {
		data: Record<string, unknown> | undefined;
		error: unknown;
		isStale: boolean;
		status: "active" | "error" | "subscribing";
	};
	const listeners = new Set<() => void>();
	const empty: Snapshot = { data: undefined, error: null, isStale: false, status: "active" };
	let snapshots: Record<string, Snapshot> = {};
	return {
		get: (method: string) => snapshots[method] ?? empty,
		set(method: string, next: Partial<Snapshot>) {
			snapshots = { ...snapshots, [method]: { ...(snapshots[method] ?? empty), ...next } };
			for (const listener of listeners) listener();
		},
		reset() {
			snapshots = {};
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
});

const mocks = vi.hoisted(() => ({
	historicalOrders: vi.fn(),
	userFunding: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children?: ReactNode }) => <a href="/history">{children}</a>,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: OWNER, isConnected: true }),
}));

vi.mock("@/hooks/trade/use-history-csv-export", () => ({
	useFundingHistoryCsvExport: () => ({ exportCsv: async () => undefined, isExporting: false }),
	useHistoricalOrdersCsvExport: () => ({ exportCsv: async () => undefined, isExporting: false }),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ setActiveTab: vi.fn() }),
}));

vi.mock("@/components/trade/components/historical-order-price", () => ({
	HistoricalOrderPrice: () => <>100</>,
}));

vi.mock("@/components/trade/components/asset-badge", () => ({
	AssetBadge: (props: { coin: string; "aria-label": string }) => (
		<button type="button" aria-label={props["aria-label"]}>
			{props.coin}
		</button>
	),
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ScrollBar: () => null,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		env: "Mainnet",
		info: { historicalOrders: mocks.historicalOrders, userFunding: mocks.userFunding },
	}),
	useMarkets: () => ({
		getMarket: (coin: string) => ({ kind: "perp", name: coin, shortName: coin, szDecimals: 3 }),
		getSzDecimals: () => 3,
		getTokenDisplayName: (name: string) => name,
	}),
	useSubscription: (method: string, _params: unknown, options: { enabled?: boolean }) => {
		const snapshot = useSyncExternalStore(
			live.subscribe,
			() => live.get(method),
			() => live.get(method),
		);
		return options.enabled === false ? { data: undefined, error: null, isStale: false, status: "idle" } : snapshot;
	},
}));

import { MobileFundingTab } from "@/components/trade/mobile/mobile-funding-tab";
import { MobileOrdersHistoryTab } from "@/components/trade/mobile/mobile-orders-history-tab";
import { OrdersHistoryTab } from "@/components/trade/positions/orders-history-tab";
import { ORDER_HISTORY_API_LIMIT } from "@/lib/trade/order-history-page";

function order(index: number, overrides: Partial<HistoricalOrder["order"]> = {}, status = "filled"): HistoricalOrder {
	return {
		order: {
			children: [],
			cloid: null,
			coin: "BTC",
			isPositionTpsl: false,
			isTrigger: false,
			limitPx: "100",
			oid: index,
			orderType: "Limit",
			origSz: "1",
			reduceOnly: false,
			side: "B",
			sz: "0",
			tif: "Gtc",
			timestamp: BASE_TIME + index,
			triggerCondition: "N/A",
			triggerPx: "0",
			...overrides,
		},
		status,
		statusTimestamp: BASE_TIME + index,
	} as HistoricalOrder;
}

function recentOrders(): HistoricalOrder[] {
	return Array.from({ length: 30 }, (_, index) => order(1_000 + index)).reverse();
}

function setLiveOrders(orders: HistoricalOrder[]) {
	live.set("userHistoricalOrders", {
		data: { orderHistory: orders, user: OWNER },
		error: null,
		isStale: false,
		status: "active",
	});
}

function funding(index: number, szi = "1"): UserFunding {
	return {
		coin: "BTC",
		fundingRate: "0.0001",
		nSamples: null,
		szi,
		time: BASE_TIME + index * 3_600_000,
		usdc: "-0.1",
	};
}

function recentLongFundings(): UserFunding[] {
	return Array.from({ length: 30 }, (_, index) => funding(1_000 + index)).reverse();
}

function setLiveFundings(fundings: UserFunding[]) {
	live.set("userFundings", { data: { fundings, user: OWNER }, error: null, isStale: false, status: "active" });
}

function fundingResponse(fundings: UserFunding[]) {
	return [...fundings]
		.sort((left, right) => left.time - right.time)
		.map((entry) => ({
			delta: {
				coin: entry.coin,
				fundingRate: entry.fundingRate,
				nSamples: entry.nSamples,
				szi: entry.szi,
				type: "funding",
				usdc: entry.usdc,
			},
			hash: `0x${"0".repeat(64)}`,
			time: entry.time,
		}));
}

interface Deferred<T> {
	resolve: (value: T) => void;
	reject: (error: Error) => void;
}

function defer<T>(mock: typeof mocks.historicalOrders): Deferred<T>[] {
	const pending: Deferred<T>[] = [];
	mock.mockImplementation(
		() =>
			new Promise<T>((resolve, reject) => {
				pending.push({ resolve, reject });
			}),
	);
	return pending;
}

describe("order and funding filter backfill", () => {
	let client: QueryClient;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(BASE_TIME + 1_100 * 3_600_000);
		client = new QueryClient({ defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } } });
		mocks.historicalOrders.mockReset();
		mocks.userFunding.mockReset();
		live.reset();
		setLiveOrders(recentOrders());
		setLiveFundings(recentLongFundings());
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		client.clear();
		vi.useRealTimers();
	});

	async function flush() {
		for (let step = 0; step < 6; step += 1) {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
		}
	}

	async function render(children: ReactNode) {
		await act(async () =>
			root.render(
				<QueryClientProvider client={client}>
					<I18nProvider i18n={i18n}>{children}</I18nProvider>
				</QueryClientProvider>,
			),
		);
		await flush();
	}

	async function selectOption(fieldLabel: string, optionLabel: string) {
		const label = Array.from(container.querySelectorAll("label")).find(
			(candidate) => candidate.textContent === fieldLabel,
		);
		const trigger = label?.parentElement?.querySelector<HTMLButtonElement>('[role="combobox"]');
		expect(trigger).toBeDefined();
		await act(async () => {
			trigger?.click();
			await Promise.resolve();
		});
		const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
			(candidate) => candidate.textContent?.trim() === optionLabel,
		);
		expect(option, `option ${optionLabel}`).toBeDefined();
		await act(async () => {
			option?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
			await Promise.resolve();
			option?.click();
			await Promise.resolve();
		});
		await flush();
	}

	function retryButton(): HTMLButtonElement | undefined {
		return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent?.trim() === "Retry",
		);
	}

	describe("order history", () => {
		it("loads historicalOrders only while a filter is on and finds an order older than the latest 30", async () => {
			const olderSell = order(1, { coin: "SOL", side: "A" });
			mocks.historicalOrders.mockResolvedValue([...recentOrders(), olderSell]);
			await render(<MobileOrdersHistoryTab scrollMode="page" />);
			expect(mocks.historicalOrders).not.toHaveBeenCalled();
			expect(container.querySelectorAll("article")).toHaveLength(30);

			await selectOption("Direction", "Sell");

			expect(mocks.historicalOrders).toHaveBeenCalledOnce();
			expect(mocks.historicalOrders).toHaveBeenCalledWith({ user: OWNER }, expect.any(AbortSignal));
			expect(container.querySelectorAll("article")).toHaveLength(1);
			expect(container.textContent).toContain("SOL");
			expect(container.textContent).not.toContain("No orders match these filters");
		});

		it("offers a status that only an order beyond the latest 30 live orders has", async () => {
			const liveOrders = [...recentOrders(), order(1, { coin: "SOL" }, "rejected")];
			setLiveOrders(liveOrders);
			mocks.historicalOrders.mockResolvedValue(liveOrders);
			await render(<MobileOrdersHistoryTab scrollMode="page" />);

			await selectOption("Order status", "Rejected");
			expect(container.querySelectorAll("article")).toHaveLength(1);
			expect(container.textContent).toContain("SOL");
		});

		it("stays quiet while the snapshot loads and offers only a neutral Retry when it fails", async () => {
			const pending = defer<HistoricalOrder[]>(mocks.historicalOrders);
			await render(<MobileOrdersHistoryTab scrollMode="page" />);
			await selectOption("Direction", "Sell");

			expect(container.textContent).not.toContain("No orders match these filters");
			expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
			expect(retryButton()).toBeUndefined();

			await act(async () => pending.shift()?.reject(new Error("upstream unavailable")));
			await flush();
			expect(container.textContent).not.toContain("No orders match these filters");
			expect(container.textContent).not.toContain("upstream unavailable");
			const retry = retryButton();
			expect(retry).toBeDefined();

			await act(async () => retry?.click());
			await flush();
			expect(mocks.historicalOrders).toHaveBeenCalledTimes(2);
			await act(async () => pending.shift()?.resolve(recentOrders()));
			await flush();
			expect(container.textContent).toContain("No orders match these filters.");
			expect(retryButton()).toBeUndefined();
		});

		it("names the 2,000-order boundary when a capped snapshot has no match", async () => {
			mocks.historicalOrders.mockResolvedValue(
				Array.from({ length: ORDER_HISTORY_API_LIMIT }, (_, index) => order(ORDER_HISTORY_API_LIMIT - index)),
			);
			setLiveOrders(Array.from({ length: 30 }, (_, index) => order(ORDER_HISTORY_API_LIMIT - index)));
			await render(<MobileOrdersHistoryTab scrollMode="page" />);
			await selectOption("Direction", "Sell");

			expect(container.textContent).toContain("No orders match these filters.");
			expect(container.textContent).toContain("Up to 2,000 most recent ordinary orders");
		});

		it("does not conclude while the live orders no longer reach the snapshot", async () => {
			mocks.historicalOrders.mockResolvedValue(recentOrders());
			await render(<MobileOrdersHistoryTab scrollMode="page" />);
			await selectOption("Direction", "Sell");
			expect(container.textContent).toContain("No orders match these filters.");

			setLiveOrders(Array.from({ length: 30 }, (_, index) => order(3_000 + index)).reverse());
			await flush();
			expect(container.textContent).not.toContain("No orders match these filters");
			expect(retryButton()).toBeDefined();
		});
	});

	describe("desktop order history", () => {
		it("searches the live buffer and the historicalOrders snapshot once a filter is on", async () => {
			setLiveOrders([...recentOrders(), order(1, { coin: "SOL" }, "rejected")]);
			const pending = defer<HistoricalOrder[]>(mocks.historicalOrders);
			await render(<OrdersHistoryTab />);
			expect(mocks.historicalOrders).not.toHaveBeenCalled();
			expect(container.querySelectorAll("tbody tr")).toHaveLength(30);

			await selectOption("Order status", "Rejected");
			expect(mocks.historicalOrders).toHaveBeenCalledOnce();
			expect(container.querySelectorAll("tbody tr")).toHaveLength(1);

			await act(async () =>
				pending
					.shift()
					?.resolve([...recentOrders(), order(1, { coin: "SOL" }, "rejected"), order(0, { coin: "ETH" }, "rejected")]),
			);
			await flush();
			expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
			expect(container.textContent).toContain("ETH");
		});

		it("keeps a no-match conclusion back until the snapshot loads and offers a neutral Retry on failure", async () => {
			setLiveOrders([...recentOrders(), order(1, { coin: "SOL", orderType: "Stop Market" }, "canceled")]);
			const pending = defer<HistoricalOrder[]>(mocks.historicalOrders);
			await render(<OrdersHistoryTab />);

			await selectOption("Order type", "Stop Market");
			await selectOption("Order status", "Filled");
			expect(container.textContent).not.toContain("No orders match these filters");
			expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

			await act(async () => pending.shift()?.reject(new Error("upstream unavailable")));
			await flush();
			expect(container.textContent).not.toContain("No orders match these filters");
			expect(container.textContent).not.toContain("upstream unavailable");
			const retry = retryButton();
			expect(retry).toBeDefined();

			await act(async () => retry?.click());
			await flush();
			await act(async () => pending.shift()?.resolve(recentOrders()));
			await flush();
			expect(container.textContent).toContain("No orders match these filters.");
		});
	});

	describe("funding history", () => {
		it("loads the 30-day userFunding window only while the filter is on and finds a payment older than the latest 30", async () => {
			const olderShort = { ...funding(900, "-2"), coin: "SOL" };
			mocks.userFunding.mockResolvedValue(fundingResponse([...recentLongFundings(), olderShort]));
			await render(<MobileFundingTab scrollMode="page" />);
			expect(mocks.userFunding).not.toHaveBeenCalled();
			expect(container.querySelectorAll("article")).toHaveLength(30);

			await selectOption("Direction", "Short");

			expect(mocks.userFunding).toHaveBeenCalledOnce();
			expect(container.querySelectorAll("article")).toHaveLength(1);
			expect(container.querySelector('[aria-label="Switch to SOL market"]')).not.toBeNull();
			expect(container.textContent).not.toContain("No funding payments match this direction");
		});

		it("stays quiet while the window loads and offers only a neutral Retry when it fails", async () => {
			const pending = defer<unknown[]>(mocks.userFunding);
			await render(<MobileFundingTab scrollMode="page" />);
			await selectOption("Direction", "Short");

			expect(container.textContent).not.toContain("No funding payments match this direction");
			expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
			expect(retryButton()).toBeUndefined();

			await act(async () => pending.shift()?.reject(new Error("upstream unavailable")));
			await flush();
			expect(container.textContent).not.toContain("No funding payments match this direction");
			expect(container.textContent).not.toContain("upstream unavailable");
			const retry = retryButton();
			expect(retry).toBeDefined();

			await act(async () => retry?.click());
			await flush();
			await act(async () => pending.shift()?.resolve(fundingResponse(recentLongFundings())));
			await flush();
			expect(container.textContent).toContain("No funding payments match this direction.");
		});
	});
});
