/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	markPx: "100",
	twapTriggerPrice: "101",
	twapStopPrice: "",
	submitTwap: vi.fn(),
	submitOrder: vi.fn(),
	addOrder: vi.fn(() => "queue-1"),
	updateOrder: vi.fn(),
	resetFormIfCurrent: vi.fn(() => true),
	toastError: vi.fn(),
	exchangeSession: {
		id: Symbol("twap-trigger-commit-session"),
		env: "Mainnet" as const,
		clientKey: "0x1111111111111111111111111111111111111111",
		sessionMode: "wallet" as const,
		active: true,
	},
	actions: {
		markDraftEdited: vi.fn(),
		resetFormIfCurrent: vi.fn(() => true),
		setLimitPriceFromPrefill: vi.fn(),
		setLimitPriceFromUser: vi.fn(),
		setOrderType: vi.fn(),
		setReduceOnly: vi.fn(),
		setSide: vi.fn(),
		setSize: vi.fn(),
		setSizeSelection: vi.fn(),
		setSlPrice: vi.fn(),
		setTpPrice: vi.fn(),
		setTpSlEnabled: vi.fn(),
		setTriggerPrice: vi.fn(),
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

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick: () => void;
	}) => createElement("button", { type: "button", "data-testid": "confirm-twap-order", disabled, onClick }, children),
}));

vi.mock("@/components/trade/chart/token-selector", () => ({ TokenSelector: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-fields", () => ({ TradeFormFields: () => null }));
vi.mock("@/components/trade/tradebox/trade-header", () => ({ TradeHeader: () => null }));
vi.mock("@/components/trade/tradebox/order-summary", () => ({ OrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/scale-order-summary", () => ({ ScaleOrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/twap-order-summary", () => ({ TwapOrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-scale", () => ({ TradeFormScale: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-tif", () => ({ TradeFormTif: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-tp-sl", () => ({ TradeFormTpSl: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-twap", () => ({ TradeFormTwap: () => null }));
vi.mock("@/components/trade/tradebox/trade-option-checkboxes", () => ({
	TradeOptionCheckboxes: ({ children }: { children: ReactNode }) => children,
}));
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
vi.mock("@/stores/use-order-entry-store", () => ({
	getOrderEntryDraftResetToken: () => ({ marketIdentity: "Mainnet:BTC", draftRevision: 1 }),
	useLimitPrice: () => "",
	useOrderEntryActions: () => testState.actions,
	useOrderSide: () => "buy",
	useOrderSize: () => "1",
	useOrderSizeSource: () => null,
	useOrderType: () => "twap",
	useReduceOnly: () => false,
	useScaleEnd: () => "",
	useScaleLevels: () => null,
	useScaleSkew: () => "",
	useScaleStart: () => "",
	useSizeMode: () => "base",
	useSlPrice: () => "",
	useTif: () => "Gtc",
	useTpPrice: () => "",
	useTpSlEnabled: () => false,
	useTpSlReturnInvalid: () => false,
	useTriggerPrice: () => "",
	useTwapAdvancedEnabled: () => true,
	useTwapDurationDraft: () => null,
	useTwapMinutes: () => 30,
	useTwapRandomize: () => true,
	useTwapStopPrice: () => testState.twapStopPrice,
	useTwapTriggerPrice: () => testState.twapTriggerPrice,
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

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe.each(["desktop", "mobile"] as const)("TWAP trigger direction display-to-commit on %s", (surface) => {
	let container: HTMLDivElement;
	let root: Root;

	function renderSurface() {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					{surface === "desktop" ? <TradePanel /> : <MobileTradeView sizeMode="base" onSizeModeChange={() => {}} />}
				</I18nProvider>,
			);
		});
	}

	function getPrimarySubmitButton(): HTMLButtonElement {
		const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(node) => node.textContent === "Place Buy Order" || node.textContent === "Buy",
		);
		if (!button) throw new Error(`Expected primary submit button on ${surface}`);
		return button;
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		vi.stubGlobal("matchMedia", () => ({
			matches: surface === "mobile",
			addEventListener() {},
			removeEventListener() {},
		}));
		testState.markPx = "100";
		testState.twapTriggerPrice = "101";
		testState.twapStopPrice = "";
		testState.toastError.mockReset();
		testState.submitTwap.mockReset().mockResolvedValue({
			state: "confirmed",
			result: { status: "ok", response: { type: "twapOrder", data: { status: { running: { twapId: 1 } } } } },
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		renderSurface();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it("displays the trigger direction and fails closed with a notice if mark crosses trigger before confirm", async () => {
		await act(async () => {
			getPrimarySubmitButton().click();
		});

		const rows = document.querySelector('[data-testid="order-confirmation-rows"]');
		expect(rows?.textContent).toContain("Activates when mark ≥ $101.00");

		testState.markPx = "102";
		renderSurface();

		const confirm = document.querySelector<HTMLButtonElement>('[data-testid="confirm-twap-order"]');
		if (!confirm) throw new Error("Expected confirmation button");
		await act(async () => {
			confirm.click();
		});

		expect(testState.submitTwap).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledOnce();
		expect(testState.toastError.mock.calls[0]?.[0]).toContain("Order conditions changed");
	});

	it("submits with the displayed trigger direction when mark stays on the same side", async () => {
		await act(async () => {
			getPrimarySubmitButton().click();
		});

		expect(document.querySelector('[data-testid="order-confirmation-rows"]')?.textContent).toContain(
			"Activates when mark ≥ $101.00",
		);

		testState.markPx = "100.5";
		renderSurface();

		const confirm = document.querySelector<HTMLButtonElement>('[data-testid="confirm-twap-order"]');
		if (!confirm) throw new Error("Expected confirmation button");
		await act(async () => {
			confirm.click();
		});

		expect(testState.submitTwap).toHaveBeenCalledOnce();
		expect(testState.submitTwap.mock.calls[0]?.[0]).toMatchObject({
			details: { t: { p: "101", a: true }, s: null },
		});
		expect(testState.toastError).not.toHaveBeenCalled();
	});
});
