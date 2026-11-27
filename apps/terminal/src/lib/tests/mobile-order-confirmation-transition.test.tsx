/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderConfirmationDraft } from "@/domain/trade/order-confirmation";

const testState = vi.hoisted(() => ({
	modalRenders: [] as Array<{
		open: boolean;
		draft: OrderConfirmationDraft;
		onOpenChange: (open: boolean) => void;
		onConfirm: () => void;
	}>,
	submitOrder: vi.fn(async () => {}),
	actions: {
		markDraftEdited: vi.fn(),
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
	useConnectionWalletClient: () => ({ data: { account: { address: "0xabc" } } }),
}));

vi.mock("@/components/trade/chart/token-selector", () => ({ TokenSelector: () => null }));
vi.mock("@/components/trade/tradebox/margin-mode-modal", () => ({ MarginModeModal: () => null }));
vi.mock("@/components/trade/tradebox/order-confirmation-modal", () => ({
	OrderConfirmationModal: (props: {
		open: boolean;
		draft: OrderConfirmationDraft;
		onOpenChange: (open: boolean) => void;
		onConfirm: () => void;
	}) => {
		testState.modalRenders.push({
			open: props.open,
			draft: props.draft,
			onOpenChange: props.onOpenChange,
			onConfirm: props.onConfirm,
		});
		return createElement("div", {
			"data-testid": "mobile-order-confirmation-modal",
			"data-open": String(props.open),
		});
	},
}));
vi.mock("@/components/trade/tradebox/trade-form-scale", () => ({ TradeFormScale: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-tif", () => ({ TradeFormTif: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-tp-sl", () => ({ TradeFormTpSl: () => null }));
vi.mock("@/components/trade/tradebox/trade-form-twap", () => ({ TradeFormTwap: () => null }));
vi.mock("@/components/trade/tradebox/trade-header", () => ({ TradeHeader: () => null }));
vi.mock("@/components/trade/tradebox/trade-option-checkboxes", () => ({
	TradeOptionCheckboxes: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/trade/mobile/mobile-bottom-nav", () => ({ MobileBottomNavSpacer: () => null }));

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
vi.mock("@/hooks/trade/use-order-entry-data", () => ({
	useOrderEntryData: () => ({
		accountAbstraction: "disabled",
		allowsIsolatedMarginRemoval: false,
		applyMarginAndLeverage: vi.fn(),
		applySizePercent: vi.fn(),
		availabilityMaxAgeMs: 10_000,
		availabilityReceivedAt: Date.now(),
		availabilityStatus: "success",
		availableBalance: 1000,
		availableBalanceToken: "USDC",
		baseToken: "BTC",
		beginSizePercentGesture: vi.fn(),
		capabilities: { allowsCrossMargin: true, hasReduceOnly: false, hasTpSl: false, isLeveraged: true },
		committedLeverage: null,
		conversionPrice: 100,
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
		sideLabels: { buy: "Buy / Long", sell: "Sell / Short" },
		sizeForOrder: "1",
		sizeValue: 1,
		spotBalance: { baseAvailable: 10, quoteAvailable: 1000 },
		spotBuyQuoteCost: 100,
		szDecimals: 3,
		toggleSizeDenomination: vi.fn(),
	}),
}));
vi.mock("@/hooks/trade/use-order-submit", () => ({
	useOrderSubmit: () => ({
		captureDraftResetToken: () => ({
			orderEntry: { marketIdentity: "Mainnet:BTC", draftRevision: 0 },
			exchangeSession: {
				id: Symbol("mobile-transition-session"),
				env: "Mainnet",
				clientKey: "0xabc",
				sessionMode: "wallet",
				active: true,
			},
		}),
		isDraftResetTokenCurrent: () => true,
		handleSubmit: testState.submitOrder,
		isSubmitting: false,
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
		address: "0xabc",
		isConnected: true,
		hasWalletAccess: true,
		isResolving: false,
		sessionMode: "wallet",
	}),
}));
vi.mock("@/lib/hyperliquid", () => ({
	getMarketCapabilities: () => ({ allowsCrossMargin: true, hasReduceOnly: false, hasTpSl: false, isLeveraged: true }),
	useTradingStatus: () => ({
		isSignerLoading: false,
		isSignerReady: true,
		isBuilderFeeLoading: false,
		isReady: true,
		signerMode: "owner",
	}),
	useSelectedMarketInfo: () => ({
		data: {
			assetId: 0,
			kind: "perp",
			marginMetadataReady: true,
			markPriceReceivedAt: Date.now(),
			markPriceStatus: "success",
			markPx: "100",
			midPriceReceivedAt: Date.now(),
			midPx: "100",
			name: "BTC",
			pairName: "BTC/USDC",
			prevDayPx: "100",
			szDecimals: 3,
		},
	}),
	useTradingAuthorization: () => ({ authorize: vi.fn(), status: "idle" }),
	useUserPositions: () => ({ getPosition: () => null, hasError: false, isLoading: false, isStale: false }),
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
}));
vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	getSkipOrderConfirmation: () => false,
	useGlobalSettingsActions: () => ({ setSkipOrderConfirmation: vi.fn() }),
	useMarketOrderSlippageBps: () => 50,
	useMarketOrderSlippagePercent: () => 0.5,
}));
vi.mock("@/stores/use-order-entry-store", () => ({
	useLimitPrice: () => "",
	useOrderEntryActions: () => testState.actions,
	useOrderSide: () => "buy",
	useOrderSize: () => "1",
	useOrderSizeSource: () => null,
	useOrderType: () => "market",
	useReduceOnly: () => false,
	useScaleEnd: () => "",
	useScaleLevels: () => null,
	useScaleSkew: () => "",
	useScaleStart: () => "",
	useSlPrice: () => "",
	useTif: () => "Gtc",
	useTpPrice: () => "",
	useTpSlEnabled: () => false,
	useTpSlReturnInvalid: () => false,
	useTriggerPrice: () => "",
	useTwapAdvancedEnabled: () => false,
	useTwapDurationDraft: () => null,
	useTwapMinutes: () => 30,
	useTwapRandomize: () => false,
	useTwapStopPrice: () => "",
	useTwapTriggerPrice: () => "",
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

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileTradeView order confirmation exit transition", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.modalRenders = [];
		testState.submitOrder.mockClear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileTradeView sizeMode="base" onSizeModeChange={() => {}} />
				</I18nProvider>,
			);
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	function getSubmitButton(): HTMLButtonElement {
		const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(node) => node.textContent === "Buy / Long",
		);
		if (!button) throw new Error("Expected mobile submit button");
		return button;
	}

	it("keeps OrderConfirmationModal mounted with open=false during the 250ms exit after cancel", async () => {
		await act(async () => {
			getSubmitButton().click();
		});
		const modal = container.querySelector('[data-testid="mobile-order-confirmation-modal"]');
		expect(modal?.getAttribute("data-open")).toBe("true");

		const lastRender = testState.modalRenders.at(-1);
		act(() => {
			lastRender?.onOpenChange(false);
		});

		const closingModal = container.querySelector('[data-testid="mobile-order-confirmation-modal"]');
		expect(closingModal).not.toBeNull();
		expect(closingModal?.getAttribute("data-open")).toBe("false");

		act(() => {
			vi.advanceTimersByTime(250);
		});
		expect(container.querySelector('[data-testid="mobile-order-confirmation-modal"]')).toBeNull();
	});

	it("keeps OrderConfirmationModal mounted with open=false during the 250ms exit after confirm", async () => {
		await act(async () => {
			getSubmitButton().click();
		});
		expect(container.querySelector('[data-testid="mobile-order-confirmation-modal"]')?.getAttribute("data-open")).toBe(
			"true",
		);

		const lastRender = testState.modalRenders.at(-1);
		await act(async () => {
			lastRender?.onConfirm();
		});

		expect(testState.submitOrder).toHaveBeenCalledOnce();
		const closingModal = container.querySelector('[data-testid="mobile-order-confirmation-modal"]');
		expect(closingModal).not.toBeNull();
		expect(closingModal?.getAttribute("data-open")).toBe("false");

		act(() => {
			vi.advanceTimersByTime(250);
		});
		expect(container.querySelector('[data-testid="mobile-order-confirmation-modal"]')).toBeNull();
	});
});
