/** @vitest-environment jsdom */

import { act, type ReactNode, useSyncExternalStore } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { MobilePositionsTab } from "@/components/trade/mobile/mobile-positions-tab";
import { useMobilePositionsDisclosureStates } from "@/components/trade/mobile/use-mobile-disclosure-set";
import type { Position } from "@/lib/hyperliquid";
import type { OpenOrder } from "@/lib/trade/open-orders";
import { createI18nRoot } from "./harness/react";

const subListeners = vi.hoisted(() => new Set<() => void>());
const mocks = vi.hoisted(() => ({
	subVersion: 0,
	address: "0x1111111111111111111111111111111111111111",
	isConnected: true,
	positions: [] as Position[],
	positionsLoading: false,
	positionsError: false,
	positionsStale: false,
	openOrders: [] as OpenOrder[],
	openOrdersStatus: "active" as "active" | "subscribing" | "idle" | "error",
	openOrdersStale: false,
	hasOpenOrdersSnapshot: true,
	navigateToMarket: vi.fn(),
	setActiveTab: vi.fn(),
	selectedMarket: "ETH",
	capturedOnGoToTrade: undefined as (() => void) | undefined,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: mocks.isConnected ? mocks.address : null,
		isConnected: mocks.isConnected,
		hasWalletAccess: true,
		sessionMode: "wallet",
	}),
	useReconnectWallet: () => ({ reconnectWallet: vi.fn(), isReconnecting: false }),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => mocks.navigateToMarket,
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ activeTab: "account", setActiveTab: mocks.setActiveTab }),
}));

vi.mock("@/stores/use-market-store", () => ({
	useSelectedMarket: () => mocks.selectedMarket,
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setSide: vi.fn() }),
}));

vi.mock("@/stores/use-position-dialog-store", () => ({
	usePositionDialogActions: () => ({
		openIsolatedMargin: vi.fn(),
		openLimitClose: vi.fn(),
		openReverse: vi.fn(),
		openTpSl: vi.fn(),
	}),
}));

vi.mock("@/hooks/trade/use-position-close-all-action", () => ({
	usePositionCloseAllAction: () => ({ canOpen: false, open: vi.fn(), unavailableReason: null }),
}));

vi.mock("@/hooks/trade/use-position-market-close-action", () => ({
	usePositionMarketCloseAction: () => ({ open: vi.fn(), pendingAssetId: null }),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ actionsBlocked: false }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: mocks.address, env: "Mainnet" as const }),
	useMarkets: () => ({
		getAssetId: () => 0,
		getMarket: () => ({
			kind: "perp" as const,
			name: "BTC",
			shortName: "BTC",
			pairName: "BTC-USDC",
			assetId: 0,
			szDecimals: 4,
		}),
	}),
	useMarketsInfo: () => ({
		getMarketInfo: () => ({ markPx: "62000", markPriceStatus: "success" as const }),
	}),
	useSelectedMarketInfo: () => ({ data: undefined }),
	useSubscription: () => {
		useSyncExternalStore(
			(listener) => {
				subListeners.add(listener);
				return () => subListeners.delete(listener);
			},
			() => mocks.subVersion,
		);
		return {
			data: mocks.hasOpenOrdersSnapshot ? { orders: mocks.openOrders } : undefined,
			status: mocks.openOrdersStatus,
			isStale: mocks.openOrdersStale,
		};
	},
	useUserPositions: () => ({
		positions: mocks.positions,
		isLoading: mocks.positionsLoading,
		hasError: mocks.positionsError,
		isStale: mocks.positionsStale,
	}),
}));

vi.mock("@/components/trade/positions/position-pnl-share-modal", () => ({
	PositionPnlShareModal: () => null,
}));

vi.mock("@/components/dashboard/dashboard-chrome", () => ({
	DashboardHeader: () => null,
	FooterBar: () => null,
	GlobalModals: () => null,
}));

vi.mock("@/components/dashboard/dashboard-frame-view", () => ({
	DashboardFrameView: ({ main }: { main: ReactNode }) => <div>{main}</div>,
}));

vi.mock("@/components/trade/account-activity-feed-owner", () => ({ AccountActivityFeedOwner: () => null }));
vi.mock("@/components/trade/mobile/mobile-account-transfers-tab", () => ({ MobileAccountTransfersTab: () => null }));
vi.mock("@/components/trade/mobile/mobile-balances-tab", () => ({ MobileBalancesTab: () => null }));
vi.mock("@/components/trade/mobile/mobile-positions-view", () => ({
	MobilePositionsView: ({ onGoToTrade }: { onGoToTrade?: () => void }) => {
		mocks.capturedOnGoToTrade = onGoToTrade;
		return (
			<button type="button" data-testid="portfolio-go-to-trade" onClick={onGoToTrade}>
				Go to Trade
			</button>
		);
	},
}));
vi.mock("@/components/trade/tradebox/account-mode-modal", () => ({ AccountModeModal: () => null }));
vi.mock("@/components/portfolio/portfolio-overview", () => ({ PortfolioOverview: () => null }));
vi.mock("@/lib/lazy", () => ({ createLazyComponent: () => () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: () => true,
	useDefaultDexBalances: () => ({
		accountAbstraction: "disabled",
		hasError: false,
		isDataStale: false,
		perpStateStatus: "success",
		spotStateStatus: "success",
	}),
}));
vi.mock("@/hooks/trade/use-account-abstraction-control", () => ({
	useAccountAbstractionControl: () => ({
		canSet: false,
		isLoading: false,
		isUpdating: false,
		portfolioMarginActivationEnabled: false,
		setAccountAbstraction: vi.fn(),
	}),
}));
vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: true,
		path: "external",
		reason: null,
		unavailableLabel: "",
		unavailableReason: null,
	}),
}));
vi.mock("@/hooks/trade/use-funds-action-availability", () => ({
	useFundsActionAvailability: () => ({
		assertFreshGeoAllowed: vi.fn(),
		internalTransfer: { available: true, reason: null, unavailableReason: null },
		withdrawal: { available: true, reason: null, unavailableReason: null },
	}),
}));
vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
	useSendModalActions: () => ({ open: vi.fn() }),
	useSwapModalActions: () => ({ openStablecoins: vi.fn() }),
	useTransferModalActions: () => ({ open: vi.fn() }),
}));
vi.mock("@/stores/use-global-settings-store", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/use-global-settings-store")>();
	return { ...actual, useIsTestnet: () => false };
});

const btcPosition: Position = {
	dex: "",
	coin: "BTC",
	szi: "0.5",
	entryPx: "60000",
	positionValue: "31000",
	unrealizedPnl: "1000",
	returnOnEquity: "0.1",
	liquidationPx: "50000",
	marginUsed: "3000",
	maxLeverage: 20,
	leverage: { type: "cross", value: 10 },
	cumFunding: { allTime: "0", sinceChange: "0", sinceOpen: "-12.5" },
};

const tpSlOrders = [
	{
		coin: "BTC",
		oid: 101,
		side: "A",
		orderType: "Take Profit Market",
		isPositionTpsl: true,
		isTrigger: true,
		reduceOnly: true,
		triggerPx: "70000",
		limitPx: "70000",
		sz: "0",
		origSz: "0",
		timestamp: 1_786_000_000_000,
		triggerCondition: "Price above 70000",
		tif: null,
		cloid: null,
		children: [],
	},
	{
		coin: "BTC",
		oid: 102,
		side: "A",
		orderType: "Stop Market",
		isPositionTpsl: true,
		isTrigger: true,
		reduceOnly: true,
		triggerPx: "55000",
		limitPx: "55000",
		sz: "0",
		origSz: "0",
		timestamp: 1_786_000_000_000,
		triggerCondition: "Price below 55000",
		tif: null,
		cloid: null,
		children: [],
	},
] as unknown as OpenOrder[];

function PositionsTabHarness({ onGoToTrade }: { onGoToTrade?: () => void }) {
	const disclosureStates = useMobilePositionsDisclosureStates("Mainnet:0x1111");
	return <MobilePositionsTab disclosureState={disclosureStates.positions} onGoToTrade={onGoToTrade} />;
}

describe("MobilePositionsTab fixes (K1, B1-01, B1-02)", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.isConnected = true;
		mocks.positions = [btcPosition];
		mocks.positionsLoading = false;
		mocks.positionsError = false;
		mocks.positionsStale = false;
		mocks.openOrders = tpSlOrders;
		mocks.openOrdersStatus = "active";
		mocks.openOrdersStale = false;
		mocks.hasOpenOrdersSnapshot = true;
		mocks.navigateToMarket.mockReset();
		mocks.setActiveTab.mockReset();
		mocks.selectedMarket = "ETH";
		mocks.capturedOnGoToTrade = undefined;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("forbids vertical scrolling on mobile-position-filters-scroll (K1)", () => {
		act(() => root.render(<PositionsTabHarness />));
		const scroller = container.querySelector<HTMLElement>('[data-testid="mobile-position-filters-scroll"]');
		expect(scroller).not.toBeNull();
		expect(scroller?.className).toContain("overflow-x-auto");
		expect(scroller?.className).toContain("overflow-y-hidden");
	});

	it("hides stale or reconnecting openOrders TP/SL prices behind stable placeholders (B1-01)", () => {
		act(() => root.render(<PositionsTabHarness />));
		const expand = container.querySelector<HTMLButtonElement>('button[aria-label^="Expand "]');
		act(() => expand?.click());

		const getTpSlButton = () =>
			[...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
				button.textContent?.startsWith("TP/SL"),
			);

		expect(getTpSlButton()?.textContent).toContain("70,000");
		expect(getTpSlButton()?.textContent).toContain("55,000");

		mocks.openOrdersStale = true;
		mocks.subVersion += 1;
		act(() => {
			for (const listener of subListeners) listener();
		});
		expect(getTpSlButton()?.textContent).not.toContain("70,000");
		expect(getTpSlButton()?.textContent).not.toContain("55,000");
		expect(getTpSlButton()?.textContent).toContain("--/--");

		mocks.openOrdersStale = false;
		mocks.openOrdersStatus = "subscribing";
		mocks.subVersion += 1;
		act(() => {
			for (const listener of subListeners) listener();
		});
		expect(getTpSlButton()?.textContent).not.toContain("70,000");
		expect(getTpSlButton()?.textContent).not.toContain("55,000");
		expect(getTpSlButton()?.textContent).toContain("--/--");
	});

	it("delegates empty-positions Go to Trade to host navigation on Portfolio (B1-02)", () => {
		mocks.positions = [];
		const onGoToTrade = vi.fn();
		act(() => root.render(<PositionsTabHarness onGoToTrade={onGoToTrade} />));

		const goToTradeButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Go to Trade",
		);
		expect(goToTradeButton).not.toBeUndefined();
		act(() => goToTradeButton?.click());
		expect(onGoToTrade).toHaveBeenCalledOnce();
		expect(mocks.setActiveTab).not.toHaveBeenCalled();

		act(() => root.render(<PortfolioPage />));
		expect(mocks.capturedOnGoToTrade).toBeTypeOf("function");
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="portfolio-go-to-trade"]')?.click());
		expect(mocks.navigateToMarket).toHaveBeenCalledWith("ETH", undefined, { displayedContent: "trade" });
	});
});
