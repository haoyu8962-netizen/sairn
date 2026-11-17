// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import type { FrontendOpenOrdersResponse } from "@nktkas/hyperliquid";
import { act, type ComponentProps, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TradeSizeSlider } from "@/components/trade/components/trade-size-slider";
import type { TpSlPositionTarget } from "@/components/trade/positions/position-dialog-types";
import { PositionTpSlModal } from "@/components/trade/positions/position-tpsl-modal";
import type { Position } from "@/lib/hyperliquid";
import { createI18nRoot } from "./harness/react";
import {
	resetWalletSessionStage,
	setWalletSessionStage,
	type WalletSessionStage,
} from "./harness/wallet-session-stage";

const testState = vi.hoisted(() => ({
	isActivationLocked: undefined as (() => boolean) | undefined,
	connected: true,
	walletAddress: "0x1111111111111111111111111111111111111111",
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	markPx: "28595.5" as string | undefined,
	marketMarkPx: "28000" as string | undefined,
	markStatus: "active" as "idle" | "subscribing" | "active" | "error",
	markStale: false,
	markReceivedAt: Date.now(),
	openOrdersStatus: "active" as "idle" | "subscribing" | "active" | "error",
	openOrdersStale: false,
	hasOpenOrdersSnapshot: true,
	marketLoading: false,
	marketError: null as Error | null,
	marketAssetId: 120000,
	marketSzDecimals: 3,
	marketDex: "xyz",
	positionLoading: false,
	positionError: false,
	positionStale: false,
	position: {
		dex: "xyz",
		coin: "xyz:XYZ100",
		szi: "-0.301",
		entryPx: "28600.68",
		positionValue: "8608.80468",
		unrealizedPnl: "-1.11",
		returnOnEquity: "-0.004",
		liquidationPx: null,
		marginUsed: "430.44",
		maxLeverage: 20,
		leverage: { type: "cross", value: 20 },
		cumFunding: { allTime: "0", sinceChange: "0", sinceOpen: "0" },
	} as Position | null,
	orders: [] as FrontendOpenOrdersResponse,
	getPosition: vi.fn(),
	subscriptions: [] as Array<{ method: string; params: unknown }>,
	placeOrder: vi.fn(),
	cancelOrders: vi.fn(),
	frontendOpenOrders: vi.fn(),
	clearinghouseState: vi.fn(),
	trackedOrderOptions: [] as unknown[],
	isMobile: false,
	pendingMethods: new Set<string>(),
	executionGuards: {} as Record<string, ((params: unknown) => void) | undefined>,
	amountSliderProps: null as ComponentProps<typeof TradeSizeSlider> | null,
	infoCalls: [] as Array<{ method: string; params: unknown; options: unknown }>,
	maxMarketOrderNtlsQuery: {
		data: undefined as unknown,
		isSuccess: false,
		status: "pending" as "pending" | "error" | "success",
	},
	infoListeners: new Set<() => void>(),
	keepClosedDialogMounted: false,
}));

vi.mock("@/components/trade/components/trade-size-slider", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/components/trade/components/trade-size-slider")>();
	return {
		TradeSizeSlider: (props: ComponentProps<typeof TradeSizeSlider>) => {
			testState.amountSliderProps = props;
			return createElement(original.TradeSizeSlider, props);
		},
	};
});

vi.mock("@sairn/ui", () => ({
	AdaptiveModal: ({
		children,
		dismissible,
		onOpenChange,
		open,
		presentation,
		showHandle,
	}: {
		children: ReactNode;
		dismissible: boolean;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		presentation: string;
		showHandle: boolean;
	}) =>
		open || testState.keepClosedDialogMounted
			? createElement(
					"section",
					{
						"data-testid": "position-risk-dialog",
						"data-open": String(open),
						"data-presentation": presentation,
						"data-dismissible": String(dismissible),
						"data-show-handle": String(showHandle),
					},
					createElement("button", {
						"aria-label": "Request adaptive dismiss",
						type: "button",
						onClick: () => onOpenChange(false),
					}),
					children,
				)
			: null,
	Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
	Checkbox: ({
		checked,
		disabled,
		label,
		onCheckedChange,
	}: {
		checked: boolean;
		disabled?: boolean;
		label: string;
		onCheckedChange: (checked: boolean) => void;
	}) =>
		createElement(
			"label",
			null,
			createElement("input", {
				"aria-label": label,
				checked,
				disabled,
				onChange: (event: { currentTarget: { checked: boolean } }) => onCheckedChange(event.currentTarget.checked),
				type: "checkbox",
			}),
			label,
		),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

vi.mock("@privy-io/react-auth", async () => (await import("./harness/wallet-session-stage")).privyMock);
vi.mock("wagmi", async () => (await import("./harness/wallet-session-stage")).wagmiMock);
vi.mock("@privy-io/wagmi", async () => (await import("./harness/wallet-session-stage")).privyWagmiMock);

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/hooks/trade/use-tracked-order", () => ({
	useTrackedOrder: (options?: { executionGuard?: (params: unknown) => void }) => {
		testState.executionGuards.order = options?.executionGuard;
		return {
			error: null,
			isPending: testState.pendingMethods.has("order"),
			submitOrder: async (params: unknown, submitOptions: unknown) => {
				options?.executionGuard?.(params);
				testState.trackedOrderOptions.push(submitOptions);
				return { state: "confirmed" as const, result: await testState.placeOrder(params) };
			},
		};
	},
}));

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => createElement("span", null, coin),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		containerClassName: _containerClassName,
		isActivationLocked,
		...props
	}: {
		children: ReactNode;
		containerClassName?: string;
		isActivationLocked?: () => boolean;
		[key: string]: unknown;
	}) => {
		testState.isActivationLocked = isActivationLocked;
		return createElement("button", { ...props, type: "button" }, children);
	},
}));

vi.mock("@/components/trade/tradebox/tp-sl-section", () => ({
	TpSlSection: ({
		leverage,
		linkedReturnInputs,
		disabled,
		onSlPriceChange,
		onTpPriceChange,
		preserveFinancialPrecision,
		referencePrice,
		size,
		slPrice,
		slError,
		tpPrice,
		tpError,
	}: {
		disabled?: boolean;
		leverage?: number;
		linkedReturnInputs?: {
			unitLabel: string;
			onUnitToggle: () => void;
			tp: { ariaLabel: string; value: string; onBlur?: () => void; onChange: (value: string) => void };
			sl: { ariaLabel: string; value: string; onBlur?: () => void; onChange: (value: string) => void };
		};
		onSlPriceChange: (value: string) => void;
		onTpPriceChange: (value: string) => void;
		preserveFinancialPrecision?: boolean;
		referencePrice: string | number;
		size: string | number;
		slPrice: string;
		slError?: string | null;
		tpPrice: string;
		tpError?: string | null;
	}) =>
		createElement(
			"div",
			null,
			createElement("input", {
				"aria-label": "Take Profit",
				disabled,
				onChange: (event: { currentTarget: { value: string } }) => onTpPriceChange(event.currentTarget.value),
				value: tpPrice,
			}),
			createElement("input", {
				"aria-label": "Stop Loss",
				disabled,
				onChange: (event: { currentTarget: { value: string } }) => onSlPriceChange(event.currentTarget.value),
				value: slPrice,
			}),
			createElement("span", { "data-testid": "leverage" }, String(leverage)),
			createElement("span", { "data-testid": "reference-price" }, String(referencePrice)),
			createElement("span", { "data-testid": "position-size" }, String(size)),
			createElement("span", { "data-testid": "precision-mode" }, String(preserveFinancialPrecision)),
			tpError ? createElement("span", { "data-testid": "tp-error" }, tpError) : null,
			slError ? createElement("span", { "data-testid": "sl-error" }, slError) : null,
			linkedReturnInputs
				? createElement(
						"div",
						null,
						createElement("input", {
							"aria-label": linkedReturnInputs.tp.ariaLabel,
							disabled,
							onBlur: linkedReturnInputs.tp.onBlur,
							onChange: (event: { currentTarget: { value: string } }) =>
								linkedReturnInputs.tp.onChange(event.currentTarget.value),
							value: linkedReturnInputs.tp.value,
						}),
						createElement("input", {
							"aria-label": linkedReturnInputs.sl.ariaLabel,
							disabled,
							onBlur: linkedReturnInputs.sl.onBlur,
							onChange: (event: { currentTarget: { value: string } }) =>
								linkedReturnInputs.sl.onChange(event.currentTarget.value),
							value: linkedReturnInputs.sl.value,
						}),
						createElement(
							"button",
							{ disabled, onClick: linkedReturnInputs.onUnitToggle, type: "button" },
							linkedReturnInputs.unitLabel,
						),
					)
				: null,
		),
}));

vi.mock("@/lib/hyperliquid", async () => {
	const { useSyncExternalStore } = await import("react");
	const { hyperliquidSessionMock, useHyperliquidSession } = await import("./harness/wallet-session-stage");
	const idleInfoQuery = { data: undefined, isSuccess: false, status: "pending" as const };
	function subscribeToInfo(listener: () => void) {
		testState.infoListeners.add(listener);
		return () => {
			testState.infoListeners.delete(listener);
		};
	}
	return {
		...hyperliquidSessionMock,
		useInfo: (method: string, params: unknown, options: unknown) => {
			testState.infoCalls.push({ method, params, options });
			return useSyncExternalStore(subscribeToInfo, () =>
				method === "maxMarketOrderNtls" ? testState.maxMarketOrderNtlsQuery : idleInfoQuery,
			);
		},
		useExchange: (method: string, options?: { executionGuard?: (params: unknown) => void }) => {
			testState.executionGuards[method] = options?.executionGuard;
			const mutation = method === "order" ? testState.placeOrder : testState.cancelOrders;
			return {
				error: null,
				isPending: testState.pendingMethods.has(method),
				mutateAsync: async (params: unknown) => {
					options?.executionGuard?.(params);
					return mutation(params);
				},
				reset: vi.fn(),
			};
		},
		useHyperliquid: () => ({
			...useHyperliquidSession(),
			info: {
				frontendOpenOrders: testState.frontendOpenOrders,
				clearinghouseState: testState.clearinghouseState,
			},
		}),
		useMarketsInfo: () => ({
			getMarketInfo: () => (testState.marketMarkPx ? { markPx: testState.marketMarkPx } : undefined),
		}),
		useMarkets: () => ({
			error: testState.marketError,
			isLoading: testState.marketLoading,
			getMarket: () => ({
				kind: "builderPerp",
				assetId: testState.marketAssetId,
				szDecimals: testState.marketSzDecimals,
				dex: testState.marketDex,
				quoteToken: { name: "USDC" },
			}),
		}),
		useSubscription: (method: string, params: unknown) => {
			const owned = useHyperliquidSession().clientKey !== "disconnected";
			testState.subscriptions.push({ method, params });
			if (method === "activeAssetCtx") {
				return {
					data: testState.markPx ? { coin: positionRef.coin, ctx: { markPx: testState.markPx } } : undefined,
					status: testState.markStatus,
					isStale: testState.markStale,
					lastMessageAt: testState.markReceivedAt,
				};
			}
			if (method === "openOrders") {
				return {
					data: owned && testState.hasOpenOrdersSnapshot ? { orders: testState.orders } : undefined,
					status: owned ? testState.openOrdersStatus : "idle",
					isStale: owned && testState.openOrdersStale,
				};
			}
			return { data: undefined, status: "idle" };
		},
		useUserPositions: () => {
			const owned = useHyperliquidSession().clientKey !== "disconnected";
			return {
				getPosition: () => (owned && !testState.positionLoading ? testState.position : null),
				hasError: false,
				isLoading: owned && testState.positionLoading,
				isStale: false,
			};
		},
	};
});

const positionRef: TpSlPositionTarget = {
	owner: "0x1111111111111111111111111111111111111111",
	env: "Mainnet",
	coin: "xyz:XYZ100",
	dex: "xyz",
	assetId: 120000,
	isLong: false,
	szDecimals: 3,
	marginMode: "cross",
};

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

function getInput(container: HTMLElement, label: string): HTMLInputElement {
	const input = container.querySelector(`input[aria-label="${label}"]`);
	if (!(input instanceof HTMLInputElement)) throw new Error(`${label} input not found`);
	return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
	const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (!valueSetter) throw new Error("Native input value setter not found");
	valueSetter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

const livePosition = testState.position;

describe("PositionTpSlModal while the wallet session resolves", () => {
	const CONNECT = "Connect wallet to view positions";
	const CHANGED = "Trading data changed while this dialog was open. Close and reopen it before submitting.";
	let container: HTMLDivElement;
	let root: Root;

	function show(stage: WalletSessionStage) {
		act(() => setWalletSessionStage(stage));
	}

	function rerender() {
		act(() => {
			root.render(
				createElement(PositionTpSlModal, {
					session: { sessionId: "tpsl-1", position: positionRef },
					onSessionEnd: vi.fn(),
				}),
			);
		});
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		window.localStorage.clear();
		window.sessionStorage.clear();
		resetWalletSessionStage("connected");
		testState.position = livePosition;
		testState.positionLoading = false;
		testState.hasOpenOrdersSnapshot = true;
		testState.openOrdersStatus = "active";
		testState.markReceivedAt = Date.now();
		testState.maxMarketOrderNtlsQuery = { data: undefined, isSuccess: false, status: "pending" };
		testState.placeOrder.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		rerender();
		act(() => setInputValue(getInput(container, "Take Profit"), "27000"));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("is ready to confirm for the exact owner", () => {
		expect(getInput(container, "Take Profit").value).toBe("27000");
		expect(getButton(container, "Confirm").disabled).toBe(false);
	});

	it.each(["reconnecting", "directory-initialising", "activating"] as const)(
		"keeps the form and its draft, disabled, while the session is %s",
		(stage) => {
			show(stage);

			expect(container.textContent).not.toContain(CONNECT);
			expect(container.textContent).not.toContain(CHANGED);
			expect(getInput(container, "Take Profit").value).toBe("27000");
			expect(getButton(container, "Confirm").disabled).toBe(true);
			act(() => getButton(container, "Confirm").click());
			expect(testState.placeOrder).not.toHaveBeenCalled();
		},
	);

	it("keeps the draft while the account data reloads after the reconnect, then enables Confirm again", () => {
		show("reconnecting");
		testState.positionLoading = true;
		testState.hasOpenOrdersSnapshot = false;
		testState.openOrdersStatus = "subscribing";
		show("connected");

		expect(getInput(container, "Take Profit").value).toBe("27000");
		expect(getButton(container, "Confirm").disabled).toBe(true);

		testState.positionLoading = false;
		testState.hasOpenOrdersSnapshot = true;
		testState.openOrdersStatus = "active";
		rerender();

		expect(getInput(container, "Take Profit").value).toBe("27000");
		expect(getButton(container, "Confirm").disabled).toBe(false);
	});

	it("asks to reopen when the position changed while the session resolved", () => {
		show("reconnecting");
		testState.position = { ...livePosition, szi: "-0.2", positionValue: "5720.136" } as Position;
		show("connected");

		expect(container.textContent).toContain(CHANGED);
		expect(getInput(container, "Take Profit").value).toBe("27000");
		expect(getButton(container, "Confirm").disabled).toBe(true);
		act(() => getButton(container, "Confirm").click());
		expect(testState.placeOrder).not.toHaveBeenCalled();
	});

	it("stops holding the form once the session has been resolving for the maximum time", () => {
		vi.useFakeTimers();
		try {
			show("reconnecting");
			expect(getInput(container, "Take Profit").value).toBe("27000");

			act(() => vi.advanceTimersByTime(10_000));
			expect(container.textContent).toContain(CONNECT);
			expect(container.querySelector('input[aria-label="Take Profit"]')).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("reports a position that is gone once the account data is back", () => {
		show("reconnecting");
		testState.position = null;
		show("connected");

		expect(container.textContent).toContain("No active positions.");
		expect(container.querySelector('input[aria-label="Take Profit"]')).toBeNull();
	});

	it.each(["signed-out", "wallet-missing", "connected-other-account"] as const)(
		"asks to connect once the session is %s",
		(stage) => {
			show(stage);

			expect(container.textContent).toContain(CONNECT);
			expect(container.querySelector('input[aria-label="Take Profit"]')).toBeNull();
		},
	);

	it.each(["connected-other-owner", "agent-only"] as const)("reports the change once the session is %s", (stage) => {
		show(stage);

		expect(container.textContent).toContain(CHANGED);
		expect(container.querySelector('input[aria-label="Take Profit"]')).toBeNull();
	});

	it("reports the change after a reconnect that ends on another owner", () => {
		show("reconnecting");
		show("connected-other-owner");

		expect(container.textContent).toContain(CHANGED);
		expect(container.querySelector('input[aria-label="Take Profit"]')).toBeNull();
	});

	it("shows a busy body, not a connect prompt, when it opens before the session resolved", () => {
		act(() => root.unmount());
		resetWalletSessionStage("reconnecting");
		root = createI18nRoot(container);
		rerender();

		expect(container.textContent).not.toContain(CONNECT);
		expect(container.querySelector('input[aria-label="Take Profit"]')).toBeNull();
		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
	});
});
