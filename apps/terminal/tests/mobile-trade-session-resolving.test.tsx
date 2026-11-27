/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import type { OrderParameters } from "@nktkas/hyperliquid";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	twapAdvancedEnabled: false,
	twapTriggerPrice: "",
	twapStopPrice: "",
	hasWalletAccess: true,
	isSignerLoading: false,
	signerMode: "owner" as "owner" | "agent",
	availableBalance: 100,
	baseAvailable: 100,
	availabilityStatus: "success" as "success" | "loading" | "stale" | "error",
	isAwaitingFirstDeposit: false,
	openDeposit: vi.fn(),
	kind: "perp" as "perp" | "spot",
	limitPrice: "",
	triggerPrice: "",
	markPx: "100",
	prevDayPx: undefined as string | undefined,
	formatLocale: "en-US",
	markPriceStatus: "success" as "success" | "loading" | "stale" | "error",
	maxSize: 10,
	openInterestCapped: false,
	orderType: "market",
	selectedPrice: null as { marketName: string; price: string } | null,
	sizeModeRequest: null as { marketName: string; mode: "base" | "quote" } | null,
	toggleSizeDenomination: vi.fn(),
	orderValue: 100,
	quoteAvailable: 100,
	spotBuyQuoteCost: undefined as number | undefined,
	reduceOnly: false,
	side: "buy" as "buy" | "sell",
	sizeValue: 1,
	scaleStart: "",
	scaleEnd: "",
	scaleLevels: null as number | null,
	scaleSkew: "",
	orderEntryInput: undefined as unknown,
	requestSubmit: vi.fn(),
	submitOrder: vi.fn(),
	executionGuard: undefined as ((params: OrderParameters) => void) | undefined,
	tradingReady: true,
	isSubmitting: false,
	registerStatus: "idle" as "idle" | "approving_fee" | "approving_agent" | "verifying",
	authorize: vi.fn(async () => {}),
	actions: {
		markDraftEdited: vi.fn(),
		setLimitPriceFromPrefill: vi.fn(),
		setLimitPriceFromUser: vi.fn(),
		setOrderType: vi.fn(),
		setReduceOnly: vi.fn(),
		setSide: vi.fn(),
		setSize: vi.fn(),
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
	useSwitchChain: () => ({ isPending: false, switchChain: wagmiState.switchChain }),
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

vi.mock("@/components/trade/chart/token-selector", () => ({ TokenSelector: () => null }));
vi.mock("@/components/trade/tradebox/margin-mode-modal", () => ({ MarginModeModal: () => null }));
vi.mock("@/components/trade/tradebox/order-confirmation-modal", () => ({ OrderConfirmationModal: () => null }));
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

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({ available: true, unavailableReason: null }),
}));

vi.mock("@/hooks/trade/use-fee-rates", () => ({
	useMarketFeeRates: () => ({ makerRate: 0.0001, takerRate: 0.0002 }),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));

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
			availabilityMaxAgeMs: 10_000,
			availabilityReceivedAt: Date.now(),
			availabilityStatus: testState.availabilityStatus,
			availableBalance: testState.availableBalance,
			availableBalanceToken: testState.side === "sell" && testState.kind === "spot" ? "BTC" : "USDC",
			baseToken: "BTC",
			capabilities: {
				allowsCrossMargin: true,
				hasReduceOnly: false,
				hasTpSl: false,
				isLeveraged: testState.kind === "perp",
			},
			committedLeverage: null,
			toggleSizeDenomination: testState.toggleSizeDenomination,
			currentLeverage: 10,
			executionAvailability: { kind: "perp", maxBaseBySide: { buy: "10", sell: "10" } },
			applySizePercent: vi.fn(),
			beginSizePercentGesture: vi.fn(),
			endSizePercentGesture: vi.fn(),
			hasAvailabilityError: testState.availabilityStatus === "error",
			isAwaitingFirstDeposit: testState.isAwaitingFirstDeposit,
			hasPosition: false,
			isAvailabilityBlocked: testState.availabilityStatus !== "success",
			isBalanceAvailabilityBlocked: testState.availabilityStatus !== "success",
			conversionPrice: 100,
			isAvailabilityLoading: testState.availabilityStatus === "loading",
			isAvailabilityStale: testState.availabilityStatus === "stale",
			isSpotMarket: testState.kind === "spot",
			isOpenInterestCapped: testState.openInterestCapped,
			isSwitchingMode: false,
			leverage: 10,
			marginMode: "cross",
			maxLeverage: 50,
			maxSize: testState.maxSize,
			orderValue: input.orderValueForSize?.(String(testState.sizeValue)) ?? testState.orderValue,
			pendingLeverage: null,
			positionStateReady: true,
			quoteToken: "USDC",
			resetPendingLeverage: vi.fn(),
			setPendingLeverage: vi.fn(),
			sideLabels: { buy: "Buy", sell: "Sell" },
			sizeForOrder: String(testState.sizeValue),
			sizeValue: testState.sizeValue,
			spotBalance: {
				baseAvailable: testState.baseAvailable,
				quoteAvailable: testState.quoteAvailable,
			},
			spotBuyQuoteCost: testState.spotBuyQuoteCost ?? testState.orderValue,
			switchModeError: null,
			szDecimals: 3,
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
					id: Symbol("mobile-size-validation-session"),
					env: "Mainnet",
					clientKey: "0xabc",
					sessionMode: "wallet",
					active: true,
				},
			}),
			isDraftResetTokenCurrent: () => true,
			handleSubmit: testState.submitOrder,
			isSubmitting: testState.isSubmitting,
		};
	},
}));

vi.mock("@/hooks/trade/use-prospective-cross-margin-account", () => ({
	useProspectiveCrossMarginAccount: () => ({ account: null, existingPosition: null }),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({
		actionsBlocked: false,
		isError: false,
		isResolved: true,
		tradeRestricted: false,
	}),
}));

vi.mock("@privy-io/react-auth", async () => (await import("@/lib/tests/harness/wallet-session-stage")).privyMock);
vi.mock("@privy-io/wagmi", async () => (await import("@/lib/tests/harness/wallet-session-stage")).privyWagmiMock);

vi.mock("@/lib/hyperliquid", async () => ({
	...(await import("@/lib/tests/harness/wallet-session-stage")).hyperliquidSessionMock,
	getMarketCapabilities: () => ({
		allowsCrossMargin: true,
		hasReduceOnly: false,
		hasTpSl: false,
		isLeveraged: testState.kind === "perp",
	}),
	useTradingStatus: () => ({
		isSignerLoading: testState.isSignerLoading,
		isSignerReady: !testState.isSignerLoading,
		isBuilderFeeLoading: false,
		isReady: testState.tradingReady,
		signerMode: testState.signerMode,
	}),
	useSelectedMarketInfo: () => ({
		data: {
			assetId: testState.kind === "spot" ? 10_000 : 0,
			kind: testState.kind,
			markPriceReceivedAt: Date.now(),
			markPriceStatus: testState.markPriceStatus,
			markPx: testState.markPx,
			midPriceReceivedAt: Date.now(),
			midPx: testState.markPx,
			name: testState.kind === "spot" ? "BTC/USDC" : "BTC",
			pairName: "BTC/USDC",
			prevDayPx: testState.prevDayPx ?? testState.markPx,
			szDecimals: 3,
		},
	}),
	useInfo: () => ({ data: undefined }),
	useTradingAuthorization: () => ({ authorize: testState.authorize, status: testState.registerStatus }),
	useUserPositions: () => ({
		getPosition: () => null,
		hasError: false,
		isLoading: false,
		isStale: false,
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
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => testState.formatLocale,
	useMarketOrderSlippageBps: () => 50,
	useMarketOrderSlippagePercent: () => 0.5,
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useLimitPrice: () => testState.limitPrice,
	useOrderEntryActions: () => testState.actions,
	useOrderSide: () => testState.side,
	useOrderSize: () => String(testState.sizeValue),
	useOrderSizeSource: () => null,
	useOrderType: () => testState.orderType,
	useReduceOnly: () => testState.reduceOnly,
	useScaleEnd: () => testState.scaleEnd,
	useScaleLevels: () => testState.scaleLevels,
	useScaleSkew: () => testState.scaleSkew,
	useScaleStart: () => testState.scaleStart,
	useSlPrice: () => "",
	useTif: () => "Gtc",
	useTpPrice: () => "",
	useTpSlEnabled: () => false,
	useTpSlReturnInvalid: () => false,
	useTriggerPrice: () => testState.triggerPrice,
	useTwapAdvancedEnabled: () => testState.twapAdvancedEnabled,
	useTwapDurationDraft: () => null,
	useTwapMinutes: () => null,
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

import { MobileTradeView } from "@/components/trade/mobile/mobile-trade-view";
import {
	resetWalletSessionStage,
	setWalletSessionStage,
	type WalletSessionStage,
} from "@/lib/tests/harness/wallet-session-stage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileTradeView order button while the wallet session resolves", () => {
	let container: HTMLDivElement;
	let root: Root;

	async function show(stage: WalletSessionStage) {
		await act(async () => setWalletSessionStage(stage));
	}

	function ctaButton(): HTMLButtonElement {
		const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button.w-full"));
		const button = buttons.find((candidate) => ["Buy", "Connect Wallet"].includes(candidate.textContent?.trim() ?? ""));
		if (!button) throw new Error("Expected the order button");
		return button;
	}

	beforeEach(async () => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		window.sessionStorage.clear();
		resetWalletSessionStage("connected");
		testState.requestSubmit.mockClear();
		testState.submitOrder.mockClear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileTradeView sizeMode="base" onSizeModeChange={vi.fn()} />
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
		const button = ctaButton();
		expect(button.textContent?.trim()).toBe("Buy");
		expect(button.disabled).toBe(false);
		await act(async () => button.click());
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

		const button = ctaButton();
		expect(button.textContent?.trim()).toBe("Buy");
		expect(button.disabled).toBe(true);
		expect(container.textContent).not.toContain("Connect Wallet");
		await act(async () => button.click());
		expect(testState.requestSubmit).not.toHaveBeenCalled();
		expect(testState.submitOrder).not.toHaveBeenCalled();
		expect(testState.authorize).not.toHaveBeenCalled();

		await show("connected");
		expect(ctaButton().textContent?.trim()).toBe("Buy");
		expect(ctaButton().disabled).toBe(false);
	});

	it.each(["signed-out", "wallet-missing", "connected-other-account", "authentication-initialising-first-visit"] as const)("offers Connect Wallet once the session is %s", async (stage) => {
		await show(stage);

		const button = ctaButton();
		expect(button.textContent?.trim()).toBe("Connect Wallet");
		expect(button.disabled).toBe(false);
		await act(async () => button.click());
		expect(testState.requestSubmit).not.toHaveBeenCalled();
	});

	it("offers Connect Wallet when a reconnect ends without a wallet", async () => {
		await show("reconnecting");
		expect(ctaButton().textContent?.trim()).toBe("Buy");

		await show("wallet-missing");
		expect(ctaButton().textContent?.trim()).toBe("Connect Wallet");
		expect(ctaButton().disabled).toBe(false);
	});
});
