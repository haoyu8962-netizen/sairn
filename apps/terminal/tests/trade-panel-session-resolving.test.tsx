/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import type { OrderParameters } from "@nktkas/hyperliquid";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	twapAdvancedEnabled: false,
	twapTriggerPrice: "",
	twapStopPrice: "",
	authorize: vi.fn(async () => {}),
	availableBalance: 100,
	accountModeBlocked: false,
	isAwaitingFirstDeposit: false,
	openDeposit: vi.fn(),
	hasWalletAccess: true,
	isReady: true,
	isSignerLoading: false,
	signerMode: "owner" as "owner" | "agent",
	limitPrice: "100",
	openInterestCapped: false,
	orderType: "limit",
	selectedPrice: null as { marketName: string; price: string } | null,
	sizeModeRequest: null as { marketName: string; mode: "base" | "quote" } | null,
	toggleSizeDenomination: vi.fn(),
	triggerPrice: "",
	scaleStart: "",
	scaleEnd: "",
	scaleLevels: null as number | null,
	scaleSkew: "",
	orderEntryInput: undefined as unknown,
	scaleSummaryProps: undefined as { orderValue?: number; marginRequired?: number | null } | undefined,
	sizeForOrder: "1",
	kind: "perp" as "perp" | "spot",
	quoteAvailable: 0,
	spotBuyQuoteCost: undefined as number | undefined,
	requestSubmit: vi.fn(),
	submitOrder: vi.fn(),
	executionGuard: undefined as ((params: OrderParameters) => void) | undefined,
	actions: {
		markDraftEdited: vi.fn(),
		setLimitPriceFromPrefill: vi.fn(),
		setLimitPriceFromUser: vi.fn(),
		setOrderType: vi.fn(),
		setReduceOnly: vi.fn(),
		setSide: vi.fn(),
		setSize: vi.fn(),
		setSizeMode: vi.fn(),
		setSlPrice: vi.fn(),
		setTpPrice: vi.fn(),
		setTpSlEnabled: vi.fn(),
		setTriggerPrice: vi.fn(),
	},
}));

const wagmiState = vi.hoisted(() => ({
	connectionChainId: 42161 as number,
	walletClientError: null as Error | null,
	walletClientLoading: false,
	walletClientMissing: false,
	switchChain: vi.fn(),
}));

vi.mock("wagmi", async () => {
	const { wagmiMock } = await import("@/lib/tests/harness/wallet-session-stage");
	return {
	useConnection: () => ({ ...wagmiMock.useConnection(), chainId: wagmiState.connectionChainId }),
	useSwitchChain: () => ({ isPending: false, mutate: wagmiState.switchChain }),
	useWalletClient: (parameters?: { chainId?: number }) => {
		const matchesConnection = parameters?.chainId === wagmiState.connectionChainId;
		const data =
			matchesConnection && !wagmiState.walletClientLoading && !wagmiState.walletClientMissing
				? { account: { address: "0xabc" } }
				: undefined;
		const error = matchesConnection ? null : wagmiState.walletClientError;
		return { data, error, isLoading: wagmiState.walletClientLoading };
	},
};
});

vi.mock("@/components/trade/tradebox/trade-form-fields", () => ({ TradeFormFields: () => null }));
vi.mock("@/components/trade/tradebox/trade-header", () => ({ TradeHeader: () => null }));
vi.mock("@/components/trade/tradebox/order-summary", () => ({ OrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/scale-order-summary", () => ({
	ScaleOrderSummary: (props: { orderValue?: number; marginRequired?: number | null }) => {
		testState.scaleSummaryProps = props;
		return null;
	},
}));
vi.mock("@/components/trade/tradebox/twap-order-summary", () => ({ TwapOrderSummary: () => null }));
vi.mock("@/components/trade/tradebox/order-confirmation-modal", () => ({ OrderConfirmationModal: () => null }));
vi.mock("@/components/trade/tradebox/lazy-trade-settings-modals", () => ({
	AccountModeModal: () => null,
	LeverageModal: () => null,
	MarginModeModal: () => null,
	MaxSlippageModal: () => null,
	warmTradeSettingsModals: vi.fn(),
}));
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
vi.mock("@/hooks/trade/use-market-slippage-estimate", () => ({ useMarketSlippageEstimate: () => null }));
vi.mock("@/hooks/trade/use-order-confirmation", () => ({
	useOrderConfirmation: () => ({
		cancel: vi.fn(),
		confirm: vi.fn(),
		dontShowAgain: false,
		isConfirming: false,
		pending: null,
		requestSubmit: testState.requestSubmit,
		setDontShowAgain: vi.fn(),
	}),
}));
vi.mock("@/hooks/trade/use-order-entry-data", () => ({
	useOrderEntryData: (input: { orderValueForSize?: (size: string) => number | undefined }) => {
		testState.orderEntryInput = input;
		return {
			accountAbstraction: "disabled",
			allowsIsolatedMarginRemoval: false,
			applyMarginAndLeverage: vi.fn(),
			applySizePercent: vi.fn(),
			beginSizePercentGesture: vi.fn(),
			endSizePercentGesture: vi.fn(),
			availabilityMaxAgeMs: 20_000,
			availabilityReceivedAt: Date.now(),
			availabilityStatus: testState.accountModeBlocked ? "error" : "success",
			availableBalance: testState.availableBalance,
			baseToken: "BTC",
			committedLeverage: null,
			conversionPrice: 100,
			currentLeverage: 10,
			executionAvailability: { kind: "perp", maxBaseBySide: { buy: "10", sell: "10" } },
			hasAvailabilityError: testState.accountModeBlocked,
			hasPosition: false,
			isAvailabilityBlocked: testState.accountModeBlocked,
			isAwaitingFirstDeposit: testState.isAwaitingFirstDeposit,
			isAvailabilityLoading: false,
			isAvailabilityStale: false,
			isLeverageUpdating: false,
			isOpenInterestCapped: testState.openInterestCapped,
			isSpotMarket: testState.kind === "spot",
			isSwitchingMode: false,
			leverage: 10,
			leverageInteractionIdentity: "Mainnet:BTC",
			marginMode: "cross",
			maxLeverage: 50,
			maxSize: 10,
			orderValue: input.orderValueForSize?.(testState.sizeForOrder) ?? 100,
			pendingLeverage: null,
			positionStateReady: true,
			quoteToken: "USDC",
			resetPendingLeverage: vi.fn(),
			setPendingLeverage: vi.fn(),
			sideLabels: { buy: "Buy", sell: "Sell", buyAria: "Buy", sellAria: "Sell" },
			sizeForOrder: testState.sizeForOrder,
			sizeValue: Number(testState.sizeForOrder),
			spotBalance: { baseAvailable: 0, quoteAvailable: testState.quoteAvailable },
			spotBuyQuoteCost: testState.spotBuyQuoteCost ?? input.orderValueForSize?.(testState.sizeForOrder) ?? 100,
			szDecimals: 3,
			toggleSizeDenomination: testState.toggleSizeDenomination,
		};
	},
}));
vi.mock("@/hooks/trade/use-order-submit", () => ({
	useOrderSubmit: (options: { executionGuard?: (params: OrderParameters) => void }) => {
		testState.executionGuard = options.executionGuard;
		return {
		captureDraftResetToken: () => ({
			orderEntry: { marketIdentity: "Mainnet:BTC", draftRevision: 0 },
			exchangeSession: {
				id: Symbol("desktop-open-interest-cap-session"),
				env: "Mainnet",
				clientKey: "0xabc",
				sessionMode: "wallet",
				active: true,
			},
		}),
		isDraftResetTokenCurrent: () => true,
		handleSubmit: testState.submitOrder,
		isSubmitting: false,
		};
	},
}));
vi.mock("@/hooks/trade/use-prospective-cross-margin-account", () => ({
	useProspectiveCrossMarginAccount: () => ({ account: null, existingPosition: null }),
}));
vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ actionsBlocked: false, isError: false, isResolved: true, tradeRestricted: false }),
}));
vi.mock("@privy-io/react-auth", async () => (await import("@/lib/tests/harness/wallet-session-stage")).privyMock);
vi.mock("@privy-io/wagmi", async () => (await import("@/lib/tests/harness/wallet-session-stage")).privyWagmiMock);

vi.mock("@/lib/hyperliquid", async () => ({
	...(await import("@/lib/tests/harness/wallet-session-stage")).hyperliquidSessionMock,
	getMarketCapabilities: () => ({ allowsCrossMargin: true, hasReduceOnly: true, hasTpSl: true, isLeveraged: true }),
	useMarketsInfo: () => ({ spotMarkets: [], isLoading: false, error: null }),
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
			pairName: "BTC-USDC",
			szDecimals: 3,
		},
	}),
	useTradingAuthorization: () => ({ authorize: testState.authorize, status: "idle" }),
	useTradingStatus: () => ({
		isBuilderFeeLoading: false,
		isReady: testState.isReady,
		isSignerLoading: testState.isSignerLoading,
		isSignerReady: !testState.isSignerLoading,
		signerMode: testState.signerMode,
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
	useDepositModalActions: () => ({ open: testState.openDeposit }),
	useEstablishConnectionModalActions: () => ({ open: vi.fn() }),
	useSettingsDialogActions: () => ({ open: vi.fn() }),
	useSwapModalActions: () => ({ open: vi.fn() }),
}));
vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	useMarketOrderSlippageBps: () => 50,
	useMarketOrderSlippagePercent: () => 0.5,
}));
vi.mock("@/stores/use-order-entry-store", () => ({
	useLimitPrice: () => testState.limitPrice,
	useOrderEntryActions: () => testState.actions,
	useOrderSide: () => "buy",
	useOrderSize: () => "1",
	useOrderType: () => testState.orderType,
	useReduceOnly: () => false,
	useScaleEnd: () => testState.scaleEnd,
	useScaleLevels: () => testState.scaleLevels,
	useScaleSkew: () => testState.scaleSkew,
	useScaleStart: () => testState.scaleStart,
	useSizeMode: () => "base",
	useSlPrice: () => "",
	useTif: () => "Gtc",
	useTpPrice: () => "",
	useTpSlEnabled: () => false,
	useTpSlReturnInvalid: () => false,
	useTriggerPrice: () => testState.triggerPrice,
	useTwapAdvancedEnabled: () => testState.twapAdvancedEnabled,
	useTwapDurationDraft: () => null,
	useTwapMinutes: () => 30,
	useTwapRandomize: () => false,
	useTwapStopPrice: () => testState.twapStopPrice,
	useTwapTriggerPrice: () => testState.twapTriggerPrice,
}));
vi.mock("@/stores/use-orderbook-actions-store", () => ({
	getOrderbookActionsStore: () => ({
		actions: { clearSelectedPrice: vi.fn(), clearSizeModeRequest: vi.fn(), takeSizeModeRequest: () => true },
	}),
	getSelectedPriceForMarket: (selection: { marketName: string; price: string } | null, marketName?: string) =>
		selection && selection.marketName === marketName ? selection.price : null,
	useSelectedPrice: () => testState.selectedPrice,
	useSizeModeRequest: () => testState.sizeModeRequest,
}));

import { TradePanel } from "@/components/trade/tradebox/trade-panel";

import {
	resetWalletSessionStage,
	setWalletSessionStage,
	type WalletSessionStage,
} from "@/lib/tests/harness/wallet-session-stage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("desktop TradePanel order button while the wallet session resolves", () => {
	let container: HTMLDivElement;
	let root: Root;

	async function show(stage: WalletSessionStage) {
		await act(async () => setWalletSessionStage(stage));
	}

	function orderButton(): HTMLButtonElement {
		const button = container
			.querySelector<HTMLElement>('[data-slot="trade-panel-footer"]')
			?.querySelector<HTMLButtonElement>("button");
		if (!button) throw new Error("Expected the order button");
		return button;
	}

	beforeEach(async () => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		window.sessionStorage.clear();
		resetWalletSessionStage("connected");
		testState.availableBalance = 100;
		testState.accountModeBlocked = false;
		testState.isAwaitingFirstDeposit = false;
		testState.limitPrice = "100";
		testState.openInterestCapped = false;
		testState.orderType = "limit";
		testState.selectedPrice = null;
		testState.sizeModeRequest = null;
		testState.triggerPrice = "";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<TradePanel key="trade-panel" />
				</I18nProvider>,
			);
		});
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("offers the order to the exact owner", async () => {
		expect(orderButton().textContent?.trim()).toBe("Place Buy Order");
		expect(orderButton().disabled).toBe(false);
		await act(async () => orderButton().click());
		expect(testState.requestSubmit).toHaveBeenCalledOnce();
	});

	it.each([
		"authentication-initialising",
		"directory-initialising",
		"activating",
		"connecting",
		"reconnecting",
	] as const)("keeps the action name, disabled, while the session is %s", async (stage) => {
		await show(stage);

		expect(orderButton().textContent?.trim()).toBe("Place Buy Order");
		expect(orderButton().disabled).toBe(true);
		expect(container.textContent).not.toContain("Connect Wallet");
		await act(async () => orderButton().click());
		expect(testState.requestSubmit).not.toHaveBeenCalled();
		expect(testState.submitOrder).not.toHaveBeenCalled();
		expect(testState.authorize).not.toHaveBeenCalled();

		await show("connected");
		expect(orderButton().textContent?.trim()).toBe("Place Buy Order");
		expect(orderButton().disabled).toBe(false);
	});

	it.each([
		"signed-out",
		"wallet-missing",
		"connected-other-account",
		"authentication-initialising-first-visit",
	] as const)("offers Connect Wallet once the session is %s", async (stage) => {
		await show(stage);

		expect(orderButton().textContent?.trim()).toBe("Connect Wallet");
		expect(orderButton().disabled).toBe(false);
		await act(async () => orderButton().click());
		expect(testState.requestSubmit).not.toHaveBeenCalled();
	});

	it("announces a failed Enable Trading request through one alert", async () => {
		testState.isReady = false;
		testState.authorize.mockRejectedValueOnce(new Error("User rejected the request."));
		try {
			await act(async () => {
				root.render(
					<I18nProvider i18n={i18n}>
						<TradePanel key="trade-panel" />
					</I18nProvider>,
				);
			});
			expect(orderButton().textContent?.trim()).toBe("Enable Trading");
			expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);

			await act(async () => orderButton().click());

			const alerts = [...container.querySelectorAll('[role="alert"]')];
			expect(testState.authorize).toHaveBeenCalledOnce();
			expect(alerts).toHaveLength(1);
			expect(alerts[0]?.textContent?.trim()).not.toBe("");
		} finally {
			testState.isReady = true;
		}
	});
});
