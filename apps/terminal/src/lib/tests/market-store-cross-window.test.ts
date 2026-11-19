/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";

type MarketStoreModule = typeof import("@/stores/use-market-store");
type Actions = ReturnType<MarketStoreModule["useMarketActions"]>;

const KEY = STORAGE_KEYS.MARKET_PREFS;
const windowListeners: Array<Array<{ type: string; listener: (event: Event) => void }>> = [];

function readStored(): {
	version?: number;
	state?: { selectedMarkets?: Record<string, string>; favoriteMarkets?: string[] };
} {
	return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
}

async function openWindow(): Promise<MarketStoreModule> {
	const added = vi.spyOn(window, "addEventListener");
	vi.resetModules();
	const module = await import("@/stores/use-market-store");
	windowListeners.push(
		added.mock.calls
			.filter((call) => call[0] === "storage" || call[0] === "pageshow")
			.map((call) => ({ type: String(call[0]), listener: call[1] as (event: Event) => void })),
	);
	added.mockRestore();
	return module;
}

function deliver(target: number, event: Event) {
	for (const { type, listener } of windowListeners[target] ?? []) {
		if (type === event.type) listener(event);
	}
}

function deliverStorageEvent(target: number, oldValue: string | null, storageArea: Storage = window.localStorage) {
	deliver(
		target,
		new StorageEvent("storage", { key: KEY, oldValue, newValue: window.localStorage.getItem(KEY), storageArea }),
	);
}

function readHook<T>(hook: () => T): T {
	let value: T | undefined;
	function Probe() {
		value = hook();
		return null;
	}
	const container = document.createElement("div");
	const root = createRoot(container);
	act(() => root.render(createElement(Probe)));
	act(() => root.unmount());
	return value as T;
}

function holdPreferenceLocks() {
	const queue: Array<() => void> = [];
	const request = vi.fn((_name: string, ...rest: unknown[]) => {
		const callback = rest.at(-1) as () => unknown;
		return new Promise((resolve, reject) => {
			queue.push(() => {
				try {
					resolve(callback());
				} catch (error) {
					reject(error);
				}
			});
		});
	});
	vi.stubGlobal("navigator", Object.create(window.navigator, { locks: { value: { request } } }));
	return {
		request,
		pending: () => queue.length,
		releaseNext: () => queue.shift()?.(),
		releaseAll() {
			while (queue.length > 0) queue.shift()?.();
		},
	};
}

function runBetweenReadAndWrite(operation: () => void) {
	const write = Storage.prototype.setItem;
	let ran = false;
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
		if (key === KEY && !ran) {
			ran = true;
			operation();
		}
		write.call(this, key, value);
	});
	return () => ran;
}

describe("market preferences across windows", () => {
	let tabA: MarketStoreModule;
	let tabB: MarketStoreModule;
	let tabAActions: Actions;
	let tabBActions: Actions;

	beforeEach(async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		window.localStorage.clear();
		windowListeners.length = 0;
		window.localStorage.setItem(
			KEY,
			JSON.stringify({
				state: {
					selectedMarkets: { all: "BTC", perp: "BTC", spot: "PURR/USDC", "builders-perp": "xyz:SILVER" },
					favoriteMarkets: ["BTC", "ETH"],
				},
				version: 3,
			}),
		);
		tabA = await openWindow();
		tabB = await openWindow();
		expect(windowListeners[1]?.length).toBeGreaterThan(0);
		tabAActions = readHook(tabA.useMarketActions);
		tabBActions = readHook(tabB.useMarketActions);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		window.localStorage.clear();
		windowListeners.length = 0;
		vi.resetModules();
	});

	it.each([
		{ label: "keeps a favorite another window adds", other: "HYPE", expected: ["BTC", "ETH", "SOL", "HYPE"] },
		{ label: "does not revive a favorite another window removes", other: "ETH", expected: ["BTC", "SOL"] },
	])("$label between this window's read and write", ({ other, expected }) => {
		const locks = holdPreferenceLocks();
		const interleaved = runBetweenReadAndWrite(() => tabAActions.toggleFavoriteMarket(other));

		tabBActions.toggleFavoriteMarket("SOL");
		locks.releaseAll();

		expect(interleaved()).toBe(true);
		expect(readStored().state?.favoriteMarkets).toEqual(expected);
		deliverStorageEvent(0, null);
		deliverStorageEvent(1, null);
		expect(readHook(tabA.useFavoriteMarkets)).toEqual(expected);
		expect(readHook(tabB.useFavoriteMarkets)).toEqual(expected);
	});

	it("shows a click at once and keeps it through another window's update while the write waits", () => {
		const locks = holdPreferenceLocks();
		tabBActions.toggleFavoriteMarket("SOL");
		tabBActions.toggleFavoriteMarket("ETH");

		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "SOL"]);
		expect(readStored().state?.favoriteMarkets).toEqual(["BTC", "ETH"]);

		const stored = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
		window.localStorage.setItem(
			KEY,
			JSON.stringify({ ...stored, state: { ...stored.state, favoriteMarkets: ["BTC", "ETH", "HYPE"] } }),
		);
		deliverStorageEvent(1, null);
		deliver(1, new PageTransitionEvent("pageshow", { persisted: true }));
		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "HYPE", "SOL"]);

		locks.releaseNext();
		expect(readStored().state?.favoriteMarkets).toEqual(["BTC", "ETH", "HYPE", "SOL"]);
		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "HYPE", "SOL"]);

		locks.releaseNext();
		expect(readStored().state?.favoriteMarkets).toEqual(["BTC", "HYPE", "SOL"]);
		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "HYPE", "SOL"]);
	});

	it("stores what each window clicked when both click the same favorite before either write", () => {
		const locks = holdPreferenceLocks();
		tabAActions.toggleFavoriteMarket("SOL");
		tabBActions.toggleFavoriteMarket("SOL");
		tabAActions.toggleFavoriteMarket("ETH");
		tabBActions.toggleFavoriteMarket("ETH");
		locks.releaseAll();

		expect(readStored().state?.favoriteMarkets).toEqual(["BTC", "SOL"]);
	});

	it("keeps each window's selected market when selections wait for the lock", () => {
		const locks = holdPreferenceLocks();
		tabAActions.setSelectedMarket("perp", "SOL");
		tabBActions.setSelectedMarket("spot", "HYPE/USDC");

		expect(tabA.getStoredSelectedMarket("perp")).toBe("SOL");
		expect(readStored().state?.selectedMarkets?.perp).toBe("BTC");

		locks.releaseAll();
		deliverStorageEvent(0, null);
		deliverStorageEvent(1, null);

		expect(readStored().state?.selectedMarkets).toMatchObject({ perp: "SOL", spot: "HYPE/USDC" });
		expect(tabA.getStoredSelectedMarket("spot")).toBe("PURR/USDC");
		expect(tabB.getStoredSelectedMarket("perp")).toBe("BTC");
	});

	it("writes without the lock when the lock request fails before it runs", async () => {
		const request = vi.fn(() => Promise.reject(new DOMException("denied", "SecurityError")));
		vi.stubGlobal("navigator", Object.create(window.navigator, { locks: { value: { request } } }));

		tabBActions.toggleFavoriteMarket("SOL");
		await vi.waitFor(() => expect(readStored().state?.favoriteMarkets).toEqual(["BTC", "ETH", "SOL"]));
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("keeps a favorite added in another window when this window selects a market", () => {
		const before = window.localStorage.getItem(KEY);
		tabAActions.toggleFavoriteMarket("SOL");
		deliverStorageEvent(1, before);

		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "ETH", "SOL"]);

		tabBActions.setSelectedMarket("perp", "ETH");

		expect(readStored().state?.favoriteMarkets).toEqual(["BTC", "ETH", "SOL"]);
		expect(readStored().state?.selectedMarkets?.perp).toBe("ETH");
	});

	it("does not drop another window's favorite when this window writes before the storage event arrives", () => {
		tabAActions.toggleFavoriteMarket("SOL");
		tabBActions.setSelectedMarket("perp", "ETH");

		expect(readStored().state?.favoriteMarkets).toEqual(["BTC", "ETH", "SOL"]);
		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "ETH", "SOL"]);
	});

	it("merges favorites toggled in two windows", () => {
		tabAActions.toggleFavoriteMarket("SOL");
		tabBActions.toggleFavoriteMarket("ETH");
		tabBActions.toggleFavoriteMarket("HYPE");

		expect(readStored().state?.favoriteMarkets).toEqual(["BTC", "SOL", "HYPE"]);
		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "SOL", "HYPE"]);

		tabAActions.toggleFavoriteMarket("BTC");

		expect(readStored().state?.favoriteMarkets).toEqual(["SOL", "HYPE"]);
		expect(readHook(tabA.useFavoriteMarkets)).toEqual(["SOL", "HYPE"]);
	});

	it("keeps each window's selected market while preserving the other window's stored choice", () => {
		const before = window.localStorage.getItem(KEY);
		tabAActions.setSelectedMarket("perp", "SOL");
		deliverStorageEvent(1, before);

		expect(tabB.getStoredSelectedMarket("perp")).toBe("BTC");

		tabBActions.setSelectedMarket("spot", "HYPE/USDC");

		expect(readStored().state?.selectedMarkets).toMatchObject({ perp: "SOL", spot: "HYPE/USDC" });
		expect(tabB.getStoredSelectedMarket("perp")).toBe("BTC");
		expect(tabA.getStoredSelectedMarket("spot")).toBe("PURR/USDC");
	});

	it("writes this window's own selection over an older one stored by another window", () => {
		tabAActions.setSelectedMarket("all", "SOL");
		tabBActions.setSelectedMarket("all", "ETH");

		expect(readStored().state?.selectedMarkets?.all).toBe("ETH");
		expect(tabA.getTradeHomeMarketName()).toBe("SOL");
		expect(tabB.getTradeHomeMarketName()).toBe("ETH");
	});

	it.each([
		["unparseable text", "{not json"],
		["a schema violation", JSON.stringify({ state: { favoriteMarkets: ["../evil"] }, version: 3 })],
		["a newer version", JSON.stringify({ state: { favoriteMarkets: ["DOGE"] }, version: 99 })],
	])("ignores %s written by another window", (_label, value) => {
		const before = window.localStorage.getItem(KEY);
		window.localStorage.setItem(KEY, value);
		deliverStorageEvent(1, before);

		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "ETH"]);

		tabBActions.toggleFavoriteMarket("SOL");

		expect(readStored()).toEqual({
			state: {
				selectedMarkets: { all: "BTC", perp: "BTC", spot: "PURR/USDC", "builders-perp": "xyz:SILVER" },
				favoriteMarkets: ["BTC", "ETH", "SOL"],
			},
			version: 3,
		});
	});

	it("ignores a storage event from session storage", () => {
		tabAActions.toggleFavoriteMarket("SOL");
		deliverStorageEvent(1, null, window.sessionStorage);

		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "ETH"]);
	});

	it("catches up on favorites when the page returns from the back/forward cache", () => {
		tabAActions.toggleFavoriteMarket("SOL");
		deliver(1, new PageTransitionEvent("pageshow", { persisted: false }));

		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "ETH"]);

		deliver(1, new PageTransitionEvent("pageshow", { persisted: true }));

		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "ETH", "SOL"]);
	});

	it("does not write back when it only applies another window's favorites", () => {
		const setItem = vi.spyOn(Storage.prototype, "setItem");
		const before = window.localStorage.getItem(KEY);
		tabAActions.toggleFavoriteMarket("SOL");
		setItem.mockClear();
		deliverStorageEvent(1, before);

		expect(readHook(tabB.useFavoriteMarkets)).toEqual(["BTC", "ETH", "SOL"]);
		expect(setItem).not.toHaveBeenCalled();
	});
});
