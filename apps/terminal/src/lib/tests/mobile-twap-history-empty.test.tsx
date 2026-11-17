/** @vitest-environment jsdom */

import type { TwapHistoryResponse, UserFillsResponse, UserTwapSliceFillsResponse } from "@nktkas/hyperliquid";
import { act, type ComponentType } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

// The real mobile lists on the real useTwapHistory and useTwapSliceFills hooks; only the transport hooks of
// @/lib/hyperliquid are replaced. docs/mobile-data-presentation.md: an empty statement needs a complete, current,
// successful snapshot.

const OWNER = "0x1111111111111111111111111111111111111111";

type QueryState = {
	data: unknown;
	error: unknown;
	fetchStatus: "fetching" | "idle" | "paused";
	isError: boolean;
	refetch: () => void;
};
type StreamState = {
	data: unknown;
	error: unknown;
	isStale: boolean;
	status: "active" | "error" | "idle" | "subscribing";
};

const mocks = vi.hoisted(() => ({
	query: { data: [], error: null, fetchStatus: "idle", isError: false, refetch: () => {} } as QueryState,
	stream: { data: undefined, error: undefined, isStale: false, status: "active" } as StreamState,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: OWNER, isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useInfo: () => mocks.query,
	useMarkets: () => ({
		getMarket: () => ({ kind: "perp", shortName: "BTC", szDecimals: 5 }),
		getSzDecimals: () => 5,
		getTokenDisplayName: (name: string) => name,
	}),
	useSubscription: () => mocks.stream,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/hooks/trade/use-order-display-labels", () => ({
	useOrderDisplayLabels: () => ({ getTwapHistoryStatusLabel: () => "Finished" }),
}));

vi.mock("@/hooks/trade/use-twap-fill-history-csv", () => ({
	useTwapFillHistoryCsv: () => ({ exportCsv: vi.fn(), isExporting: false }),
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ setActiveTab: vi.fn() }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
}));

import { MobileTwapFillHistoryList } from "@/components/trade/mobile/mobile-twap-fill-history-list";
import { MobileTwapHistoryList } from "@/components/trade/mobile/mobile-twap-history-list";

const historyRow: TwapHistoryResponse[number] = {
	state: {
		coin: "BTC",
		executedNtl: "600",
		executedSz: "0.01",
		minutes: 10,
		randomize: false,
		reduceOnly: false,
		side: "B",
		stopPx: null,
		sz: "0.01",
		timestamp: 1_000_000,
		trigger: null,
		user: OWNER,
	},
	status: { status: "finished" },
	time: 2_000,
	twapId: 7,
};

const fill: UserFillsResponse[number] = {
	closedPnl: "0",
	coin: "BTC",
	crossed: true,
	dir: "Open Long",
	fee: "0.01",
	feeToken: "USDC",
	hash: `0x${"0".repeat(64)}`,
	oid: 7,
	px: "60000",
	side: "B",
	startPosition: "0",
	sz: "0.01",
	tid: 7,
	time: 2_000_000,
	twapId: 7,
};
const fillRow: UserTwapSliceFillsResponse[number] = { fill, twapId: 7 };

const LISTS = [
	{ name: "TWAP history", List: MobileTwapHistoryList, empty: "No TWAP history found.", row: historyRow },
	{ name: "TWAP fill history", List: MobileTwapFillHistoryList, empty: "No TWAP fills found.", row: fillRow },
] as const;

const NOT_CURRENT = [
	{
		state: "the last request failed and the earlier empty answer is retained",
		apply: () => {
			mocks.query.isError = true;
			mocks.query.error = new Error("request failed");
		},
	},
	{
		state: "a request is running",
		apply: () => {
			mocks.query.fetchStatus = "fetching";
		},
	},
	{
		state: "the request is paused offline",
		apply: () => {
			mocks.query.fetchStatus = "paused";
		},
	},
	{
		state: "the stream is still subscribing",
		apply: () => {
			mocks.stream.status = "subscribing";
		},
	},
	{
		state: "the stream waits for a fresh frame after a reconnect",
		apply: () => {
			mocks.stream.isStale = true;
		},
	},
	{
		state: "the stream failed",
		apply: () => {
			mocks.stream.status = "error";
			mocks.stream.error = new Error("stream failed");
		},
	},
] as const;

describe("mobile TWAP history and fill lists: empty statement", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.query = { data: [], error: null, fetchStatus: "idle", isError: false, refetch: () => {} };
		mocks.stream = { data: undefined, error: undefined, isStale: false, status: "active" };
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	// A new element each time: rendering the same element again would skip the component.
	function render(List: ComponentType) {
		act(() => root.render(<List />));
	}

	describe.each(LISTS)("$name", ({ List, empty, row }) => {
		it("states an empty list for a current, successful, empty snapshot", () => {
			render(List);

			expect(container.textContent).toContain(empty);
			expect(container.querySelector('[data-slot="data-pending"]')).toBeNull();
		});

		it.each(NOT_CURRENT)("stays blank while $state, and states it again once current", ({ apply }) => {
			apply();
			render(List);

			expect(container.textContent).not.toContain(empty);
			expect(container.querySelector('[data-slot="data-pending"]')).not.toBeNull();
			expect(container.querySelector('[role="alert"]')).toBeNull();
			expect(container.querySelector("output")).toBeNull();
			expect(container.textContent).not.toMatch(/Loading|Failed|Retry|unavailable/i);

			mocks.query = { data: [], error: null, fetchStatus: "idle", isError: false, refetch: () => {} };
			mocks.stream = { data: undefined, error: undefined, isStale: false, status: "active" };
			render(List);

			expect(container.textContent).toContain(empty);
		});

		it.each(NOT_CURRENT)("keeps loaded rows while $state", ({ apply }) => {
			mocks.query.data = [row];
			apply();
			render(List);

			expect(container.querySelectorAll("article")).toHaveLength(1);
			expect(container.querySelector('[data-slot="data-pending"]')).toBeNull();
			expect(container.textContent).not.toContain(empty);
		});
	});
});
