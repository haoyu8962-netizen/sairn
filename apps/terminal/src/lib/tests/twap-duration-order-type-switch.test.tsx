/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	markPx: "100",
	submitTwap: vi.fn(),
	submitOrder: vi.fn(),
	addOrder: vi.fn(() => "queue-1"),
	updateOrder: vi.fn(),
	toastError: vi.fn(),
	exchangeSession: {
		id: Symbol("twap-duration-switch-session"),
		env: "Mainnet" as const,
		clientKey: "0x1111111111111111111111111111111111111111",
		sessionMode: "wallet" as const,
		active: true,
	},
}));

vi.mock("sonner", () => ({
	toast: { error: testState.toastError },
}));

vi.mock("@sairn/ui", async (importOriginal) => ({
	...(await importOriginal<typeof import("@sairn/ui")>()),
	Button: ({
		children,
		iconLeft: _iconLeft,
		intent: _intent,
		size: _size,
		variant: _variant,
		...props
	}: Record<string, unknown>) => createElement("button", { type: "button", ...props }, children as ReactNode),
	Tooltip: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@sairn/hl-react", async (importOriginal) => ({
	...(await importOriginal<typeof import("@sairn/hl-react")>()),
	useConnectionWalletClient: () => ({ data: { account: { address: testState.exchangeSession.clientKey } } }),
}));

vi.mock("@/components/trade/chart/token-selector", () => ({ TokenSelector: () => null }));
vi.mock("@/components/trade/tradebox/order-summary", () => ({ OrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/scale-order-summary", () => ({ ScaleOrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/twap-order-summary", () => ({ TwapOrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/lazy-trade-settings-modals", () => ({
	AccountModeModal: () => null,
	LeverageModal: () => null,
	MarginModeModal: () => null,
	MaxSlippageModal: () => null,
	warmTradeSettingsModals: vi.fn(),
}));
vi.mock("@/components/trade/mobile/mobile-bottom-nav", () => ({ MobileBottomNavSpacer: () => null }));
vi.mock("@/components/ui/lazy-dialog-host", () => ({ LazyDialogHost: () => null }));

vi.mock("@/hooks/trade/use-account-abstraction-control", () => ({
	useAccountAbstractionControl: () => ({
		accountAbstraction: "disabled",
		canSet: false,
		isLoading: false,
		isUpdating: false,
		portfolioMarginActivationEnabled: false,
		setAccountAbstraction: vi.fn(async () => false),
	}),
}));
vi.mock("@/hooks/trade/use-builder-fee-config", () => ({ useBuilderFeeTenthsBps: () => 0 }));
vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({ available: true, unavailableReason: null }),
}));
vi.mock("@/hooks/trade/use-fee-rates", () => ({
	useMarketFeeRates: () => ({ makerRate: 0.0001, takerRate: 0.0002 }),
}));
vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));
vi.mock("@/hooks/trade/use-market-slippage-estimate", () => ({ useMarketSlippageEstimate: () => null }));
vi.mock("@/hooks/trade/use-tracked-order", () => ({
	useTrackedOrder: () => ({ submitOrder: testState.submitOrder, isPending: false }),
}));
vi.mock("@/hooks/trade/use-tracked-twap-order", () => ({
	useTrackedTwapOrder: () => ({ submitTwap: testState.submitTwap, isPending: false }),
}));
vi.mock("@/hooks/trade/use-order-entry-data", () => ({
	useOrderEntryData: () => ({
		accountAbstraction: "disabled",
		allowsIsolatedMarginRemoval: false,
		applyMarginAndLeverage: vi.fn(),
		applySizePercent: vi.fn(),
		availabilityMaxAgeMs: 20_000,
		availabilityReceivedAt: Date.now(),
		availabilityStatus: "success",
		availableBalance: 1000,
		availableBalanceToken: "USDC",
		baseToken: "BTC",
		beginSizePercentGesture: vi.fn(),
		capabilities: { allowsCrossMargin: true, hasReduceOnly: true, hasTpSl: true, isLeveraged: true },
		committedLeverage: null,
		conversionPrice: Number(testState.markPx),
		currentLeverage: 10,
		displayAvailableBalance: 1000,
		displayAvailableBalanceToken: "USDC",
		endSizePercentGesture: vi.fn(),
		executionAvailability: { kind: "perp", maxBaseBySide: { buy: "10", sell: "10" } },
		hasAvailabilityError: false,
		hasPosition: false,
		isAvailabilityBlocked: false,
		isAvailabilityLoading: false,
		isAvailabilityStale: false,
		isAwaitingFirstDeposit: false,
		isBalanceAvailabilityBlocked: false,
		isLeverageUpdating: false,
		isOpenInterestCapped: false,
		isSpotMarket: false,
		isSwitchingMode: false,
		leverage: 10,
		leverageInteractionIdentity: "Mainnet:BTC",
		marginMode: "cross",
		maxLeverage: 50,
		maxSize: 10,
		orderValue: 100,
		pendingLeverage: null,
		positionStateReady: true,
		quoteToken: "USDC",
		requiresAvailableBalance: true,
		resetPendingLeverage: vi.fn(),
		setPendingLeverage: vi.fn(),
		sideLabels: { buy: "Buy", sell: "Sell", buyAria: "Buy", sellAria: "Sell" },
		sizeForOrder: "1",
		sizeModeLabel: "BTC",
		sizeValue: 1,
		spotBalance: { baseAvailable: 10, quoteAvailable: 1000 },
		spotBuyQuoteCost: 100,
		szDecimals: 2,
		toggleSizeDenomination: vi.fn(),
	}),
}));
vi.mock("@/hooks/trade/use-prospective-cross-margin-account", () => ({
	useProspectiveCrossMarginAccount: () => ({ account: null, existingPosition: null }),
}));
vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ actionsBlocked: false, isError: false, isResolved: true, tradeRestricted: false }),
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: testState.exchangeSession.clientKey,
		isConnected: true,
		hasWalletAccess: true,
		isResolving: false,
		sessionMode: "wallet",
	}),
}));
vi.mock("@/lib/hyperliquid", () => ({
	getMarketCapabilities: () => ({ allowsCrossMargin: true, hasReduceOnly: true, hasTpSl: true, isLeveraged: true }),
	useHyperliquid: () => ({ ...testState.exchangeSession, exchangeSession: testState.exchangeSession }),
	useMarketsInfo: () => ({ spotMarkets: [], isLoading: false, error: null }),
	useSelectedMarketInfo: () => ({
		data: {
			assetId: 0,
			kind: "perp",
			marginMetadataReady: true,
			markPriceReceivedAt: Date.now(),
			markPriceStatus: "success",
			markPx: testState.markPx,
			midPriceReceivedAt: Date.now(),
			midPx: testState.markPx,
			name: "BTC",
			pairName: "BTC-USDC",
			prevDayPx: testState.markPx,
			szDecimals: 2,
		},
	}),
	useTradingAuthorization: () => ({ authorize: vi.fn(), status: "idle" }),
	useTradingStatus: () => ({
		isBuilderFeeLoading: false,
		isReady: true,
		isSignerLoading: false,
		isSignerReady: true,
		signerMode: "owner",
	}),
	useUserPositions: () => ({
		getPosition: () => null,
		hasError: false,
		isLoading: false,
		isStale: false,
		receivedAt: Date.now(),
	}),
}));
vi.mock("@/lib/lazy", () => ({
	createLazyComponent: () => () => null,
	createRetryableLazyComponent: () => () => null,
	preloadLazyComponents: () => Promise.resolve(),
}));
vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
	useEstablishConnectionModalActions: () => ({ open: vi.fn() }),
	useSettingsDialogActions: () => ({ open: vi.fn() }),
	useSwapModalActions: () => ({ open: vi.fn() }),
}));
vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	getSkipOrderConfirmation: () => false,
	useGlobalSettingsActions: () => ({ setSkipOrderConfirmation: vi.fn() }),
	useMarketOrderSlippageBps: () => 50,
	useMarketOrderSlippagePercent: () => 0.5,
}));
vi.mock("@/stores/use-order-queue-store", () => ({
	useOrderQueueActions: () => ({ addOrder: testState.addOrder, updateOrder: testState.updateOrder }),
}));
vi.mock("@/stores/use-orderbook-actions-store", () => ({
	getOrderbookActionsStore: () => ({
		actions: { clearSelectedPrice: vi.fn(), clearSizeModeRequest: vi.fn(), takeSizeModeRequest: () => true },
	}),
	getSelectedPriceForMarket: () => null,
	useSelectedPrice: () => null,
	useSizeModeRequest: () => null,
}));

import { MobileTradeView } from "@/components/trade/mobile/mobile-trade-view";
import { TradePanel } from "@/components/trade/tradebox/trade-panel";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe.each(["desktop", "mobile"] as const)("TWAP duration draft and error lifecycle on %s", (surface) => {
	let container: HTMLDivElement;
	let root: Root;
	let actions: ReturnType<typeof useOrderEntryActions>;

	function Harness({ currentSurface = surface }: { currentSurface?: "desktop" | "mobile" }) {
		actions = useOrderEntryActions();
		return (
			<I18nProvider i18n={i18n}>
				{currentSurface === "desktop" ? (
					<TradePanel />
				) : (
					<MobileTradeView sizeMode="base" onSizeModeChange={() => {}} />
				)}
			</I18nProvider>
		);
	}

	function getInput(ariaLabel: string): HTMLInputElement {
		const input = container.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
		if (!input) throw new Error(`Expected input ${ariaLabel} on ${surface}`);
		return input;
	}

	function getPrimarySubmitButton(): HTMLButtonElement {
		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
			(node) =>
				(node.textContent === "Place Buy Order" || node.textContent === "Buy") &&
				node.getAttribute("role") !== "tab" &&
				!node.hasAttribute("aria-pressed"),
		);
		const button = buttons.at(-1);
		if (!button) throw new Error(`Expected primary submit button on ${surface}`);
		return button;
	}

	function switchToLimit() {
		const limitButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(node) => node.textContent?.trim() === "Limit",
		);
		if (limitButton) {
			limitButton.click();
			return;
		}
		actions.setOrderType("limit");
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		vi.stubGlobal("matchMedia", () => ({
			matches: surface === "mobile",
			addEventListener() {},
			removeEventListener() {},
		}));
		testState.markPx = "100";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<Harness />));
		act(() => {
			actions.resetFormForMarket("Mainnet:BTC");
			actions.resetForm();
			actions.setSide("buy");
			actions.setOrderType("twap");
			actions.setSize("1");
		});
	});

	afterEach(() => {
		act(() => actions.resetForm());
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it("preserves out-of-range minutes draft and inline error across Limit and back to TWAP", () => {
		act(() => changeInput(getInput("Minute(s)"), "60"));
		expect(getInput("Minute(s)").value).toBe("60");
		expect(getInput("Minute(s)").getAttribute("aria-invalid")).toBe("true");
		expect(container.textContent).toContain("Minutes must be 0-59");
		expect(container.textContent).not.toContain("TWAP minutes must be 5-10080");
		expect(getPrimarySubmitButton().disabled).toBe(true);

		act(() => switchToLimit());
		expect(container.querySelector('input[aria-label="Minute(s)"]')).toBeNull();
		expect(container.textContent).not.toContain("Minutes must be 0-59");

		act(() => actions.setOrderType("twap"));

		const minutesAfterReturn = getInput("Minute(s)");
		expect(minutesAfterReturn.value).toBe("60");
		expect(minutesAfterReturn.getAttribute("aria-invalid")).toBe("true");
		expect(container.textContent).toContain("Minutes must be 0-59");
		expect(container.textContent).not.toContain("TWAP minutes must be 5-10080");
		expect(getPrimarySubmitButton().disabled).toBe(true);

		act(() => changeInput(minutesAfterReturn, "4"));
		expect(container.textContent).not.toContain("Minutes must be 0-59");
		expect(container.textContent).toContain("TWAP minutes must be 5-10080");
		expect(getPrimarySubmitButton().disabled).toBe(true);

		act(() => switchToLimit());
		act(() => actions.setOrderType("twap"));
		expect(getInput("Minute(s)").value).toBe("4");
		expect(container.textContent).toContain("TWAP minutes must be 5-10080");
		expect(getPrimarySubmitButton().disabled).toBe(true);
	});

	it("preserves out-of-range hours draft and inline error across order-type switches", () => {
		act(() => changeInput(getInput("Hour(s)"), "169"));
		expect(getInput("Hour(s)").value).toBe("169");
		expect(getInput("Hour(s)").getAttribute("aria-invalid")).toBe("true");
		expect(container.textContent).toContain("Hours must be 0-168");
		expect(getPrimarySubmitButton().disabled).toBe(true);

		act(() => switchToLimit());
		act(() => actions.setOrderType("twap"));

		const hoursAfterReturn = getInput("Hour(s)");
		expect(hoursAfterReturn.value).toBe("169");
		expect(hoursAfterReturn.getAttribute("aria-invalid")).toBe("true");
		expect(container.textContent).toContain("Hours must be 0-168");
		expect(getPrimarySubmitButton().disabled).toBe(true);
	});

	it("restores the footer range error when an external zero-minute update replaces an invalid draft", () => {
		act(() => changeInput(getInput("Minute(s)"), "60"));
		expect(container.textContent).toContain("Minutes must be 0-59");
		expect(container.textContent).not.toContain("TWAP minutes must be 5-10080");

		act(() => actions.setTwapMinutes(0));

		expect(getInput("Hour(s)").value).toBe("0");
		expect(getInput("Minute(s)").value).toBe("0");
		expect(container.textContent).not.toContain("Minutes must be 0-59");
		expect(container.textContent).toContain("TWAP minutes must be 5-10080");
		expect(getPrimarySubmitButton().disabled).toBe(true);
	});

	it("preserves the invalid duration draft and error across a desktop-to-mobile surface switch", () => {
		if (surface !== "desktop") return;
		act(() => changeInput(getInput("Minute(s)"), "60"));
		expect(container.textContent).toContain("Minutes must be 0-59");

		act(() => root.render(<Harness currentSurface="mobile" />));

		const mobileMinutes = getInput("Minute(s)");
		expect(mobileMinutes.value).toBe("60");
		expect(mobileMinutes.getAttribute("aria-invalid")).toBe("true");
		expect(container.textContent).toContain("Minutes must be 0-59");
		expect(container.textContent).not.toContain("TWAP minutes must be 5-10080");
		expect(getPrimarySubmitButton().disabled).toBe(true);
	});
});
