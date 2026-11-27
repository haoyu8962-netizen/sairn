/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderSubmitInput } from "@/hooks/trade/use-order-submit";

const testState = vi.hoisted(() => ({
	markPx: "100",
	formatLocale: "en-US",
	skipOrderConfirmation: false,
	capturedOrderSubmitInputs: [] as OrderSubmitInput[],
	submitTwap: vi.fn(),
	submitOrder: vi.fn(),
	addOrder: vi.fn(() => "queue-1"),
	updateOrder: vi.fn(),
	toastError: vi.fn(),
	exchangeSession: {
		id: Symbol("twap-invalid-price-session"),
		env: "Mainnet" as const,
		clientKey: "0x1111111111111111111111111111111111111111",
		sessionMode: "wallet" as const,
		active: true,
	},
}));

vi.mock("@/hooks/trade/use-order-submit", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/hooks/trade/use-order-submit")>();
	return {
		...actual,
		useOrderSubmit: (options?: Parameters<typeof actual.useOrderSubmit>[0]) => {
			const submitter = actual.useOrderSubmit(options);
			return {
				...submitter,
				handleSubmit: async (input: OrderSubmitInput) => {
					testState.capturedOrderSubmitInputs.push(input);
					await submitter.handleSubmit(input);
				},
			};
		},
	};
});

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
vi.mock("@/components/trade/tradebox/trade-header", () => ({ TradeHeader: () => null }));
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
	getResolvedFormatLocale: () => testState.formatLocale,
	getSkipOrderConfirmation: () => testState.skipOrderConfirmation,
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

describe.each(["desktop", "mobile"] as const)("TWAP non-empty unparseable price guard on %s", (surface) => {
	let container: HTMLDivElement;
	let root: Root;
	let actions: ReturnType<typeof useOrderEntryActions>;

	function Harness() {
		actions = useOrderEntryActions();
		return (
			<I18nProvider i18n={i18n}>
				{surface === "desktop" ? <TradePanel /> : <MobileTradeView sizeMode="base" onSizeModeChange={() => {}} />}
			</I18nProvider>
		);
	}

	function getPrimarySubmitButton(): HTMLButtonElement {
		const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(node) =>
				node.textContent === "Place Buy Order" ||
				node.textContent === "Buy" ||
				node.textContent === "Place Sell Order" ||
				node.textContent === "Sell",
		);
		if (!button) throw new Error(`Expected primary submit button on ${surface}`);
		return button;
	}

	function getPriceInput(ariaLabel: string): HTMLInputElement {
		const input = container.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
		if (!input) throw new Error(`Expected input ${ariaLabel} on ${surface}`);
		return input;
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		vi.stubGlobal("matchMedia", () => ({
			matches: surface === "mobile",
			addEventListener() {},
			removeEventListener() {},
		}));
		testState.markPx = "100";
		testState.formatLocale = "en-US";
		testState.skipOrderConfirmation = false;
		testState.capturedOrderSubmitInputs = [];
		testState.toastError.mockReset();
		testState.submitOrder.mockReset();
		testState.submitTwap.mockReset().mockResolvedValue({
			state: "confirmed",
			result: { status: "ok", response: { type: "twapOrder", data: { status: { running: { twapId: 1 } } } } },
		});
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
			actions.setTwapAdvancedEnabled(true);
		});
	});

	afterEach(() => {
		act(() => actions.resetForm());
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it.each([
		{
			field: "trigger" as const,
			ariaLabel: "Trigger Price (USDC)",
			expectedError: "Enter a valid trigger price",
			skipConfirmation: false,
		},
		{
			field: "trigger" as const,
			ariaLabel: "Trigger Price (USDC)",
			expectedError: "Enter a valid trigger price",
			skipConfirmation: true,
		},
		{
			field: "stop" as const,
			ariaLabel: "Max Price (USDC)",
			expectedError: "Enter a valid max price",
			skipConfirmation: false,
		},
		{
			field: "stop" as const,
			ariaLabel: "Max Price (USDC)",
			expectedError: "Enter a valid max price",
			skipConfirmation: true,
		},
	])(
		"blocks confirmation and submission with a field error when $field price is '.' (skipConfirmation=$skipConfirmation)",
		async ({ ariaLabel, expectedError, skipConfirmation }) => {
			testState.skipOrderConfirmation = skipConfirmation;
			act(() => root.render(<Harness />));

			const input = getPriceInput(ariaLabel);
			act(() => changeInput(input, "."));

			expect(input.value).toBe(".");

			const submitButton = getPrimarySubmitButton();
			await act(async () => {
				submitButton.click();
			});

			expect(testState.submitTwap).toHaveBeenCalledTimes(0);
			expect(document.querySelector('[data-testid="order-confirmation-rows"]')).toBeNull();
			expect(submitButton.disabled).toBe(true);
			expect(input.getAttribute("aria-invalid")).toBe("true");
			const describedById = input.getAttribute("aria-describedby");
			expect(describedById).toBeTruthy();
			expect(describedById ? document.getElementById(describedById)?.textContent : null).toContain(expectedError);
			expect(input.parentElement?.className).toContain("border-trading-panel-error");
			expect(container.textContent).toContain(expectedError);
		},
	);

	it("blocks a lone comma in a comma-decimal locale and shows the sell min-price error", async () => {
		testState.formatLocale = "de-DE";
		testState.skipOrderConfirmation = true;
		act(() => actions.setSide("sell"));
		act(() => root.render(<Harness />));

		const minInput = getPriceInput("Min Price (USDC)");
		act(() => changeInput(minInput, ","));

		expect(minInput.value).toBe(".");
		expect(minInput.getAttribute("aria-invalid")).toBe("true");
		expect(container.textContent).toContain("Enter a valid min price");
		expect(getPrimarySubmitButton().disabled).toBe(true);

		await act(async () => {
			getPrimarySubmitButton().click();
		});

		expect(testState.submitTwap).toHaveBeenCalledTimes(0);
	});

	it("restores valid unconditional and stop-only TWAP submission when cleared or completed", async () => {
		testState.skipOrderConfirmation = true;
		act(() => root.render(<Harness />));

		const triggerInput = getPriceInput("Trigger Price (USDC)");
		const maxInput = getPriceInput("Max Price (USDC)");
		act(() => changeInput(triggerInput, "."));
		expect(getPrimarySubmitButton().disabled).toBe(true);

		act(() => changeInput(triggerInput, ""));
		expect(triggerInput.getAttribute("aria-invalid")).toBeNull();
		expect(getPrimarySubmitButton().disabled).toBe(false);

		act(() => changeInput(maxInput, "110"));
		await act(async () => {
			getPrimarySubmitButton().click();
		});

		expect(testState.submitTwap).toHaveBeenCalledTimes(1);
		expect(testState.submitTwap.mock.calls[0]?.[0]).toMatchObject({
			details: { t: null, s: "110" },
		});
	});

	it("ignores hidden invalid advanced drafts when advanced settings are toggled off", async () => {
		testState.skipOrderConfirmation = true;
		act(() => root.render(<Harness />));

		act(() => changeInput(getPriceInput("Trigger Price (USDC)"), "."));
		expect(getPrimarySubmitButton().disabled).toBe(true);

		act(() => actions.setTwapAdvancedEnabled(false));
		expect(getPrimarySubmitButton().disabled).toBe(false);

		await act(async () => {
			getPrimarySubmitButton().click();
		});

		expect(testState.submitTwap).toHaveBeenCalledTimes(1);
		expect(testState.submitTwap.mock.calls[0]?.[0]).not.toHaveProperty("details");
	});

	it.each([false, true])(
		"forwards raw draft strings and normalized TWAP prices into useOrderSubmit (skipConfirmation=%s)",
		async (skipConfirmation) => {
			testState.skipOrderConfirmation = skipConfirmation;
			act(() => root.render(<Harness />));

			const triggerInput = getPriceInput("Trigger Price (USDC)");
			const maxInput = getPriceInput("Max Price (USDC)");
			act(() => {
				changeInput(triggerInput, "101.50");
				changeInput(maxInput, "110.50");
			});

			expect(triggerInput.value).toBe("101.50");
			expect(maxInput.value).toBe("110.50");
			expect(getPrimarySubmitButton().disabled).toBe(false);

			await act(async () => {
				getPrimarySubmitButton().click();
			});

			if (!skipConfirmation) {
				const confirm = document.querySelector<HTMLButtonElement>('[data-testid="confirm-twap-order"]');
				if (!confirm) throw new Error(`Expected confirmation button on ${surface}`);
				await act(async () => {
					confirm.click();
				});
			}

			expect(testState.capturedOrderSubmitInputs).toHaveLength(1);
			expect(testState.capturedOrderSubmitInputs[0]).toMatchObject({
				twapOrder: true,
				twapAdvancedEnabled: true,
				twapTriggerPriceInput: "101.50",
				twapTriggerPx: "101.5",
				twapTriggerDirection: "above",
				twapStopPriceInput: "110.50",
				twapStopPx: "110.5",
			});
			expect(testState.submitTwap).toHaveBeenCalledTimes(1);
			expect(testState.submitTwap.mock.calls[0]?.[0]).toMatchObject({
				details: { t: { p: "101.5", a: true }, s: "110.5" },
			});
		},
	);

	it("forwards empty trigger draft and raw stop draft into useOrderSubmit for a stop-only TWAP", async () => {
		testState.skipOrderConfirmation = true;
		act(() => root.render(<Harness />));

		const maxInput = getPriceInput("Max Price (USDC)");
		act(() => changeInput(maxInput, "110.50"));

		await act(async () => {
			getPrimarySubmitButton().click();
		});

		expect(testState.capturedOrderSubmitInputs).toHaveLength(1);
		expect(testState.capturedOrderSubmitInputs[0]).toMatchObject({
			twapOrder: true,
			twapAdvancedEnabled: true,
			twapTriggerPriceInput: "",
			twapTriggerPx: null,
			twapTriggerDirection: null,
			twapStopPriceInput: "110.50",
			twapStopPx: "110.5",
		});
		expect(testState.submitTwap).toHaveBeenCalledTimes(1);
		expect(testState.submitTwap.mock.calls[0]?.[0]).toMatchObject({
			details: { t: null, s: "110.5" },
		});
	});
});
