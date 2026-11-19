// @vitest-environment jsdom

import { createCrossTabNonceManager } from "@sairn/hl-react/internal/exchange/cross-tab-nonce-manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SIGNER = "0x1111111111111111111111111111111111111111";
const NOW = 1_800_000_000_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;
const STORAGE_KEY = `hyperliquid_exchange_nonce_Mainnet_${SIGNER}`;

function installLockManager() {
	const queues = new Map<string, { writer: Promise<void>; readers: Promise<void>[] }>();
	const manager = {
		async request<T>(
			name: string,
			optionsOrCallback: LockOptions | ((lock: Lock | null) => T | PromiseLike<T>),
			maybeCallback?: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
			if (!callback) throw new Error("Missing lock callback");

			const mode = typeof optionsOrCallback === "function" ? "exclusive" : (optionsOrCallback.mode ?? "exclusive");
			const queue = queues.get(name) ?? { writer: Promise.resolve(), readers: [] };
			queues.set(name, queue);
			const previous = mode === "shared" ? queue.writer : Promise.all([queue.writer, ...queue.readers]);
			let release = () => {};
			const current = new Promise<void>((resolve) => {
				release = resolve;
			});
			if (mode === "shared") queue.readers.push(current);
			else {
				queue.writer = current;
				queue.readers = [];
			}
			await previous;
			try {
				return await callback({ name, mode } as Lock);
			} finally {
				release();
			}
		},
	} as unknown as LockManager;

	Object.defineProperty(window.navigator, "locks", {
		configurable: true,
		value: manager,
	});
}

describe("cross-tab Hyperliquid nonce manager", () => {
	beforeEach(() => {
		window.localStorage.clear();
		installLockManager();
		vi.spyOn(Date, "now").mockReturnValue(NOW);
	});

	afterEach(() => {
		window.localStorage.clear();
		vi.restoreAllMocks();
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});
	});

	it("serializes concurrent allocations from independent manager instances", async () => {
		const request = vi.spyOn(navigator.locks, "request");
		const firstManager = createCrossTabNonceManager("Mainnet");
		const secondManager = createCrossTabNonceManager("Mainnet");

		await expect(Promise.all([firstManager(SIGNER), secondManager(SIGNER)])).resolves.toEqual([NOW, NOW + 1]);
		expect(request).toHaveBeenCalledTimes(2);
		for (const call of request.mock.calls) {
			expect(call).toEqual([
				`hyperliquid_exchange_nonce:Mainnet:${SIGNER}`,
				{ mode: "exclusive" },
				expect.any(Function),
			]);
		}
		expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
			version: 1,
			nonce: NOW + 1,
		});
	});

	it.each([
		["unparseable JSON", "{not json"],
		["a non-numeric nonce", '{"version":1,"nonce":"not-a-number"}'],
		["a negative nonce", '{"version":1,"nonce":-5}'],
		["a fractional nonce", '{"version":1,"nonce":1.5}'],
		["an unsafe nonce", `{"version":1,"nonce":${Number.MAX_SAFE_INTEGER + 2}}`],
		["a missing nonce", '{"version":1}'],
		["a non-object record", "[1800000000000]"],
		["a null record", "null"],
	])("resets a corrupted record holding %s", async (_label, raw) => {
		window.localStorage.setItem(STORAGE_KEY, raw);

		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).resolves.toBe(NOW);
		expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({ version: 1, nonce: NOW });
	});

	it("never hands two managers the same nonce after resetting a corrupted record", async () => {
		window.localStorage.setItem(STORAGE_KEY, '{"version":1,"nonce":"not-a-number"}');

		await expect(
			Promise.all([createCrossTabNonceManager("Mainnet")(SIGNER), createCrossTabNonceManager("Mainnet")(SIGNER)]),
		).resolves.toEqual([NOW, NOW + 1]);
	});

	it("keeps the floor of a newer record version and writes its other fields back", async () => {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, nonce: NOW + 50, lane: "a" }));

		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).resolves.toBe(NOW + 51);
		expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
			version: 2,
			nonce: NOW + 51,
			lane: "a",
		});
	});

	it("fails closed without advancing a nonce outside the official future window", async () => {
		const persisted = JSON.stringify({ version: 1, nonce: NOW + ONE_DAY_MS });
		window.localStorage.setItem(STORAGE_KEY, persisted);

		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).rejects.toThrow(
			"The persisted Hyperliquid nonce is outside the allowed future window.",
		);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(persisted);
	});

	it.each([
		["no exchange time", () => undefined],
		["an unusable exchange time", () => Number.NaN],
		[
			"a failing exchange clock",
			() => {
				throw new Error("clock unavailable");
			},
		],
	])("keeps failing closed on a far-future record with %s", async (_label, readExchangeNow) => {
		const persisted = JSON.stringify({ version: 1, nonce: NOW + 2 * ONE_DAY_MS });
		window.localStorage.setItem(STORAGE_KEY, persisted);

		await expect(createCrossTabNonceManager("Mainnet", { readExchangeNow })(SIGNER)).rejects.toThrow(
			"The persisted Hyperliquid nonce is outside the allowed future window.",
		);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(persisted);
	});

	it.each([1, 400])("discards a record %i day(s) ahead once the exchange clock is back", async (days) => {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, nonce: NOW + days * ONE_DAY_MS }));
		const manager = createCrossTabNonceManager("Mainnet", { readExchangeNow: () => NOW });

		await expect(manager(SIGNER)).resolves.toBe(NOW);
		await expect(manager(SIGNER)).resolves.toBe(NOW + 1);
		expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({ version: 1, nonce: NOW + 1 });
	});

	it("keeps a future record after a device clock correction until an exchange sample is available", async () => {
		const fastDeviceTime = NOW + 3 * ONE_DAY_MS;
		vi.mocked(Date.now).mockReturnValue(fastDeviceTime);
		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).resolves.toBe(fastDeviceTime);
		const persisted = JSON.stringify({ version: 1, nonce: fastDeviceTime });
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(persisted);

		vi.mocked(Date.now).mockReturnValue(NOW);
		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).rejects.toThrow(
			"The persisted Hyperliquid nonce is outside the allowed future window.",
		);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(persisted);
		await expect(createCrossTabNonceManager("Mainnet", { readExchangeNow: () => NOW })(SIGNER)).resolves.toBe(NOW);
	});

	it("keeps counting from a record ahead of the clock that is still inside the exchange window", async () => {
		const ahead = NOW + 20 * 60 * 60 * 1_000;
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, nonce: ahead }));
		vi.mocked(Date.now).mockReturnValue(NOW + 3 * ONE_DAY_MS);

		await expect(createCrossTabNonceManager("Mainnet", { readExchangeNow: () => NOW })(SIGNER)).resolves.toBe(
			ahead + 1,
		);
		expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({ version: 1, nonce: ahead + 1 });
	});

	it.each([
		["behind", -60 * 60 * 1_000],
		["ahead", 60 * 60 * 1_000],
	])(
		"keeps nonces unique and increasing across a tab with an exchange sample and one %s without",
		async (_label, offset) => {
			vi.mocked(Date.now).mockReturnValue(NOW + offset);
			const withSample = createCrossTabNonceManager("Mainnet", { readExchangeNow: () => NOW });
			const withoutSample = createCrossTabNonceManager("Mainnet");

			const nonces = await Promise.all([
				withSample(SIGNER),
				withoutSample(SIGNER),
				withSample(SIGNER),
				withoutSample(SIGNER),
				withSample(SIGNER),
			]);

			for (let index = 1; index < nonces.length; index += 1) {
				expect(nonces[index]).toBeGreaterThan(nonces[index - 1] ?? Number.POSITIVE_INFINITY);
			}
			expect(nonces[0]).toBe(NOW);
			expect(nonces.at(-1)).toBeLessThan(NOW + ONE_DAY_MS);
		},
	);

	it("counts up one by one through a burst within the same exchange millisecond", async () => {
		vi.mocked(Date.now).mockReturnValue(NOW - 3 * ONE_DAY_MS);
		const manager = createCrossTabNonceManager("Mainnet", { readExchangeNow: () => NOW });

		await expect(Promise.all(Array.from({ length: 20 }, () => manager(SIGNER)))).resolves.toEqual(
			Array.from({ length: 20 }, (_, index) => NOW + index),
		);
	});

	it("measures the window from the exchange time when the device clock runs behind", async () => {
		const exchangeNow = NOW + 2 * 60 * 60 * 1_000;
		const persisted = NOW + ONE_DAY_MS + 60 * 60 * 1_000;
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, nonce: persisted }));

		await expect(createCrossTabNonceManager("Mainnet", { readExchangeNow: () => exchangeNow })(SIGNER)).resolves.toBe(
			persisted + 1,
		);
	});

	it.each([-3, 3])("uses the exchange time with an empty record and a device offset of %i days", async (offset) => {
		vi.mocked(Date.now).mockReturnValue(NOW + offset * ONE_DAY_MS);

		await expect(createCrossTabNonceManager("Mainnet", { readExchangeNow: () => NOW })(SIGNER)).resolves.toBe(NOW);
		expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({ version: 1, nonce: NOW });
	});

	it("does not advance an in-window record to the exclusive future boundary", async () => {
		const persisted = JSON.stringify({ version: 1, nonce: NOW + ONE_DAY_MS - 1 });
		window.localStorage.setItem(STORAGE_KEY, persisted);

		await expect(createCrossTabNonceManager("Mainnet", { readExchangeNow: () => NOW })(SIGNER)).rejects.toThrow(
			"The persisted Hyperliquid nonce is outside the allowed future window.",
		);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(persisted);
	});

	it("fails closed when the Web Locks API is unavailable", async () => {
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});

		await expect(createCrossTabNonceManager("Mainnet")(SIGNER)).rejects.toThrow(
			"Cross-tab Hyperliquid nonce coordination is unavailable.",
		);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
	});
});
