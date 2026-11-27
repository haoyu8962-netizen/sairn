// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeaderboardApiSuccessResponse } from "@/lib/leaderboard/leaderboard-api";
import { createI18nRoot } from "@/lib/tests/harness/react";
import type { LeaderboardRow } from "../leaderboard-domain";
import { LeaderboardView } from "../leaderboard-view";
import { useLeaderboardController } from "../use-leaderboard-controller";

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerAddressUrl: (address: string) => `https://example.invalid/address/${address}`,
	useHyperliquid: () => ({ isTestnet: false }),
}));

let controller: ReturnType<typeof useLeaderboardController> | null = null;

function LeaderboardHarness() {
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

function makeRow(suffix: string): LeaderboardRow {
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

function makeJsonResponse(
	rows: readonly LeaderboardRow[],
	overrides: Partial<LeaderboardApiSuccessResponse> = {},
): Response {
	const payload: LeaderboardApiSuccessResponse = {
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
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

describe("Leaderboard empty-state freshness with real QueryClient", () => {
	let client: QueryClient;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		setNavigatorOnline(true);
		controller = null;
		client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		client.clear();
		setNavigatorOnline(true);
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	async function flush() {
		for (let step = 0; step < 6; step += 1) {
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
		}
	}

	it("withdraws stale empty search conclusions during debounce, while offline+idle, and at 30,000ms", async () => {
		const targetAddress = "0x0000000000000000000000000000000000000001";
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = new URL(String(input), "https://example.invalid");
			const q = url.searchParams.get("query") ?? "";
			if (q === "missing") return makeJsonResponse([], { query: "missing" });
			if (q === targetAddress) return makeJsonResponse([makeRow("1")], { query: targetAddress });
			return makeJsonResponse([], { query: "" });
		});

		act(() =>
			root.render(
				<QueryClientProvider client={client}>
					<LeaderboardHarness />
				</QueryClientProvider>,
			),
		);
		await flush();

		expect(controller?.pageState).toBe("empty");
		expect(container.textContent).toContain("No eligible leaderboard accounts");

		act(() => controller?.onQueryChange("missing"));
		expect(controller?.pageState).toBe("loading");
		expect(container.textContent).not.toContain("No eligible leaderboard accounts");
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(249);
		});
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(controller?.pageState).toBe("loading");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
		});
		await flush();
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(controller?.pageState).toBe("noResults");
		expect(container.textContent).toContain("No matching trader");

		act(() => setNavigatorOnline(false));
		expect(controller?.pageState).toBe("loading");
		expect(container.textContent).not.toContain("No matching trader");
		expect(container.querySelector('[role="alert"]')).toBeNull();

		act(() => setNavigatorOnline(true));
		expect(controller?.pageState).toBe("noResults");
		expect(container.textContent).toContain("No matching trader");

		act(() => controller?.onQueryChange(targetAddress));
		expect(controller?.pageState).toBe("loading");
		expect(container.textContent).not.toContain("No matching trader");
		expect(fetchSpy).toHaveBeenCalledTimes(2);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(250);
		});
		await flush();
		expect(fetchSpy).toHaveBeenCalledTimes(3);
		expect(controller?.pageState).toBe("normal");
		expect(controller?.totalRows).toBe(1);

		act(() => controller?.onQueryChange("missing"));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(250);
		});
		await flush();
		expect(controller?.pageState).toBe("noResults");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(29_499);
		});
		expect(controller?.pageState).toBe("noResults");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
		});
		expect(controller?.pageState).toBe("error");
		expect(container.textContent).not.toContain("No matching trader");
	});
});
