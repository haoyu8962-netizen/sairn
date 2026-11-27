/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountAbstraction, SpotBalance } from "@/hooks/trade/use-account-balances";

const state = vi.hoisted(() => ({
	activeTab: "balances",
	address: "0x1111111111111111111111111111111111111111",
	isConnected: true,
	accountAbstraction: "disabled" as AccountAbstraction,
	accountModeSetup: "manual" as "awaiting-funds" | "pending" | "manual" | null,
	defaultDexPerpValue: "0",
	selectedDex: "xyz",
	selectedDexMarginValue: "250.5",
	selectedDexCrossValue: "0",
	spotBalances: [] as SpotBalance[],
	hasAllDexsSnapshot: true,
	hasSpotStateSnapshot: true,
	perpStateStatus: "success" as "idle" | "loading" | "success" | "stale" | "error",
	spotStateStatus: "success" as "idle" | "loading" | "success" | "stale" | "error",
	isLoading: false,
	isDataStale: false,
	hasError: false,
	market: {
		kind: "builderPerp" as const,
		name: "xyz:ORCL",
		quoteToken: { name: "USDC" },
	},
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: state.isConnected ? state.address : null,
		isConnected: state.isConnected,
		hasWalletAccess: true,
		sessionMode: "wallet",
	}),
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/use-global-settings-store")>();
	return {
		...actual,
		useGlobalSettingsActions: () => ({ setPositionsActiveTab: vi.fn() }),
		usePositionsActiveTab: () => state.activeTab,
	};
});

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderSide: () => "buy",
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
}));

vi.mock("@/hooks/trade/use-active-asset-data", () => ({
	useActiveAssetData: () => ({
		data: { availableToTrade: ["250.5", "250.5"] as [string, string] },
		market: state.market,
		status: "success" as const,
	}),
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPrices: () => ({ USDC: "1", VERYLONGTOKENSYMBOL: "1" }),
}));

vi.mock("@/hooks/trade/use-account-mode-setup", () => ({
	useAccountModeSetupKind: () => state.accountModeSetup,
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
		internalTransfer: { available: true, reason: null, unavailableReason: null },
		withdrawal: { available: true, reason: null, unavailableReason: null },
	}),
}));

vi.mock("@/lib/hyperliquid/markets/use-spot-tokens", () => ({
	useSpotTokens: () => ({ getToken: () => ({ szDecimals: 2 }) }),
}));

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin, nameClassName }: { coin: string; nameClassName?: string }) => (
		<span data-testid={`asset-name-${coin}`} className={nameClassName}>
			{coin}
		</span>
	),
}));

vi.mock("@/components/trade/positions/transfer-modal", () => ({
	TransferModal: () => null,
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useDefaultDexBalances: () => ({
		dex: "",
		accountAbstraction: state.accountAbstraction,
		perpSummary: { accountValue: state.defaultDexPerpValue, totalMarginUsed: "0" },
		marginSummary: {
			accountValue: state.defaultDexPerpValue,
			totalMarginUsed: "0",
			totalRawUsd: state.defaultDexPerpValue,
		},
		spotBalances: state.spotBalances,
		spotAvailableAfterMaintenance: [],
		withdrawable: state.defaultDexPerpValue,
		hasAllDexsSnapshot: state.hasAllDexsSnapshot,
		hasSpotStateSnapshot: state.hasSpotStateSnapshot,
		perpStateStatus: state.perpStateStatus,
		spotStateStatus: state.spotStateStatus,
		hasError: state.hasError,
		isDataStale: state.isDataStale,
		isLoading: state.isLoading,
	}),
	useSelectedDexBalances: () => ({
		dex: state.selectedDex,
		accountAbstraction: state.accountAbstraction,
		perpSummary: { accountValue: state.selectedDexCrossValue, totalMarginUsed: "0" },
		marginSummary: {
			accountValue: state.selectedDexMarginValue,
			totalMarginUsed: "0",
			totalRawUsd: state.selectedDexMarginValue,
		},
		spotBalances: state.spotBalances,
		spotAvailableAfterMaintenance: [],
		withdrawable: state.selectedDexMarginValue,
		hasAllDexsSnapshot: state.hasAllDexsSnapshot,
		hasSpotStateSnapshot: state.hasSpotStateSnapshot,
		perpStateStatus: state.perpStateStatus,
		spotStateStatus: state.spotStateStatus,
		hasError: state.hasError,
		isDataStale: state.isDataStale,
		isLoading: state.isLoading,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: "Mainnet" as const }),
	useSubscription: (type: string) => ({
		data: type === "twapStates" ? { states: [] } : { orders: [] },
		isStale: false,
		status: "active",
	}),
	useUserPositions: () => ({
		positions: [],
		isLoading: false,
		hasError: false,
		isStale: false,
	}),
}));

vi.mock("@/components/trade/mobile/mobile-bottom-nav", () => ({ MobileBottomNavSpacer: () => null }));
vi.mock("@/components/trade/mobile/mobile-funding-tab", () => ({ MobileFundingTab: () => null }));
vi.mock("@/components/trade/mobile/mobile-history-tab", () => ({ MobileHistoryTab: () => null }));
vi.mock("@/components/trade/mobile/mobile-orders-history-tab", () => ({ MobileOrdersHistoryTab: () => null }));
vi.mock("@/components/trade/mobile/mobile-orders-tab", () => ({ MobileOrdersTab: () => null }));
vi.mock("@/components/trade/mobile/mobile-positions-tab", () => ({ MobilePositionsTab: () => null }));
vi.mock("@/components/trade/mobile/mobile-twap-tab", () => ({ MobileTwapTab: () => null }));

import { MobileBalancesTab } from "@/components/trade/mobile/mobile-balances-tab";
import { MobilePositionsView } from "@/components/trade/mobile/mobile-positions-view";

describe("Mobile balances tab count consistency (B1-03) and non-truncating rows (B-02)", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		state.activeTab = "balances";
		state.isConnected = true;
		state.accountAbstraction = "disabled";
		state.accountModeSetup = null;
		state.defaultDexPerpValue = "0";
		state.selectedDex = "xyz";
		state.selectedDexMarginValue = "250.5";
		state.selectedDexCrossValue = "0";
		state.spotBalances = [];
		state.hasAllDexsSnapshot = true;
		state.hasSpotStateSnapshot = true;
		state.perpStateStatus = "success";
		state.spotStateStatus = "success";
		state.isLoading = false;
		state.isDataStale = false;
		state.hasError = false;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderView() {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobilePositionsView includeBottomNavSpacer={false} balancesContent={<MobileBalancesTab />} />
				</I18nProvider>,
			);
		});
	}

	it("matches the rendered row count for a HIP-3 market with collateral when default DEX and spot are empty (B1-03)", () => {
		renderView();

		const visibleRows = container.querySelectorAll("article");
		expect(visibleRows).toHaveLength(1);
		const balancesTab = container.querySelector<HTMLElement>('[data-mobile-account-tab="balances"]');
		expect(balancesTab?.textContent).toBe("Balances(1)");
	});

	it("matches the merged row count in unifiedAccount mode instead of double-counting shared USDC (B1-03)", () => {
		state.accountAbstraction = "unifiedAccount";
		state.defaultDexPerpValue = "500";
		state.selectedDexMarginValue = "500";
		state.spotBalances = [{ coin: "USDC", token: 0, total: "500", hold: "0", entryNtl: "0" }];
		renderView();

		const visibleRows = container.querySelectorAll("article");
		expect(visibleRows).toHaveLength(1);
		const balancesTab = container.querySelector<HTMLElement>('[data-mobile-account-tab="balances"]');
		expect(balancesTab?.textContent).toBe("Balances(1)");
	});

	it("shows loading instead of a count while default account mode setup is still pending (B1-03)", () => {
		state.accountAbstraction = "default";
		state.accountModeSetup = "pending";
		renderView();

		expect(container.querySelector('[data-slot="data-pending"]')).not.toBeNull();
		const countSlot = container.querySelector<HTMLElement>('[data-mobile-position-tab-count="balances"]');
		expect(countSlot?.querySelector('[role="status"]')).not.toBeNull();
		expect(countSlot?.textContent).not.toContain("(0)");
	});

	it("does not truncate balance asset names, USD values, or available amounts (B-02)", () => {
		state.spotBalances = [{ coin: "VERYLONGTOKENSYMBOL", token: 1, total: "12345678.90", hold: "0", entryNtl: "0" }];
		renderView();

		const articles = [...container.querySelectorAll("article")];
		expect(articles.length).toBeGreaterThan(0);
		for (const article of articles) {
			expect(article.querySelectorAll(".truncate")).toHaveLength(0);
		}
		const longAssetName = container.querySelector('[data-testid="asset-name-VERYLONGTOKENSYMBOL"]');
		expect(longAssetName?.className).not.toContain("truncate");
		expect(longAssetName?.className).toContain("break-words");
	});
});
