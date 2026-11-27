/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwapFillHistoryTable } from "@/components/trade/positions/twap-fill-history-table";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	fills: [] as Array<{
		coin: string;
		px: string;
		sz: string;
		side: "A" | "B";
		time: number;
		dir: string;
		closedPnl: string;
		fee: string;
		feeToken: string;
		oid: number;
		tid: number;
		twapId: number;
	}>,
	hasMore: false,
	markets: new Map<string, { shortName: string; szDecimals: number; kind: "perp" | "spot" }>(),
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/trade/use-twap-slice-fills", () => ({
	useTwapSliceFills: () => ({
		canConfirmEmpty: true,
		fills: mocks.fills,
		hasMore: mocks.hasMore,
		isConnected: true,
		isRealtimeDegraded: false,
		loadMore: vi.fn(),
		retryRealtime: vi.fn(),
		status: "ready",
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x1111111111111111111111111111111111111111", isConnected: true }),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/hooks/trade/use-twap-fill-history-csv", () => ({
	useTwapFillHistoryCsv: () => ({ exportCsv: vi.fn(), isExporting: false }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		getMarket: (coin: string) => mocks.markets.get(coin),
		getSzDecimals: (coin: string) => mocks.markets.get(coin)?.szDecimals ?? 4,
		getTokenDisplayName: (token: string) => token,
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TwapFillHistoryTable", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.markets.clear();
		mocks.hasMore = false;
		mocks.fills = [
			{
				coin: "DELISTED",
				px: "12.345",
				sz: "0.00001",
				side: "B",
				time: Date.UTC(2026, 6, 22, 12, 0, 0),
				dir: "Open Long",
				closedPnl: "0",
				fee: "0.01",
				feeToken: "USDC",
				oid: 1,
				tid: 10,
				twapId: 100,
			},
			{
				coin: "HYPE",
				px: "50.5",
				sz: "1.5",
				side: "A",
				time: Date.UTC(2026, 6, 22, 12, 1, 0),
				dir: "Close Long",
				closedPnl: "5.25",
				fee: "0.02",
				feeToken: "USDC",
				oid: 2,
				tid: 11,
				twapId: 101,
			},
		];
		mocks.markets.set("HYPE", { shortName: "HYPE", szDecimals: 2, kind: "perp" });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("preserves full protocol size precision when market metadata is missing while formatting known markets with szDecimals", () => {
		act(() => root.render(<TwapFillHistoryTable />));

		const rows = [...container.querySelectorAll("tbody tr")];
		expect(rows).toHaveLength(2);
		const delistedSizeCell = rows[0]?.querySelectorAll("td")[4]?.textContent?.trim();
		const knownSizeCell = rows[1]?.querySelectorAll("td")[4]?.textContent?.trim();

		expect(delistedSizeCell).toBe("0.00001 DELISTED");
		expect(knownSizeCell).toBe("1.50 HYPE");
	});

	it("keeps table, header row, body row, and load-more footer at least as wide as all fixed tracks plus gaps and padding", () => {
		mocks.hasMore = true;
		act(() => root.render(<TwapFillHistoryTable />));

		const table = container.querySelector("table");
		const headerRow = container.querySelector("thead tr");
		const bodyRow = container.querySelector("tbody tr");
		const loadMoreWrapper = container.querySelector("table")?.nextElementSibling;

		const trackMatch = /grid-cols-\[([^\]]+)\]/.exec(headerRow?.className ?? "");
		expect(trackMatch).not.toBeNull();
		const tracks = (trackMatch?.[1] ?? "").split("_").map((track) => Number.parseInt(track, 10));
		const requiredWidthPx = tracks.reduce((sum, width) => sum + width, 0) + (tracks.length - 1) * 16 + 40;
		expect(requiredWidthPx).toBe(1302);

		for (const element of [table, headerRow, bodyRow, loadMoreWrapper]) {
			const minWidthMatch = /min-w-\[(\d+)px\]/.exec(element?.className ?? "");
			expect(minWidthMatch, element?.className).not.toBeNull();
			expect(Number(minWidthMatch?.[1] ?? 0)).toBeGreaterThanOrEqual(requiredWidthPx);
		}
	});
});
