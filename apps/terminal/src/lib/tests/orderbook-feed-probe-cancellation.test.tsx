// @vitest-environment jsdom

import type { ISubscriptionTransport } from "@nktkas/hyperliquid";
import { HyperliquidStoreContext } from "@sairn/hl-react/provider";
import { createHyperliquidStore, type HyperliquidStore } from "@sairn/hl-react/store";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireL2SubscriptionGate } from "../../../../../packages/hl-react/src/subscriptions/l2-subscription-gate";

vi.mock("@/lib/hyperliquid", async () => {
	const l2 = await import("../../../../../packages/hl-react/src/subscriptions/l2");
	const hook = await import("@sairn/hl-react/hooks/useL2BookSubscription");
	return {
		...l2,
		...hook,
		useSubscription: () => ({ data: { coin: "BTC", time: 1, fast: true }, status: "active", isStale: false }),
	};
});

vi.mock("@/lib/error-reporting/client", () => ({ reportClientError: vi.fn() }));

import { type OrderbookFeedResult, useOrderbookFeed } from "@/hooks/trade/use-orderbook-feed";

const PARAMS = { coin: "BTC", fast: true as const };

describe("order book retry probe cancellation", () => {
	let root: Root;
	let container: HTMLDivElement;
	let store: HyperliquidStore;
	let transport: ISubscriptionTransport;
	let latest: OrderbookFeedResult;

	function Probe() {
		latest = useOrderbookFeed({ compact: true, enabled: true, shown: true, env: "Mainnet", params: PARAMS });
		return null;
	}

	beforeEach(() => {
		vi.useFakeTimers();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		transport = {
			subscribe: vi.fn(() => Promise.resolve({ unsubscribe: vi.fn(async () => {}) })),
		};
		store = createHyperliquidStore({ wsTransport: transport, ssr: false });
		container = document.createElement("div");
		root = createRoot(container);
		act(() =>
			root.render(
				<HyperliquidStoreContext.Provider value={store}>
					<Probe />
				</HyperliquidStoreContext.Provider>,
			),
		);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		window.dispatchEvent(new Event("online"));
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		vi.useRealTimers();
	});

	async function reachRetryWait() {
		await act(() => vi.advanceTimersByTimeAsync(5_000));
		expect(transport.subscribe).toHaveBeenCalledTimes(1);
		expect(latest.source).toBe("l2Book-fast");
	}

	it.each(["offline", "hidden"])("does not enter transport after a queued probe becomes %s", async (pause) => {
		await reachRetryWait();
		const blocker = await acquireL2SubscriptionGate(transport, { type: "l2", c: "BTC", s: 5, m: 2 });
		await act(() => vi.advanceTimersByTimeAsync(60_000));
		expect(transport.subscribe).toHaveBeenCalledTimes(1);

		act(() => {
			if (pause === "offline") window.dispatchEvent(new Event("offline"));
			else {
				Object.defineProperty(document, "hidden", { value: true, configurable: true });
				document.dispatchEvent(new Event("visibilitychange"));
			}
		});
		await act(async () => {
			await blocker.release(async () => {});
		});

		expect(transport.subscribe).toHaveBeenCalledTimes(1);
		expect(latest.source).toBe("l2Book-fast");
		await act(() => vi.advanceTimersByTimeAsync(10_000));
		expect(transport.subscribe).toHaveBeenCalledTimes(1);
		act(() => {
			if (pause === "offline") window.dispatchEvent(new Event("online"));
			else {
				Object.defineProperty(document, "hidden", { value: false, configurable: true });
				document.dispatchEvent(new Event("visibilitychange"));
			}
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(transport.subscribe).toHaveBeenCalledTimes(2);
		expect(latest.source).toBe("l2Book-fast");
		await act(() => vi.advanceTimersByTimeAsync(5_000));
		await act(() => vi.advanceTimersByTimeAsync(119_999));
		expect(transport.subscribe).toHaveBeenCalledTimes(2);
		await act(() => vi.advanceTimersByTimeAsync(1));
		expect(transport.subscribe).toHaveBeenCalledTimes(3);
	});
});
