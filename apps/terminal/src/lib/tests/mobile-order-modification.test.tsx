/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { HttpRequestError } from "@nktkas/hyperliquid";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileOrdersTab } from "@/components/trade/mobile/mobile-orders-tab";
import type { OpenOrder } from "@/lib/trade/open-orders";
import {
	getOrderQueueItem,
	type OrderQueueItem,
	removeOrderQueueItem,
	useOrderQueue,
} from "@/stores/use-order-queue-store";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	getPendingTradingActionToastId,
} from "@/stores/use-pending-trading-action-store";
import { createI18nRoot } from "./harness/react";

let queueItems: OrderQueueItem[] = [];
function ReviewedOrders() {
	queueItems = useOrderQueue();
	return <MobileOrdersTab scrollMode="page" />;
}

const mocks = vi.hoisted(() => ({
	markPriceLive: false,
	address: "0x1111111111111111111111111111111111111111",
	assetId: 120_001 as number | undefined,
	batchModifyGuard: undefined as ((params: unknown) => void) | undefined,
	cancelOrders: vi.fn(),
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	markPx: "160",
	marketsError: null as Error | null,
	marketsLoading: false,
	modifyOrders: vi.fn(),
	orders: [] as OpenOrder[],
	ordersStale: false,
	resetCancelError: vi.fn(),
	resetModifyError: vi.fn(),
	toastError: vi.fn(),
	toastInfo: vi.fn(),
	toastSuccess: vi.fn(),
	toastWarning: vi.fn(),
}));

const triggerOrder = {
	children: [],
	cloid: null,
	coin: "xyz:ORCL",
	isPositionTpsl: false,
	isTrigger: false,
	limitPx: "170",
	oid: 42,
	orderType: "Limit",
	origSz: "5.000",
	reduceOnly: true,
	side: "B",
	sz: "2.000",
	tif: "Gtc",
	timestamp: 1_786_000_000_000,
	triggerCondition: "N/A",
	triggerPx: "0",
} as OpenOrder;

const reduceOnlyStopOrder = {
	...triggerOrder,
	isTrigger: true,
	orderType: "Stop Market",
	tif: null,
	triggerCondition: "Price above 170",
	triggerPx: "170",
} as OpenOrder;

const unsafeTriggerOrder = { ...reduceOnlyStopOrder, reduceOnly: false } as OpenOrder;

const MODIFICATION_UNCONFIRMED_MESSAGE =
	"The order update was not confirmed by live data. Refresh before retrying; cancellation remains available.";
const MODIFICATION_UNCONFIRMED_MESSAGE_AR =
	"لم تؤكد البيانات المباشرة تحديث الطلب. حدّث الطلبات قبل إعادة المحاولة؛ ولا يزال الإلغاء متاحاً.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(MODIFICATION_UNCONFIRMED_MESSAGE)]: MODIFICATION_UNCONFIRMED_MESSAGE_AR,
};

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/hooks/trade/use-order-display-labels", () => ({
	useOrderDisplayLabels: () => ({
		getFullOrderTypeLabel: (order: OpenOrder) => `${order.orderType}${order.reduceOnly ? " · Reduce Only" : ""}`,
		getOrderSideLabel: () => "Close Short",
		getOrderTypeLabel: (orderType: OpenOrder["orderType"]) => orderType,
		getTriggerConditionLabel: (condition: string) => condition,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: mocks.address,
		isConnected: true,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (method: string, options?: { executionGuard?: (params: unknown) => void }) => {
		if (method === "batchModify") {
			mocks.batchModifyGuard = options?.executionGuard;
			return { mutateAsync: mocks.modifyOrders, error: null, reset: mocks.resetModifyError };
		}
		return { mutateAsync: mocks.cancelOrders, error: null, reset: mocks.resetCancelError };
	},
	useHyperliquid: () => ({ clientKey: mocks.clientKey, env: mocks.env }),
	useMarkets: () => ({
		error: mocks.marketsError,
		getAssetId: () => mocks.assetId,
		getMarket: () =>
			mocks.assetId === undefined
				? undefined
				: {
						assetId: mocks.assetId,
						kind: "builderPerp",
						name: "xyz:ORCL",
						shortName: "ORCL",
						szDecimals: 3,
					},
		getSzDecimals: () => 3,
		isLoading: mocks.marketsLoading,
	}),
	useMarketsInfo: () => ({
		getMarketInfo: () => ({
			markPx: mocks.markPx,
			markPriceStatus: mocks.markPriceLive ? "success" : undefined,
			markPriceReceivedAt: mocks.markPriceLive ? Date.now() : undefined,
		}),
	}),
	useSubscription: () => ({
		data: { orders: mocks.orders },
		error: null,
		isStale: mocks.ordersStale,
		status: "active",
	}),
}));

vi.mock("sonner", () => ({
	toast: {
		error: mocks.toastError,
		info: mocks.toastInfo,
		success: mocks.toastSuccess,
		warning: mocks.toastWarning,
	},
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setSide: vi.fn() }),
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ setActiveTab: vi.fn() }),
}));

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressKey(input: HTMLInputElement, key: string) {
	input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
}

function findButton(text: string, root: ParentNode = document.body) {
	return [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === text);
}

describe("mobile order modification", () => {
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
		i18n.loadAndActivate({ locale: "en", messages: {} });
		getPendingTradingActionActions().reset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.address = "0x1111111111111111111111111111111111111111";
		mocks.assetId = 120_001;
		mocks.batchModifyGuard = undefined;
		mocks.clientKey = "0x1111111111111111111111111111111111111111";
		mocks.env = "Mainnet";
		mocks.markPx = "160";
		mocks.markPriceLive = false;
		mocks.marketsError = null;
		mocks.marketsLoading = false;
		mocks.orders = [triggerOrder];
		mocks.ordersStale = false;
		mocks.cancelOrders.mockReset();
		mocks.modifyOrders.mockReset();
		mocks.modifyOrders.mockImplementation(async (params: unknown) => {
			mocks.batchModifyGuard?.(params);
			mocks.batchModifyGuard?.(params);
			return { response: { data: { statuses: [{ resting: { oid: 42 } }] } } };
		});
		mocks.resetCancelError.mockReset();
		mocks.resetModifyError.mockReset();
		mocks.toastError.mockReset();
		mocks.toastInfo.mockReset();
		mocks.toastSuccess.mockReset();
		mocks.toastWarning.mockReset();
	});

	afterEach(() => {
		act(() => {
			for (const item of queueItems) removeOrderQueueItem(item.id);
			root.unmount();
		});
		queueItems = [];
		container.remove();
		vi.useRealTimers();
	});

	function openEditor() {
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]')?.click());
		const modify = findButton("Modify Order", container);
		expect(modify).not.toBeUndefined();
		act(() => modify?.click());
		return {
			size: document.body.querySelector<HTMLInputElement>('input[aria-label="Size"]'),
			trigger: document.body.querySelector<HTMLInputElement>('input[aria-label="Trigger Price"]'),
			price: document.body.querySelector<HTMLInputElement>('input[aria-label="Price"]'),
		};
	}

	it("opens a touch-sized drawer and keeps the raw values until confirmation", () => {
		const { size, trigger } = openEditor();
		expect(document.body.textContent).toContain("Modify Order");
		expect(document.body.textContent).toContain("ORCL");
		expect(document.body.textContent).toContain("Close Short");
		expect(document.body.textContent).toContain("Limit · Reduce Only");
		expect(size?.value).toBe("2.000");
		expect(trigger).toBeNull();
		expect(size?.className).toContain("text-base");
		expect(size?.className).not.toContain("text-sm");

		act(() => {
			if (size) changeInput(size, "1.");
		});
		expect(size?.value).toBe("1.");
		const submit = document.body.querySelector<HTMLButtonElement>('button[type="submit"]');
		expect(submit?.className).toContain("min-h-11");
		expect(submit?.className).toContain("text-market-close-on-control");
		expect(submit?.className).not.toContain("text-market-close-control-text");
	});

	it("marks invalid fields with ARIA and disables submission", () => {
		const { size } = openEditor();
		act(() => {
			if (size) changeInput(size, "3.000");
		});
		expect(size?.getAttribute("aria-invalid")).toBe("true");
		expect(size?.getAttribute("aria-describedby")).toBeTruthy();
		expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
			"Size cannot exceed the order's remaining size.",
		);
		expect(document.body.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(true);
		expect(mocks.modifyOrders).not.toHaveBeenCalled();
	});

	it("submits one complete guarded payload and waits for shared reconciliation", async () => {
		const { size } = openEditor();
		await act(async () => {
			if (!size) return;
			changeInput(size, "1.500");
			pressKey(size, "Enter");
			pressKey(size, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		expect(mocks.modifyOrders).toHaveBeenCalledWith({
			modifies: [
				{
					oid: 42,
					order: {
						a: 120_001,
						b: true,
						p: "170",
						s: "1.5",
						r: true,
						t: { limit: { tif: "Gtc" } },
					},
				},
			],
		});
		const pendingModification = getPendingTradingActionSnapshot().modifications[0];
		expect(pendingModification?.phase).toBe("awaiting");
		expect(mocks.toastInfo).not.toHaveBeenCalled();
		expect(getOrderQueueItem(getPendingTradingActionToastId(pendingModification?.id ?? ""))).toMatchObject({
			owner: "0x1111111111111111111111111111111111111111",
			env: "Mainnet",
			status: "confirming",
		});
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
		expect(document.body.textContent).not.toContain("Modifying");
		expect(document.body.textContent).not.toContain("Waiting for confirmation");
		expect(findButton("Modify Order", container)?.disabled).toBe(true);

		await act(async () => {
			if (pendingModification) getPendingTradingActionActions().resolveModification(pendingModification.id);
			await Promise.resolve();
		});
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
	});

	it("changes the price and size of this terminal's own limit order in one replacement", async () => {
		mocks.orders = [{ ...triggerOrder, cloid: "0x0000000000000000000000000000abcd" }];
		const { size, price } = openEditor();
		expect(price?.value).toBe("170.00");
		await act(async () => {
			if (!size || !price) return;
			changeInput(price, "171.5");
			changeInput(size, "1.500");
			pressKey(price, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		expect(mocks.modifyOrders).toHaveBeenCalledWith({
			modifies: [
				{
					oid: 42,
					order: { a: 120_001, b: true, p: "171.5", s: "1.5", r: true, t: { limit: { tif: "Gtc" } } },
				},
			],
		});
		expect(getPendingTradingActionSnapshot().modifications[0]).toMatchObject({
			originalLimitPx: "170",
			expectedLimitPx: "171.5",
			expectedSize: "1.5",
		});
	});

	it("changes only the price, closes at once and waits for the new price alone", async () => {
		let settle!: () => void;
		mocks.modifyOrders.mockImplementation(async (params: unknown) => {
			mocks.batchModifyGuard?.(params);
			await new Promise<void>((resolve) => {
				settle = resolve;
			});
			mocks.batchModifyGuard?.(params);
			return { response: { data: { statuses: [{ resting: { oid: 42 } }] } } };
		});
		const { price } = openEditor();
		await act(async () => {
			if (!price) return;
			changeInput(price, "171.5");
			pressKey(price, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		expect(mocks.modifyOrders).toHaveBeenCalledWith({
			modifies: [
				{ oid: 42, order: { a: 120_001, b: true, p: "171.5", s: "2", r: true, t: { limit: { tif: "Gtc" } } } },
			],
		});
		expect(getPendingTradingActionSnapshot().modifications[0]).toMatchObject({
			originalLimitPx: "170",
			expectedLimitPx: "171.5",
			expectedSize: null,
			expectedTriggerPx: null,
		});
		expect(document.body.querySelector('input[aria-label="Price"]')).toBeNull();
		expect(findButton("Modify Order", container)?.disabled).toBe(true);
		await act(async () => {
			settle();
			await Promise.resolve();
		});
		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
	});

	it("refuses at the SDK boundary a payload whose price differs from the confirmed price", async () => {
		const broadcast = vi.fn();
		mocks.modifyOrders.mockImplementation(
			async (params: { modifies: { oid: number; order: Record<string, unknown> }[] }) => {
				const repriced = {
					modifies: params.modifies.map((modify) => ({ ...modify, order: { ...modify.order, p: "172" } })),
				};
				mocks.batchModifyGuard?.(repriced);
				broadcast(repriced);
				return { response: { data: { statuses: [{ resting: { oid: 42 } }] } } };
			},
		);
		const { price } = openEditor();
		await act(async () => {
			if (!price) return;
			changeInput(price, "171.5");
			pressKey(price, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		expect(broadcast).not.toHaveBeenCalled();
	});

	it("marks a price off the market tick as invalid without submitting", () => {
		const { price } = openEditor();
		act(() => {
			if (price) changeInput(price, "170.123456");
		});

		expect(price?.getAttribute("aria-invalid")).toBe("true");
		expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
			"Enter a valid price using the market's price precision.",
		);
		expect(document.body.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(true);
		expect(mocks.modifyOrders).not.toHaveBeenCalled();
	});

	function expectQuietBlockedEditor(input: HTMLInputElement | null) {
		expect(document.body.querySelector('[role="alert"]')).toBeNull();
		expect(document.body.querySelector("[aria-invalid]")).toBeNull();
		expect(input?.getAttribute("aria-describedby")).toBeNull();
		expect(input?.closest("label")?.className).not.toContain("border-market-close-danger");
		expect(document.body.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(true);
	}

	it("keeps an edited trigger price quiet while the mark price is not live, and confirms once it is", async () => {
		mocks.orders = [reduceOnlyStopOrder];
		const { trigger } = openEditor();
		act(() => {
			if (trigger) changeInput(trigger, "175");
		});

		expectQuietBlockedEditor(trigger);
		act(() => {
			if (trigger) pressKey(trigger, "Enter");
		});
		expect(mocks.modifyOrders).not.toHaveBeenCalled();

		mocks.markPriceLive = true;
		act(() => root.render(<ReviewedOrders />));
		expect(document.body.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(false);
		expect(document.body.querySelector('[role="alert"]')).toBeNull();
	});

	it("still marks a trigger price on the wrong side of a live mark", () => {
		mocks.markPriceLive = true;
		mocks.orders = [reduceOnlyStopOrder];
		const { trigger } = openEditor();
		act(() => {
			if (trigger) changeInput(trigger, "150");
		});

		expect(trigger?.getAttribute("aria-invalid")).toBe("true");
		expect(trigger?.closest("label")?.className).toContain("border-market-close-danger");
		expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
			"The trigger price is invalid for this order direction.",
		);
	});

	it("keeps an edited field quiet while the open-orders snapshot is stale", () => {
		const { size } = openEditor();
		act(() => {
			if (size) changeInput(size, "1.500");
		});
		expect(document.body.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(false);

		mocks.ordersStale = true;
		act(() => root.render(<ReviewedOrders />));

		expect(size?.value).toBe("1.500");
		expectQuietBlockedEditor(size);
		act(() => {
			if (size) pressKey(size, "Enter");
		});
		expect(mocks.modifyOrders).not.toHaveBeenCalled();

		mocks.ordersStale = false;
		act(() => root.render(<ReviewedOrders />));
		expect(document.body.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(false);
	});

	it.each([
		[
			"is loading",
			() => {
				mocks.marketsLoading = true;
			},
		],
		[
			"failed",
			() => {
				mocks.marketsError = new Error("markets request failed");
			},
		],
	])("keeps the editor quiet while the market catalog %s", (_state, breakCatalog) => {
		const { size } = openEditor();
		act(() => {
			if (size) changeInput(size, "1.500");
		});

		breakCatalog();
		act(() => root.render(<ReviewedOrders />));

		expect(size?.value).toBe("1.500");
		expect(document.body.textContent).not.toContain("Market metadata changed");
		expectQuietBlockedEditor(size);
		act(() => {
			if (size) pressKey(size, "Enter");
		});
		expect(mocks.modifyOrders).not.toHaveBeenCalled();
	});

	it.each([
		[
			"is loading",
			() => {
				mocks.marketsLoading = true;
			},
		],
		[
			"failed",
			() => {
				mocks.marketsError = new Error("markets request failed");
			},
		],
	])("keeps Modify Order named, disabled and silent while the market catalog %s", (_state, breakCatalog) => {
		breakCatalog();
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]')?.click());

		const modify = findButton("Modify Order", container);
		expect(modify?.disabled).toBe(true);
		expect(modify?.getAttribute("aria-disabled")).toBe("true");
		act(() => modify?.click());
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(document.body.textContent).not.toContain("Market metadata changed");
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
		expect(findButton("Cancel", container)?.disabled).toBe(false);

		mocks.marketsLoading = false;
		mocks.marketsError = null;
		act(() => root.render(<ReviewedOrders />));

		const ready = findButton("Modify Order", container);
		expect(ready?.disabled).toBe(false);
		act(() => ready?.click());
		expect(document.body.querySelector<HTMLInputElement>('input[aria-label="Size"]')?.value).toBe("2.000");
	});

	it("answers a Modify Order tap for a market a loaded catalog does not have", () => {
		mocks.assetId = undefined;
		act(() => root.render(<ReviewedOrders />));
		act(() =>
			container.querySelector<HTMLButtonElement>('button[aria-label="Expand xyz:ORCL order details"]')?.click(),
		);

		const modify = findButton("Modify Order", container);
		expect(modify?.disabled).toBe(false);
		act(() => modify?.click());

		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			"Market metadata changed. Refresh and try again.",
		);
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
	});

	it("still reports a market whose binding differs once the catalog is loaded", () => {
		const { size } = openEditor();
		act(() => {
			if (size) changeInput(size, "1.500");
		});

		mocks.assetId = 120_002;
		act(() => root.render(<ReviewedOrders />));

		expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
			"Market metadata changed. Refresh and try again.",
		);
		expect(document.body.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(true);
	});

	it("keeps the sentence of a confirmed modification the execution guard refused for a mark that stopped being live", async () => {
		mocks.markPriceLive = true;
		mocks.orders = [reduceOnlyStopOrder];
		mocks.modifyOrders.mockImplementation(async (params: unknown) => {
			mocks.markPriceLive = false;
			mocks.batchModifyGuard?.(params);
			return { response: { data: { statuses: [{ resting: { oid: 42 } }] } } };
		});
		const { trigger } = openEditor();
		await act(async () => {
			if (!trigger) return;
			changeInput(trigger, "175");
			pressKey(trigger, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		expect(getPendingTradingActionSnapshot().modifications).toEqual([]);
		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			"Mark price is unavailable. Wait for market data and try again.",
		);
	});

	it("closes with Escape without submitting", () => {
		const { size } = openEditor();
		act(() => {
			if (size) pressKey(size, "Escape");
		});
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
		expect(mocks.modifyOrders).not.toHaveBeenCalled();
	});

	it("does not claim success when shared reconciliation marks the writeback unconfirmed", async () => {
		const { size } = openEditor();
		await act(async () => {
			if (!size) return;
			changeInput(size, "1.500");
			pressKey(size, "Enter");
			await Promise.resolve();
		});
		const pendingModification = getPendingTradingActionSnapshot().modifications[0];
		await act(async () => {
			if (pendingModification) {
				getPendingTradingActionActions().markModificationUnconfirmed(pendingModification.id);
			}
			await Promise.resolve();
		});

		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
			"Refresh before retrying; cancellation remains available.",
		);
		expect(size?.disabled).toBe(true);
		expect(findButton("Cancel", container)?.disabled).toBe(false);
		expect(findButton("Modify Order", container)?.disabled).toBe(true);
		const close = document.body.querySelector<HTMLButtonElement>('button[aria-label="Close order modification"]');
		act(() => close?.click());
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
		expect(findButton("Cancel", container)?.disabled).toBe(false);
	});

	it("retranslates an existing reconciliation error when the locale changes", async () => {
		const { size } = openEditor();
		await act(async () => {
			if (!size) return;
			changeInput(size, "1.500");
			pressKey(size, "Enter");
			await Promise.resolve();
		});
		const pendingModification = getPendingTradingActionSnapshot().modifications[0];
		await act(async () => {
			if (pendingModification) {
				getPendingTradingActionActions().markModificationUnconfirmed(pendingModification.id);
			}
			await Promise.resolve();
		});

		const alert = document.body.querySelector('[role="alert"]');
		expect(alert?.textContent).toContain(MODIFICATION_UNCONFIRMED_MESSAGE);

		act(() => {
			i18n.loadAndActivate({ locale: "ar", messages: arabicMessages });
		});

		expect(alert?.textContent).toContain(MODIFICATION_UNCONFIRMED_MESSAGE_AR);
		expect(alert?.textContent).not.toContain(MODIFICATION_UNCONFIRMED_MESSAGE);
		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
	});

	it("releases a modification when a transport-shaped error happens before the SDK boundary", async () => {
		mocks.modifyOrders.mockImplementationOnce(async (params: unknown) => {
			mocks.batchModifyGuard?.(params);
			throw new HttpRequestError({ detail: "Legal status unavailable" });
		});
		const { size } = openEditor();

		await act(async () => {
			if (!size) return;
			changeInput(size, "1.500");
			pressKey(size, "Enter");
			await Promise.resolve();
		});

		expect(getPendingTradingActionSnapshot().modifications).toHaveLength(0);
		expect(mocks.toastWarning).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(queueItems.at(-1)).toMatchObject({ status: "failed" });
	});

	it("keeps an awaiting modification isolated to its original account", async () => {
		const { size } = openEditor();
		await act(async () => {
			if (!size) return;
			changeInput(size, "1.500");
			pressKey(size, "Enter");
			await Promise.resolve();
		});

		mocks.address = "0x2222222222222222222222222222222222222222";
		mocks.clientKey = "0x2222222222222222222222222222222222222222";
		mocks.orders = [triggerOrder];
		await act(async () => {
			root.render(<ReviewedOrders />);
			await Promise.resolve();
		});

		const sessionChanged = "The trading account or network changed. Reopen the editor and try again.";
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(mocks.toastInfo).not.toHaveBeenCalledWith("The modified order is no longer open.");
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(container.textContent).not.toContain(sessionChanged);
		expect(document.body.querySelector('input[aria-label="Size"]')).toBeNull();
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]')?.click());
		expect(findButton("Cancel", container)?.disabled).toBe(false);
		expect(getPendingTradingActionSnapshot().modifications).toEqual([
			expect.objectContaining({
				env: "Mainnet",
				owner: "0x1111111111111111111111111111111111111111",
				phase: "awaiting",
			}),
		]);
	});

	it("changes the trigger price of a reduce-only stop with the always-place flag", async () => {
		mocks.markPriceLive = true;
		mocks.orders = [reduceOnlyStopOrder];
		const { trigger } = openEditor();
		expect(trigger?.closest("label")?.textContent).not.toContain("USDC");
		await act(async () => {
			if (!trigger) return;
			changeInput(trigger, "175");
			pressKey(trigger, "Enter");
			await Promise.resolve();
		});

		expect(mocks.modifyOrders).toHaveBeenCalledOnce();
		const params = mocks.modifyOrders.mock.calls[0]?.[0] as {
			a?: boolean;
			modifies: { order: { r: boolean; t: unknown } }[];
		};
		expect(params.a).toBe(true);
		expect(params.modifies[0]?.order).toMatchObject({
			r: true,
			t: { trigger: { isMarket: true, triggerPx: "175", tpsl: "sl" } },
		});
		expect(getPendingTradingActionSnapshot().modifications[0]).toMatchObject({
			expectedTriggerPx: "175",
			expectedSize: null,
		});
	});

	it("explains unsupported modifications on touch without submitting an order", () => {
		mocks.orders = [unsafeTriggerOrder];
		act(() => root.render(<ReviewedOrders />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Expand ORCL order details"]')?.click());
		const modify = findButton("Modify Order", container);
		expect(modify?.disabled).toBe(false);
		expect(modify?.getAttribute("aria-disabled")).toBe("true");
		expect(modify?.title).toBe("This order type cannot be modified safely. Cancel and replace it instead.");
		act(() => modify?.click());
		expect(mocks.toastInfo).toHaveBeenCalledWith(
			"This order type cannot be modified safely. Cancel and replace it instead.",
		);
		expect(mocks.modifyOrders).not.toHaveBeenCalled();
	});
});
