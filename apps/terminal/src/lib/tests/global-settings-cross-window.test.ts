/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";

type GlobalSettingsModule = typeof import("@/stores/use-global-settings-store");

const KEY = STORAGE_KEYS.GLOBAL_SETTINGS;
const windowListeners: Array<Array<(event: StorageEvent) => void>> = [];
const pageShowListeners: Array<Array<(event: PageTransitionEvent) => void>> = [];

function readStored(): { version?: number; state?: Record<string, unknown> } {
	return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
}

async function openWindow(): Promise<GlobalSettingsModule> {
	const added = vi.spyOn(window, "addEventListener");
	vi.resetModules();
	const module = await import("@/stores/use-global-settings-store");
	windowListeners.push(
		added.mock.calls.filter((call) => call[0] === "storage").map((call) => call[1] as (event: StorageEvent) => void),
	);
	pageShowListeners.push(
		added.mock.calls
			.filter((call) => call[0] === "pageshow")
			.map((call) => call[1] as (event: PageTransitionEvent) => void),
	);
	added.mockRestore();
	return module;
}

function deliverStorageEvent(
	target: number,
	oldValue: string | null,
	storageArea: Storage = window.localStorage,
	key: string = KEY,
) {
	const event = new StorageEvent("storage", {
		key,
		oldValue,
		newValue: window.localStorage.getItem(key),
		storageArea,
	});
	for (const listener of windowListeners[target] ?? []) listener(event);
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

type Actions = ReturnType<GlobalSettingsModule["useGlobalSettingsActions"]>;

describe("global settings across windows", () => {
	let tabA: GlobalSettingsModule;
	let tabB: GlobalSettingsModule;
	let tabAActions: Actions;
	let tabBActions: Actions;

	beforeEach(async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		window.localStorage.clear();
		windowListeners.length = 0;
		window.localStorage.setItem(
			KEY,
			JSON.stringify({
				state: {
					skipOrderConfirmation: true,
					transactionDelayProtection: false,
					marketOrderSlippagePercent: 5,
					positionsActiveTab: "positions",
					theme: "dark",
				},
				version: 4,
			}),
		);
		tabA = await openWindow();
		tabB = await openWindow();
		expect(windowListeners[1]?.length).toBeGreaterThan(0);
		tabAActions = readHook(tabA.useGlobalSettingsActions);
		tabBActions = readHook(tabB.useGlobalSettingsActions);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		window.localStorage.clear();
		for (const listener of windowListeners.flat()) window.removeEventListener("storage", listener);
		for (const listener of pageShowListeners.flat()) window.removeEventListener("pageshow", listener);
		windowListeners.length = 0;
		pageShowListeners.length = 0;
		vi.resetModules();
	});

	function tightenInTabA() {
		const before = window.localStorage.getItem(KEY);
		tabAActions.setSkipOrderConfirmation(false);
		tabAActions.setTransactionDelayProtection(true);
		tabAActions.setMarketOrderSlippagePercent(1);
		return before;
	}

	it("keeps another window's tightened protections when this window changes an unrelated setting", () => {
		const before = tightenInTabA();
		deliverStorageEvent(1, before);

		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(tabB.getTransactionDelayProtection()).toBe(true);

		tabBActions.setPositionsActiveTab("openOrders");

		expect(readStored().state).toMatchObject({
			skipOrderConfirmation: false,
			transactionDelayProtection: true,
			marketOrderSlippagePercent: 1,
			positionsActiveTab: "openOrders",
		});
		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(tabB.getTransactionDelayProtection()).toBe(true);
	});

	it("does not restore older values when the storage event has not arrived before this window writes", () => {
		tightenInTabA();

		expect(tabB.getSkipOrderConfirmation()).toBe(true);

		tabBActions.setPositionsActiveTab("openOrders");

		expect(readStored().state).toMatchObject({
			skipOrderConfirmation: false,
			transactionDelayProtection: true,
			marketOrderSlippagePercent: 1,
			positionsActiveTab: "openOrders",
		});
		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(tabB.getTransactionDelayProtection()).toBe(true);
	});

	it("keeps this window's own change when both windows changed different fields", () => {
		tightenInTabA();
		tabBActions.setHideSmallBalances(false);

		expect(readStored().state).toMatchObject({
			hideSmallBalances: false,
			skipOrderConfirmation: false,
			transactionDelayProtection: true,
		});

		tabAActions.setShowChartScanlines(true);

		expect(readStored().state).toMatchObject({
			hideSmallBalances: false,
			showChartScanlines: true,
			skipOrderConfirmation: false,
		});
	});

	it("keeps each window's visible tab while preserving the other window's stored tab", () => {
		const before = window.localStorage.getItem(KEY);
		tabAActions.setPositionsActiveTab("openOrders");
		deliverStorageEvent(1, before);

		expect(tabB.getPositionsActiveTab()).toBe("positions");

		tabBActions.setHideSmallBalances(false);

		expect(readStored().state).toMatchObject({ positionsActiveTab: "openOrders", hideSmallBalances: false });
		expect(tabB.getPositionsActiveTab()).toBe("positions");
	});

	it("follows a theme change made in another window on the document", () => {
		const before = window.localStorage.getItem(KEY);
		tabAActions.setTheme("light");
		document.documentElement.classList.remove("light");
		document.documentElement.classList.add("dark");
		deliverStorageEvent(1, before);

		expect(readHook(tabB.useTheme)).toBe("light");
		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it.each([
		["unparseable text", "{not json"],
		["a schema violation", JSON.stringify({ state: { skipOrderConfirmation: "yes" }, version: 4 })],
	])("ignores %s written by another window", (_label, value) => {
		tightenInTabA();
		deliverStorageEvent(1, null);
		const before = window.localStorage.getItem(KEY);
		window.localStorage.setItem(KEY, value);
		deliverStorageEvent(1, before);

		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(tabB.getTransactionDelayProtection()).toBe(true);
		expect(readHook(tabB.useMarketOrderSlippagePercent)).toBe(1);

		tabBActions.setPositionsActiveTab("openOrders");

		expect(readStored().state).toMatchObject({
			skipOrderConfirmation: false,
			transactionDelayProtection: true,
			marketOrderSlippagePercent: 1,
		});
		expect(tabB.getSkipOrderConfirmation()).toBe(false);
	});

	it("ignores a storage event from session storage under the same key", () => {
		const before = tightenInTabA();
		deliverStorageEvent(1, before, window.sessionStorage);

		expect(tabB.getSkipOrderConfirmation()).toBe(true);
		expect(tabB.getTransactionDelayProtection()).toBe(false);

		deliverStorageEvent(1, before);

		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(tabB.getTransactionDelayProtection()).toBe(true);
	});

	function expectTightened(store: GlobalSettingsModule) {
		expect.soft(store.getSkipOrderConfirmation()).toBe(false);
		expect.soft(store.getTransactionDelayProtection()).toBe(true);
		expect.soft(readHook(store.useMarketOrderSlippagePercent)).toBe(1);
	}

	function writeDuringNextSettingsRead(write: () => void): () => boolean {
		const getItem = Storage.prototype.getItem;
		let interleaved = false;
		const reads = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
			const value = getItem.call(this, key);
			if (key === KEY && !interleaved) {
				interleaved = true;
				write();
			}
			return value;
		});
		return () => {
			reads.mockRestore();
			return interleaved;
		};
	}

	it("keeps all three protections when an older release writes back its stale snapshot", async () => {
		const stale = readStored();
		tightenInTabA();
		const before = window.localStorage.getItem(KEY);
		window.localStorage.setItem(KEY, JSON.stringify({ ...stale, state: { ...stale.state, theme: "light" } }));
		deliverStorageEvent(0, before);

		expect.soft(readHook(tabA.useTheme)).toBe("light");
		expectTightened(tabA);
		expectTightened(await openWindow());
	});

	it("keeps a tightened slippage when an older partial record omits it", async () => {
		const before = tightenInTabA();
		window.localStorage.setItem(KEY, JSON.stringify({ state: { theme: "light" }, version: 3 }));
		deliverStorageEvent(0, before);

		expectTightened(tabA);
		expectTightened(await openWindow());
	});

	it("keeps a protection another window tightens between this window's settings read and write", async () => {
		const finish = writeDuringNextSettingsRead(() => tabBActions.setSkipOrderConfirmation(false));
		try {
			tabAActions.setTheme("light");
		} finally {
			expect(finish()).toBe(true);
		}
		deliverStorageEvent(1, null);

		expect.soft(tabB.getSkipOrderConfirmation()).toBe(false);
		const reopened = await openWindow();
		expect.soft(reopened.getSkipOrderConfirmation()).toBe(false);
		expect.soft(readHook(reopened.useTheme)).toBe("light");
	});

	it("leaves a newer release's record intact when this window changes settings afterwards", () => {
		const future = JSON.stringify({
			state: { theme: "dark", skipOrderConfirmation: true, transactionDelayProtection: false },
			version: 5,
		});
		window.localStorage.setItem(KEY, future);
		deliverStorageEvent(0, null);
		tabAActions.setTheme("light");
		tabAActions.setSkipOrderConfirmation(false);

		expect.soft(readHook(tabA.useTheme)).toBe("light");
		expect.soft(tabA.getSkipOrderConfirmation()).toBe(false);
		expect(window.localStorage.getItem(KEY)).toBe(future);
	});

	it("loosens an open window only through its own action, and a new window starts from the latest choice", async () => {
		tightenInTabA();
		deliverStorageEvent(1, null, window.localStorage, STORAGE_KEYS.MARKET_ORDER_SLIPPAGE);
		expectTightened(tabB);

		tabAActions.setSkipOrderConfirmation(true);
		tabAActions.setTransactionDelayProtection(false);
		tabAActions.setMarketOrderSlippagePercent(3);
		deliverStorageEvent(1, null, window.localStorage, STORAGE_KEYS.SKIP_ORDER_CONFIRMATION);
		deliverStorageEvent(1, null);
		tabBActions.setTheme("light");
		expectTightened(tabB);

		const reopened = await openWindow();
		expect.soft(reopened.getSkipOrderConfirmation()).toBe(true);
		expect.soft(reopened.getTransactionDelayProtection()).toBe(false);
		expect.soft(readHook(reopened.useMarketOrderSlippagePercent)).toBe(3);

		tabBActions.setSkipOrderConfirmation(true);
		expect(tabBActions.setMarketOrderSlippagePercent(4)).toBe(4);
		expect.soft(tabB.getSkipOrderConfirmation()).toBe(true);
		expect.soft(readHook(tabB.useMarketOrderSlippagePercent)).toBe(4);
	});

	it("follows another window's tightening when restored from the back/forward cache", () => {
		tightenInTabA();
		for (const listener of pageShowListeners[1] ?? [])
			listener(new PageTransitionEvent("pageshow", { persisted: true }));

		expectTightened(tabB);
	});

	it("never offers an older release a looser record than either release stored", () => {
		tightenInTabA();
		tabAActions.setSkipOrderConfirmation(true);
		tabAActions.setMarketOrderSlippagePercent(3);
		tabAActions.setTheme("light");

		expect(readStored()).toMatchObject({
			version: 4,
			state: {
				theme: "light",
				skipOrderConfirmation: false,
				transactionDelayProtection: true,
				marketOrderSlippagePercent: 1,
			},
		});
	});

	it("keeps both of two explicit changes to different protections made in two windows at once", async () => {
		const setItem = Storage.prototype.setItem;
		let interleaved = false;
		const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
			this: Storage,
			key: string,
			value: string,
		) {
			if (key === STORAGE_KEYS.MARKET_ORDER_SLIPPAGE && !interleaved) {
				interleaved = true;
				tabBActions.setSkipOrderConfirmation(false);
			}
			setItem.call(this, key, value);
		});
		try {
			tabAActions.setMarketOrderSlippagePercent(0.5);
		} finally {
			writes.mockRestore();
		}
		expect(interleaved).toBe(true);

		const reopened = await openWindow();
		expect.soft(reopened.getSkipOrderConfirmation()).toBe(false);
		expect.soft(readHook(reopened.useMarketOrderSlippagePercent)).toBe(0.5);
	});

	it("treats an unreadable protection key as the strictest value", async () => {
		window.localStorage.setItem(STORAGE_KEYS.SKIP_ORDER_CONFIRMATION, "yes");
		window.localStorage.setItem(STORAGE_KEYS.TRANSACTION_DELAY_PROTECTION, "{");
		window.localStorage.setItem(STORAGE_KEYS.MARKET_ORDER_SLIPPAGE, '"5"');
		const reopened = await openWindow();

		expect.soft(reopened.getSkipOrderConfirmation()).toBe(false);
		expect.soft(reopened.getTransactionDelayProtection()).toBe(true);
		expect.soft(readHook(reopened.useMarketOrderSlippagePercent)).toBe(0.1);
	});

	it("keeps explicit protection changes while a newer release owns the settings record", async () => {
		const future = JSON.stringify({ state: { theme: "light" }, version: 5 });
		window.localStorage.setItem(KEY, future);
		tabAActions.setTransactionDelayProtection(true);
		tabAActions.setMarketOrderSlippagePercent(0.5);

		const reopened = await openWindow();
		expect.soft(reopened.getTransactionDelayProtection()).toBe(true);
		expect.soft(readHook(reopened.useMarketOrderSlippagePercent)).toBe(0.5);
		expect.soft(readHook(reopened.useTheme)).toBe("light");
		expect(window.localStorage.getItem(KEY)).toBe(future);
	});

	it("does not write back when it only applies another window's settings", () => {
		const setItem = vi.spyOn(Storage.prototype, "setItem");
		const before = window.localStorage.getItem(KEY);
		tabAActions.setSkipOrderConfirmation(false);
		setItem.mockClear();
		deliverStorageEvent(1, before);

		expect(tabB.getSkipOrderConfirmation()).toBe(false);
		expect(setItem).not.toHaveBeenCalled();
	});
});
