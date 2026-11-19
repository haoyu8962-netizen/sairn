/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSpotTokenUsdPriceState } from "@/hooks/trade/use-spot-token-usd-prices";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let spotMeta: unknown;

const mocks = vi.hoisted(() => ({
	markets: { spot: [] as unknown[], isLoading: false, error: null as Error | null },
	subscription: {
		data: { mids: { "@107": "30" } } as { mids: Record<string, string> } | undefined,
		status: "active",
		isStale: false,
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({ ...mocks.markets, catalogQueries: { spotMeta: { data: spotMeta } } }),
	useSubscription: () => mocks.subscription,
}));

let state: ReturnType<typeof useSpotTokenUsdPriceState> | null = null;

function Probe() {
	state = useSpotTokenUsdPriceState(true);
	return null;
}

describe("spot token USD price state", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		spotMeta = { tokens: [], universe: [] };
		mocks.markets = { spot: [], isLoading: false, error: null };
		mocks.subscription = { data: { mids: { "@107": "30" } }, status: "active", isStale: false };
		container = document.createElement("div");
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		state = null;
	});

	it("counts prices as current only once the spot catalog that resolves them has loaded", () => {
		mocks.markets = { spot: [], isLoading: true, error: null };
		act(() => root.render(<Probe />));
		expect(state?.status).toBe("loading");

		mocks.markets = { spot: [], isLoading: false, error: new Error("spotMeta failed") };
		act(() => root.render(<Probe />));
		expect(state?.status).toBe("error");

		mocks.markets = { spot: [], isLoading: false, error: null };
		act(() => root.render(<Probe />));
		expect(state?.status).toBe("success");
	});

	it("P1-1 rejects malformed successful spot metadata", () => {
		spotMeta = { tokens: [], universe: [{ name: "@107", tokens: [1, 0] }] };
		act(() => root.render(<Probe />));
		expect(state?.status).toBe("error");
	});

	it("keeps the price stream's own state while the stream is not current", () => {
		mocks.subscription = { data: undefined, status: "subscribing", isStale: false };
		act(() => root.render(<Probe />));
		expect(state?.status).toBe("loading");

		mocks.subscription = { data: { mids: { "@107": "30" } }, status: "active", isStale: true };
		act(() => root.render(<Probe />));
		expect(state?.status).toBe("stale");
	});
});
