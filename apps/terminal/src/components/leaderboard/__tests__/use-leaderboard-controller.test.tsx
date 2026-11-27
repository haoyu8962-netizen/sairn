// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeaderboardApiQuery, LeaderboardApiSuccessResponse } from "@/lib/leaderboard/leaderboard-api";
import { createI18nRoot } from "@/lib/tests/harness/react";
import type { LeaderboardRow } from "../leaderboard-domain";
import { LeaderboardView } from "../leaderboard-view";
import { useLeaderboardController } from "../use-leaderboard-controller";

interface QueryState {
	data: LeaderboardApiSuccessResponse | undefined;
	dataUpdatedAt?: number;
	fetchStatus: "idle" | "fetching" | "paused";
	isError: boolean;
	isStale?: boolean;
	refetch: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
	query: {} as QueryState,
	request: null as LeaderboardApiQuery | null,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerAddressUrl: (address: string) => `https://example.invalid/address/${address}`,
	useHyperliquid: () => ({ isTestnet: false }),
}));

vi.mock("../use-leaderboard-data", () => ({
	useLeaderboardData: (request: LeaderboardApiQuery) => {
		mocks.request = request;
		return mocks.query;
	},
}));

let controller: ReturnType<typeof useLeaderboardController> | null = null;

function Probe() {
	controller = useLeaderboardController();
	return null;
}

function ViewProbe() {
	controller = useLeaderboardController();
	return <LeaderboardView {...controller} />;
}

function setNavigatorOnline(online: boolean) {
	Object.defineProperty(window.navigator, "onLine", {
		configurable: true,
		value: online,
	});
	window.dispatchEvent(new Event(online ? "online" : "offline"));
}

describe("useLeaderboardController", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		mocks.query = query(response([row("1")]));
		mocks.request = null;
		controller = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		setNavigatorOnline(true);
		vi.useRealTimers();
	});

	it("derives normal and no-results states and preserves server-ranked rows", () => {
		render();
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });
		expect(current().rows[0]).toMatchObject({ rank: 1, pnl: "30" });
		expect(mocks.request).toMatchObject({ env: "Mainnet", period: "month", page: 1, pageSize: 10 });

		mocks.query.data = response([], { query: "missing" });
		act(() => current().onQueryChange("missing"));
		act(() => vi.advanceTimersByTime(250));
		expect(current()).toMatchObject({ pageState: "noResults", totalRows: 0 });
		expect(mocks.request?.query).toBe("missing");
	});

	it("updates the search field immediately and waits 250ms before requesting its normalized value", () => {
		mocks.query.data = response(
			Array.from({ length: 10 }, (_, index) => row(String(index + 1))),
			{
				totalRows: 11,
				totalPages: 2,
				end: 10,
			},
		);
		render();
		act(() => current().onNextPage());
		expect(mocks.request?.page).toBe(2);

		act(() => current().onQueryChange("  Trader  "));
		expect(current().query).toBe("  Trader  ");
		expect(mocks.request?.query).toBe("");
		expect(mocks.request?.page).toBe(2);

		act(() => vi.advanceTimersByTime(249));
		expect(mocks.request?.query).toBe("");

		act(() => vi.advanceTimersByTime(1));
		expect(mocks.request).toMatchObject({ query: "trader", page: 1 });
	});

	it("rejects search input beyond the API contract without replacing the committed value", () => {
		render();

		act(() => current().onQueryChange("x".repeat(129)));
		expect(current().query).toBe("");
		act(() => vi.advanceTimersByTime(250));
		expect(mocks.request).toMatchObject({ query: "", page: 1 });
	});

	it("uses a skeleton only for an active first request and fails visibly for paused or idle states", () => {
		mocks.query = query(undefined, { fetchStatus: "fetching" });
		render();
		expect(current().pageState).toBe("loading");

		mocks.query = query(undefined, { fetchStatus: "paused" });
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "paused", canRetry: false });

		mocks.query = query(undefined);
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "error", canRetry: true });

		act(() => current().onRetry());
		expect(mocks.query.refetch).toHaveBeenCalledOnce();
	});

	it("keeps rows visible during refresh and reports stale, failed, or paused refreshes", () => {
		mocks.query = query(response([row("1")]), { fetchStatus: "fetching" });
		render();
		expect(current()).toMatchObject({ pageState: "normal", isRefreshing: true, dataNotice: null });
		expect(current().rows).toHaveLength(1);

		mocks.query = query(response([row("1")], { stale: true }));
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "normal", dataNotice: "stale" });

		mocks.query = query(response([row("1")]), { isError: true });
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "normal", dataNotice: "refreshError" });

		mocks.query = query(response([row("1")]), { fetchStatus: "paused" });
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "normal", dataNotice: "paused", canRetry: false });
	});

	it("does not report a stale, failed, paused, or refreshing empty snapshot as confirmed empty", () => {
		mocks.query = query(response([], { stale: true }));
		render();
		expect(current()).toMatchObject({ pageState: "error", dataNotice: null, canRetry: true });

		mocks.query = query(response([], { query: "missing", stale: true }));
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "error", dataNotice: null, canRetry: true });

		mocks.query = query(response([], { query: "missing" }), { isError: true });
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "error", dataNotice: null, canRetry: true });

		mocks.query = query(response([], { query: "missing" }), { fetchStatus: "paused" });
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "paused", dataNotice: null, canRetry: false });

		mocks.query = query(response([], { query: "missing" }), { fetchStatus: "fetching" });
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "loading", dataNotice: null, isRefreshing: false });
	});

	it("expires an empty or no-results snapshot after the freshness window while keeping non-empty rows", () => {
		const now = Date.now();
		mocks.query = query(response([], { query: "missing" }), { dataUpdatedAt: now });
		render();
		act(() => current().onQueryChange("missing"));
		act(() => vi.advanceTimersByTime(250));
		expect(current()).toMatchObject({ pageState: "noResults", totalRows: 0 });

		act(() => vi.advanceTimersByTime(30_000));
		expect(current()).toMatchObject({ pageState: "error", dataNotice: null, canRetry: true });

		const nextNow = Date.now();
		mocks.query = query(response([], { query: "" }), { dataUpdatedAt: nextNow });
		act(() => current().onClearQuery());
		act(() => vi.advanceTimersByTime(250));
		expect(current()).toMatchObject({ pageState: "empty", totalRows: 0 });

		act(() => vi.advanceTimersByTime(30_000));
		expect(current()).toMatchObject({ pageState: "error", dataNotice: null, canRetry: true });

		mocks.query = query(response([], { query: "missing" }), { dataUpdatedAt: Date.now() - 31_000 });
		act(() => current().onQueryChange("missing"));
		act(() => vi.advanceTimersByTime(250));
		expect(current()).toMatchObject({ pageState: "error", dataNotice: null, canRetry: true });

		mocks.query = query(response([row("1")]), { dataUpdatedAt: Date.now() });
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "normal", dataNotice: null });

		act(() => vi.advanceTimersByTime(30_000));
		expect(current()).toMatchObject({ pageState: "normal", dataNotice: null });
	});

	it("replaces an empty search conclusion with a neutral loading placeholder during the 250ms debounce and preserves 250ms debounce", () => {
		const now = Date.now();
		mocks.query = query(response([], { query: "missing" }), { dataUpdatedAt: now });
		act(() => root.render(<ViewProbe />));

		act(() => current().onQueryChange("missing"));
		act(() => vi.advanceTimersByTime(250));
		expect(current()).toMatchObject({ pageState: "noResults", totalRows: 0 });
		expect(container.textContent).toContain("No matching trader");

		act(() => current().onQueryChange("0x1111111111111111111111111111111111111111"));
		expect(current().query).toBe("0x1111111111111111111111111111111111111111");
		expect(mocks.request?.query).toBe("missing");
		expect(current()).toMatchObject({ pageState: "loading", dataNotice: null, isRefreshing: false });
		expect(container.textContent).not.toContain("No matching trader");
		expect(container.textContent).not.toContain("No eligible leaderboard accounts");
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

		act(() => vi.advanceTimersByTime(249));
		expect(mocks.request?.query).toBe("missing");
		expect(current().pageState).toBe("loading");

		mocks.query = query(response([row("1")], { query: "0x1111111111111111111111111111111111111111" }), {
			dataUpdatedAt: Date.now(),
		});
		act(() => vi.advanceTimersByTime(1));
		expect(mocks.request?.query).toBe("0x1111111111111111111111111111111111111111");
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });
	});

	it("withholds empty conclusions when response query does not match normalized input or when clearing search", () => {
		const now = Date.now();
		mocks.query = query(response([], { query: "missing" }), { dataUpdatedAt: now });
		act(() => root.render(<ViewProbe />));
		expect(current().pageState).toBe("loading");
		expect(container.textContent).not.toContain("No matching trader");

		act(() => current().onQueryChange("  MISSING  "));
		act(() => vi.advanceTimersByTime(250));
		expect(current().pageState).toBe("noResults");
		expect(container.textContent).toContain("No matching trader");

		act(() => current().onClearQuery());
		expect(current().query).toBe("");
		expect(current().pageState).toBe("loading");
		expect(container.textContent).not.toContain("No matching trader");
		expect(container.textContent).not.toContain("No eligible leaderboard accounts");
	});

	it("withholds empty and no-results conclusions when offline even if the completed query stays idle", () => {
		const now = Date.now();
		mocks.query = query(response([], { query: "missing" }), { dataUpdatedAt: now, fetchStatus: "idle" });
		act(() => root.render(<ViewProbe />));
		act(() => current().onQueryChange("missing"));
		act(() => vi.advanceTimersByTime(250));
		expect(current().pageState).toBe("noResults");
		expect(container.textContent).toContain("No matching trader");

		act(() => setNavigatorOnline(false));
		expect(current()).toMatchObject({ pageState: "loading", dataNotice: null, canRetry: false });
		expect(container.textContent).not.toContain("No matching trader");
		expect(container.textContent).not.toContain("No eligible leaderboard accounts");
		expect(container.querySelector('[role="alert"]')).toBeNull();

		act(() => setNavigatorOnline(true));
		expect(current()).toMatchObject({ pageState: "noResults", canRetry: true });
		expect(container.textContent).toContain("No matching trader");

		mocks.query = query(response([], { query: "" }), { dataUpdatedAt: Date.now(), fetchStatus: "idle" });
		act(() => current().onClearQuery());
		act(() => vi.advanceTimersByTime(250));
		expect(current().pageState).toBe("empty");
		expect(container.textContent).toContain("No eligible leaderboard accounts");

		act(() => setNavigatorOnline(false));
		expect(current()).toMatchObject({ pageState: "loading", dataNotice: null, canRetry: false });
		expect(container.textContent).not.toContain("No eligible leaderboard accounts");
		expect(container.querySelector('[role="alert"]')).toBeNull();

		act(() => vi.advanceTimersByTime(30_000));
		act(() => setNavigatorOnline(true));
		expect(current()).toMatchObject({ pageState: "error", dataNotice: null, canRetry: true });
	});

	it("keeps non-empty rows visible during debounce and offline idle state", () => {
		const client = new QueryClient();
		mocks.query = query(response([row("1")], { query: "" }), { dataUpdatedAt: Date.now(), fetchStatus: "idle" });
		act(() =>
			root.render(
				<QueryClientProvider client={client}>
					<ViewProbe />
				</QueryClientProvider>,
			),
		);
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });

		act(() => current().onQueryChange("0x2222"));
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });

		act(() => setNavigatorOnline(false));
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });
		client.clear();
	});

	function render() {
		act(() => root.render(<Probe />));
	}

	function current() {
		if (!controller) throw new Error("Controller was not captured");
		return controller;
	}
});

function query(data: LeaderboardApiSuccessResponse | undefined, overrides: Partial<QueryState> = {}): QueryState {
	return {
		data,
		fetchStatus: "idle",
		isError: false,
		refetch: vi.fn(),
		...overrides,
	};
}

function response(
	rows: readonly LeaderboardRow[],
	overrides: Partial<LeaderboardApiSuccessResponse> = {},
): LeaderboardApiSuccessResponse {
	return {
		version: 1,
		env: "Mainnet",
		generatedAt: 1,
		stale: false,
		period: "month",
		sortKey: "pnl",
		sortDirection: "descending",
		query: "",
		rowsPerPage: 10,
		rows,
		totalRows: rows.length,
		totalPages: 1,
		page: 1,
		start: rows.length === 0 ? 0 : 1,
		end: rows.length,
		...overrides,
	};
}

function row(suffix: string): LeaderboardRow {
	return {
		rank: Number(suffix),
		address: `0x${suffix.padStart(40, "0")}`,
		displayName: null,
		accountValue: "250000",
		pnl: "30",
		roi: "0.03",
		volume: "300",
		prize: 0,
	};
}
