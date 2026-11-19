// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwapFillHistoryTable } from "@/components/trade/positions/twap-fill-history-table";
import { TwapHistoryTable } from "@/components/trade/positions/twap-history-table";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	query: { data: [], fetchStatus: "idle", isError: false, refetch: vi.fn() },
	stream: { data: undefined, isStale: false, status: "active" },
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x1111111111111111111111111111111111111111", isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useInfo: () => mocks.query,
	useMarkets: () => ({}),
	useSubscription: () => mocks.stream,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));
vi.mock("@/hooks/trade/use-order-display-labels", () => ({ useOrderDisplayLabels: () => ({}) }));
vi.mock("@/hooks/trade/use-twap-fill-history-csv", () => ({
	useTwapFillHistoryCsv: () => ({ exportCsv: vi.fn(), isExporting: false }),
}));

describe.each([
	{ Table: TwapHistoryTable, empty: "No TWAP history found." },
	{ Table: TwapFillHistoryTable, empty: "No TWAP fills found." },
])("desktop $empty", ({ Table, empty }) => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.query.fetchStatus = "idle";
		mocks.query.isError = false;
		mocks.stream.isStale = false;
		mocks.stream.status = "active";
		container = document.createElement("div");
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		Reflect.deleteProperty(window.navigator, "onLine");
	});

	it.each([
		{ state: "the cached REST snapshot failed to refresh", query: { isError: true } },
		{ state: "the REST snapshot is refreshing", query: { fetchStatus: "fetching" } },
		{ state: "the REST request is paused", query: { fetchStatus: "paused" } },
		{ state: "the realtime stream is subscribing", stream: { status: "subscribing" } },
		{ state: "the realtime stream is stale", stream: { isStale: true } },
	])("uses a blank placeholder while $state", ({ query, stream }) => {
		Object.assign(mocks.query, query);
		Object.assign(mocks.stream, stream);
		act(() => root.render(<Table />));

		expect(container.textContent).not.toContain(empty);
		expect(container.querySelector('[data-slot="passive-data-placeholder"]')).not.toBeNull();
	});

	it("uses a blank placeholder while the device is offline", () => {
		Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
		act(() => root.render(<Table />));

		expect(container.textContent).not.toContain(empty);
		expect(container.querySelector('[data-slot="passive-data-placeholder"]')).not.toBeNull();
	});

	it("keeps the empty statement for a settled, successful REST snapshot with a current stream", () => {
		act(() => root.render(<Table />));

		expect(container.textContent).toContain(empty);
		expect(container.querySelector('[data-slot="passive-data-placeholder"]')).toBeNull();
	});
});
