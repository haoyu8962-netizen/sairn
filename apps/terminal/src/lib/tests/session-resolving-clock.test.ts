import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	hasWalletSessionResolvingExpired,
	reportWalletSessionUnsettled,
	resetWalletSessionResolvingClock,
	subscribeWalletSessionResolvingExpiry,
	WALLET_SESSION_RESOLVING_MAX_MS,
} from "@/lib/wallet/session-resolving-clock";

describe("wallet session resolving clock", () => {
	const listener = vi.fn();
	let unsubscribe: () => void;

	beforeEach(() => {
		vi.useFakeTimers();
		resetWalletSessionResolvingClock();
		listener.mockClear();
		unsubscribe = subscribeWalletSessionResolvingExpiry(listener);
	});

	afterEach(() => {
		unsubscribe();
		resetWalletSessionResolvingClock();
		vi.useRealTimers();
	});

	it("expires a wait after the maximum time and tells its subscribers once", () => {
		reportWalletSessionUnsettled(true);
		vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS - 1);
		expect(hasWalletSessionResolvingExpired()).toBe(false);
		expect(listener).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(hasWalletSessionResolvingExpired()).toBe(true);
		expect(listener).toHaveBeenCalledOnce();
	});

	it("does not restart the wait when the same unsettled state is reported again", () => {
		reportWalletSessionUnsettled(true);
		vi.advanceTimersByTime(6_000);
		reportWalletSessionUnsettled(true);
		vi.advanceTimersByTime(4_000);
		expect(hasWalletSessionResolvingExpired()).toBe(true);
	});

	it("never expires a session that settled in time", () => {
		reportWalletSessionUnsettled(true);
		vi.advanceTimersByTime(3_000);
		reportWalletSessionUnsettled(false);
		vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS * 10);
		expect(hasWalletSessionResolvingExpired()).toBe(false);
		expect(listener).not.toHaveBeenCalled();
	});

	it("keeps an expired wait through a settled instant shorter than two seconds", () => {
		reportWalletSessionUnsettled(true);
		vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS);
		reportWalletSessionUnsettled(false);
		vi.advanceTimersByTime(1_999);
		reportWalletSessionUnsettled(true);
		expect(hasWalletSessionResolvingExpired()).toBe(true);

		vi.advanceTimersByTime(60_000);
		expect(hasWalletSessionResolvingExpired()).toBe(true);
	});

	it("opens a fresh wait once the session stayed settled for two seconds", () => {
		reportWalletSessionUnsettled(true);
		vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS);
		reportWalletSessionUnsettled(false);
		vi.advanceTimersByTime(2_000);
		expect(hasWalletSessionResolvingExpired()).toBe(false);

		reportWalletSessionUnsettled(true);
		vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS - 1);
		expect(hasWalletSessionResolvingExpired()).toBe(false);
		vi.advanceTimersByTime(1);
		expect(hasWalletSessionResolvingExpired()).toBe(true);
	});

	it("ignores a settled report when no wait is open", () => {
		reportWalletSessionUnsettled(false);
		vi.advanceTimersByTime(60_000);
		expect(hasWalletSessionResolvingExpired()).toBe(false);
		expect(listener).not.toHaveBeenCalled();
	});
});
