/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/app";
import { marketOrderSlippagePercentToBpsString } from "@/stores/use-global-settings-store";

const GLOBAL_SETTINGS_VERSION = 4;

type GlobalSettingsModule = typeof import("@/stores/use-global-settings-store");

async function reopenStore(): Promise<GlobalSettingsModule> {
	vi.resetModules();
	return await import("@/stores/use-global-settings-store");
}

async function loadStore(persisted?: unknown): Promise<GlobalSettingsModule> {
	window.localStorage.clear();
	if (persisted !== undefined) {
		window.localStorage.setItem(STORAGE_KEYS.GLOBAL_SETTINGS, JSON.stringify(persisted));
	}
	return await reopenStore();
}

describe("global settings market-order slippage", () => {
	it.each([
		[0.1, "10"],
		[0.29, "29"],
		[0.57, "57"],
		[2.5, "250"],
		[5, "500"],
	])("converts %s percent to an exact basis-point string", (percent, expected) => {
		expect(marketOrderSlippagePercentToBpsString(percent)).toBe(expected);
	});
});

describe("global settings order-confirmation preference", () => {
	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		window.localStorage.clear();
		vi.resetModules();
	});

	it("keeps the order confirmation on by default", async () => {
		const store = await loadStore();

		expect(store.getSkipOrderConfirmation()).toBe(false);
	});

	it("starts with the safe defaults and leaves a newer release's record intact", async () => {
		const future = {
			state: { skipOrderConfirmation: true, transactionDelayProtection: false, marketOrderSlippagePercent: 5 },
			version: GLOBAL_SETTINGS_VERSION + 1,
		};
		const store = await loadStore(future);
		let slippage: number | undefined;
		function Probe() {
			slippage = store.useMarketOrderSlippagePercent();
			return null;
		}
		const probeRoot = createRoot(document.createElement("div"));
		act(() => probeRoot.render(createElement(Probe)));
		act(() => probeRoot.unmount());

		expect.soft(store.getSkipOrderConfirmation()).toBe(false);
		expect.soft(store.getTransactionDelayProtection()).toBe(true);
		expect.soft(slippage).toBe(2.5);
		expect(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS)).toBe(JSON.stringify(future));
	});

	it("restores a persisted opt-out", async () => {
		const store = await loadStore({
			state: { skipOrderConfirmation: true },
			version: GLOBAL_SETTINGS_VERSION,
		});

		expect(store.getSkipOrderConfirmation()).toBe(true);
	});

	it.each([["yes"], [1], [null]])("falls back to confirming when the persisted value is %p", async (value) => {
		const store = await loadStore({
			state: { skipOrderConfirmation: value },
			version: GLOBAL_SETTINGS_VERSION,
		});

		expect(store.getSkipOrderConfirmation()).toBe(false);
	});

	it("carries a version-3 payload through the version bump", async () => {
		const store = await loadStore({
			state: { skipOrderConfirmation: true, numberFormatLocale: "de-DE" },
			version: 3,
		});

		expect(store.getSkipOrderConfirmation()).toBe(true);
		expect(store.getNumberFormatLocale()).toBe("de-DE");
	});

	it("keeps a version-3 opt-out across later reloads and for an older release reading the record", async () => {
		await loadStore({ state: { skipOrderConfirmation: true }, version: 3 });

		expect((await reopenStore()).getSkipOrderConfirmation()).toBe(true);
		const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS) ?? "{}");
		expect(persisted.state?.skipOrderConfirmation).toBe(true);
	});
});

describe("global settings transaction delay protection", () => {
	let container: HTMLDivElement;
	let root: Root | undefined;

	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		container = document.createElement("div");
		document.body.append(container);
	});

	afterEach(() => {
		act(() => root?.unmount());
		root = undefined;
		container.remove();
		vi.restoreAllMocks();
		window.localStorage.clear();
		vi.resetModules();
	});

	function renderPreference(store: GlobalSettingsModule) {
		function Preference() {
			const enabled = store.useTransactionDelayProtection();
			const { setTransactionDelayProtection } = store.useGlobalSettingsActions();
			return createElement("button", {
				type: "button",
				role: "switch",
				"aria-checked": enabled,
				onClick: () => setTransactionDelayProtection(!enabled),
			});
		}
		root = createRoot(container);
		act(() => root?.render(createElement(Preference)));
		const toggle = container.querySelector("button");
		if (!toggle) throw new Error("Missing transaction delay protection toggle");
		return toggle;
	}

	it("keeps the protection on by default and for an unreadable stored value", async () => {
		expect((await loadStore()).getTransactionDelayProtection()).toBe(true);
		const store = await loadStore({
			state: { transactionDelayProtection: "off" },
			version: GLOBAL_SETTINGS_VERSION,
		});

		expect(store.getTransactionDelayProtection()).toBe(true);
	});

	it("persists a turned-off protection and restores it after a reload", async () => {
		const toggle = renderPreference(await loadStore());
		act(() => toggle.click());

		expect(window.localStorage.getItem(STORAGE_KEYS.TRANSACTION_DELAY_PROTECTION)).toBe("false");
		act(() => root?.unmount());
		root = undefined;
		expect((await reopenStore()).getTransactionDelayProtection()).toBe(false);
	});

	it("never shows an older release a looser protection than it last stored", async () => {
		const toggle = renderPreference(await loadStore());
		act(() => toggle.click());

		const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS) ?? "{}");
		expect(persisted).toMatchObject({ version: GLOBAL_SETTINGS_VERSION, state: { transactionDelayProtection: true } });
	});
});

describe("global settings order-book animations", () => {
	let container: HTMLDivElement;
	let root: Root | undefined;

	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		container = document.createElement("div");
		document.body.append(container);
	});

	afterEach(() => {
		act(() => root?.unmount());
		root = undefined;
		container.remove();
		vi.restoreAllMocks();
		window.localStorage.clear();
		vi.resetModules();
	});

	function renderPreference(store: GlobalSettingsModule) {
		function Preference() {
			const enabled = store.useAnimateOrderbook();
			const { setAnimateOrderbook } = store.useGlobalSettingsActions();
			return createElement("button", {
				type: "button",
				role: "switch",
				"aria-checked": enabled,
				onClick: () => setAnimateOrderbook(!enabled),
			});
		}
		root = createRoot(container);
		act(() => root?.render(createElement(Preference)));
		const toggle = container.querySelector("button");
		if (!toggle) throw new Error("Missing animation preference toggle");
		return toggle;
	}

	it("enables animations by default", async () => {
		const toggle = renderPreference(await loadStore());

		expect(toggle.getAttribute("aria-checked")).toBe("true");
	});

	it("restores a persisted disabled preference", async () => {
		const toggle = renderPreference(
			await loadStore({
				state: { animateOrderbook: false },
				version: GLOBAL_SETTINGS_VERSION,
			}),
		);

		expect(toggle.getAttribute("aria-checked")).toBe("false");
	});

	it.each([3, GLOBAL_SETTINGS_VERSION])(
		"defaults the missing field in version %s without resetting existing preferences",
		async (version) => {
			const store = await loadStore({ state: { numberFormatLocale: "de-DE", skipOrderConfirmation: true }, version });
			const toggle = renderPreference(store);

			expect(toggle.getAttribute("aria-checked")).toBe("true");
			expect(store.getNumberFormatLocale()).toBe("de-DE");
			expect(store.getSkipOrderConfirmation()).toBe(true);
		},
	);

	it.each(["false", 0, null])("falls back to enabled for invalid stored data %p", async (animateOrderbook) => {
		const toggle = renderPreference(
			await loadStore({
				state: { animateOrderbook },
				version: GLOBAL_SETTINGS_VERSION,
			}),
		);

		expect(toggle.getAttribute("aria-checked")).toBe("true");
		expect(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS)).toBeNull();
	});

	it("persists both changes made by the real setting action and restores disabled after reload", async () => {
		const toggle = renderPreference(await loadStore());
		act(() => toggle.click());

		expect(toggle.getAttribute("aria-checked")).toBe("false");
		let persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS) ?? "{}");
		expect(persisted.version).toBe(GLOBAL_SETTINGS_VERSION);
		expect(persisted.state.animateOrderbook).toBe(false);

		act(() => toggle.click());

		expect(toggle.getAttribute("aria-checked")).toBe("true");
		persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS) ?? "{}");
		expect(persisted.state.animateOrderbook).toBe(true);

		act(() => toggle.click());
		persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS) ?? "{}");
		act(() => root?.unmount());
		root = undefined;
		const restoredToggle = renderPreference(await loadStore(persisted));

		expect(restoredToggle.getAttribute("aria-checked")).toBe("false");
	});
});

describe("global settings with a damaged record on storage that refuses removal", () => {
	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		window.localStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		window.localStorage.clear();
		vi.resetModules();
	});

	function refuseRemoval() {
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
			throw new DOMException("read-only storage", "SecurityError");
		});
	}

	function readSlippage(store: GlobalSettingsModule): number {
		let value = Number.NaN;
		function Reader() {
			value = store.useMarketOrderSlippagePercent();
			return null;
		}
		const container = document.createElement("div");
		const reader = createRoot(container);
		act(() => reader.render(createElement(Reader)));
		act(() => reader.unmount());
		return value;
	}

	it.each([
		["unparseable", "{not json"],
		["invalid", JSON.stringify({ state: { theme: 7 }, version: GLOBAL_SETTINGS_VERSION })],
	])("still reads the protections' own keys when the %s record cannot be removed", async (_kind, record) => {
		window.localStorage.setItem(STORAGE_KEYS.GLOBAL_SETTINGS, record);
		window.localStorage.setItem(STORAGE_KEYS.TRANSACTION_DELAY_PROTECTION, "false");
		window.localStorage.setItem(STORAGE_KEYS.SKIP_ORDER_CONFIRMATION, "true");
		refuseRemoval();
		const store = await reopenStore();

		expect(store.getTransactionDelayProtection()).toBe(false);
		expect(store.getSkipOrderConfirmation()).toBe(true);
		expect(window.localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS)).toBe(record);
	});

	it("starts from the strictest protections when their keys are unreadable too", async () => {
		window.localStorage.setItem(STORAGE_KEYS.GLOBAL_SETTINGS, "{not json");
		window.localStorage.setItem(STORAGE_KEYS.MARKET_ORDER_SLIPPAGE, "5");
		refuseRemoval();
		const getItem = Storage.prototype.getItem;
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
			if (key === STORAGE_KEYS.MARKET_ORDER_SLIPPAGE) throw new DOMException("denied", "SecurityError");
			return getItem.call(this, key);
		});
		const store = await reopenStore();

		expect(readSlippage(store)).toBe(0.1);
	});
});
