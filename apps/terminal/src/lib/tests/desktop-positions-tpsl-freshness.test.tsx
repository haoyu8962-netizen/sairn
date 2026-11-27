/** @vitest-environment jsdom */

import { act, useSyncExternalStore } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionsTab } from "@/components/trade/positions/positions-tab";
import type { Position } from "@/lib/hyperliquid";
import type { OpenOrder } from "@/lib/trade/open-orders";
import { createI18nRoot } from "./harness/react";

const subListeners = vi.hoisted(() => new Set<() => void>());
const mocks = vi.hoisted(() => ({
	subVersion: 0,
	address: "0x1111111111111111111111111111111111111111",
	openOrders: [] as OpenOrder[],
	openOrdersStatus: "active" as "active" | "subscribing" | "idle" | "error",
	openOrdersStale: false,
	hasOpenOrdersSnapshot: true,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: mocks.address,
		isConnected: true,
		hasWalletAccess: true,
		sessionMode: "wallet",
	}),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
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

vi.mock("@/components/trade/components/asset-badge", () => ({
	AssetBadge: ({ coin }: { coin: string }) => <span data-coin={coin} />,
}));

vi.mock("@/components/trade/positions/position-pnl-share-modal", () => ({
	PositionPnlShareModal: () => null,
}));

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
		positions: [btcPosition],
		isLoading: false,
		hasError: false,
		isStale: false,
	}),
}));

describe("Desktop PositionsTab TP/SL snapshot freshness", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.openOrders = tpSlOrders;
		mocks.openOrdersStatus = "active";
		mocks.openOrdersStale = false;
		mocks.hasOpenOrdersSnapshot = true;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function notifySubscription() {
		mocks.subVersion += 1;
		act(() => {
			for (const listener of subListeners) listener();
		});
	}

	function getTpSlCell(): HTMLTableCellElement | null {
		const row = container.querySelector("tbody tr");
		return row?.querySelectorAll<HTMLTableCellElement>("td")[7] ?? null;
	}

	it("shows a neutral placeholder instead of stale or unconfirmed TP/SL values and never falls back to Add while openOrders is not current", () => {
		act(() => root.render(<PositionsTab directionFilter="all" marketFilter={{ type: "all" }} currentMarket={null} />));

		expect(getTpSlCell()?.textContent).toContain("70,000");
		expect(getTpSlCell()?.textContent).toContain("55,000");

		mocks.openOrdersStale = true;
		notifySubscription();
		expect(getTpSlCell()?.textContent).not.toContain("70,000");
		expect(getTpSlCell()?.textContent).not.toContain("55,000");
		expect(getTpSlCell()?.textContent).not.toContain("Add");
		expect(getTpSlCell()?.textContent?.trim()).toBe("—");

		mocks.openOrdersStale = false;
		mocks.openOrdersStatus = "subscribing";
		notifySubscription();
		expect(getTpSlCell()?.textContent).not.toContain("70,000");
		expect(getTpSlCell()?.textContent).not.toContain("55,000");
		expect(getTpSlCell()?.textContent).not.toContain("Add");
		expect(getTpSlCell()?.textContent?.trim()).toBe("—");

		mocks.openOrdersStatus = "error";
		notifySubscription();
		expect(getTpSlCell()?.textContent).not.toContain("70,000");
		expect(getTpSlCell()?.textContent).not.toContain("Add");
		expect(getTpSlCell()?.textContent?.trim()).toBe("—");

		mocks.openOrdersStatus = "active";
		mocks.hasOpenOrdersSnapshot = false;
		notifySubscription();
		expect(getTpSlCell()?.textContent).not.toContain("Add");
		expect(getTpSlCell()?.textContent?.trim()).toBe("—");

		mocks.hasOpenOrdersSnapshot = true;
		mocks.openOrders = [];
		notifySubscription();
		expect(getTpSlCell()?.textContent).toContain("Add");
	});
});
