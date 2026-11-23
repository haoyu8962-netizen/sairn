import { afterEach, describe, expect, it, vi } from "vitest";
import { createDepositSessionAttempt, type DepositSessionSnapshot } from "@/lib/hyperliquid/deposit-session-attempt";

const OWNER = "0x1111111111111111111111111111111111111111";
const OPENING = "deposit:7";

function onClick(overrides: Partial<DepositSessionSnapshot> = {}): DepositSessionSnapshot {
	return { opening: OPENING, resolving: false, clientKey: OWNER, wallet: OWNER, ...overrides };
}

const RESOLVING = onClick({ resolving: true, clientKey: "disconnected", wallet: undefined });

function createAttempt(shown: { opening: string | null } = { opening: OPENING }) {
	return createDepositSessionAttempt({
		clicked: onClick(),
		readOpening: () => shown.opening,
		isLiveSessionCurrent: () => true,
	});
}

describe("createDepositSessionAttempt", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("reports the interruptions of the moment the wait was decided, not of the moment its caller resumes", async () => {
		const attempt = createAttempt();
		attempt.observe(RESOLVING);
		const wait = attempt.check.waitUntilSettled(30_000);

		attempt.observe(onClick());
		const decidedAt = attempt.check.readInterruptions();
		attempt.observe(RESOLVING);
		attempt.observe(onClick());

		await expect(wait).resolves.toEqual({ settlement: "same", interruptions: decidedAt });
		expect(attempt.check.readInterruptions()).toBeGreaterThan(decidedAt);
	});

	it("counts every commit away from the click's identity and none on it", () => {
		const attempt = createAttempt();
		attempt.observe(onClick());
		expect(attempt.check.readInterruptions()).toBe(0);
		attempt.observe(RESOLVING);
		attempt.observe(onClick({ clientKey: "disconnected", wallet: undefined }));
		expect(attempt.check.readInterruptions()).toBe(2);
		attempt.observe(onClick());
		expect(attempt.check.readInterruptions()).toBe(2);
		expect(attempt.check.isVoided()).toBe(false);
	});

	it("is void at once when the opening shown is no longer the click's, before any commit", async () => {
		const shown = { opening: OPENING as string | null };
		const attempt = createAttempt(shown);
		expect(attempt.check.isCurrent()).toBe(true);

		shown.opening = "deposit:8";
		expect(attempt.check.isVoided()).toBe(true);
		expect(attempt.check.isCurrent()).toBe(false);
		shown.opening = OPENING;
		expect(attempt.check.isVoided()).toBe(true);
		await expect(attempt.check.waitUntilSettled(30_000)).resolves.toMatchObject({ settlement: "replaced" });
	});

	it("is void from the start when no modal was shown at the click", () => {
		const attempt = createDepositSessionAttempt({
			clicked: onClick({ opening: null }),
			readOpening: () => null,
			isLiveSessionCurrent: () => true,
		});
		expect(attempt.check.isVoided()).toBe(true);
		expect(attempt.check.isSettledOnSubmitted()).toBe(false);
	});

	it("does not accept a return to the click's account once its limit has passed, even before its timer fires", async () => {
		vi.useFakeTimers({ toFake: ["performance"] });
		const attempt = createAttempt();
		attempt.observe(RESOLVING);
		const wait = attempt.check.waitUntilSettled(30_000);

		vi.advanceTimersByTime(30_000);
		attempt.observe(onClick());

		await expect(wait).resolves.toEqual({ settlement: "timeout", interruptions: 1 });
	});

	it("does not accept a return after a device sleep that only the wall clock counted", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const attempt = createAttempt();
		attempt.observe(RESOLVING);
		const wait = attempt.check.waitUntilSettled(30_000);

		vi.setSystemTime(Date.now() + 30_000);
		attempt.observe(onClick());

		await expect(wait).resolves.toEqual({ settlement: "timeout", interruptions: 1 });
	});

	it("still ends as replaced after its limit when the attempt was voided", async () => {
		vi.useFakeTimers({ toFake: ["performance"] });
		const attempt = createAttempt();
		attempt.observe(RESOLVING);
		const wait = attempt.check.waitUntilSettled(30_000);

		vi.advanceTimersByTime(30_000);
		attempt.observe(onClick({ clientKey: "0x3333333333333333333333333333333333333333" }));

		await expect(wait).resolves.toMatchObject({ settlement: "replaced" });
	});

	it("accepts a return to the click's account just before its limit", async () => {
		vi.useFakeTimers({ toFake: ["performance"] });
		const attempt = createAttempt();
		attempt.observe(RESOLVING);
		const wait = attempt.check.waitUntilSettled(30_000);

		vi.advanceTimersByTime(29_999);
		attempt.observe(onClick());

		await expect(wait).resolves.toEqual({ settlement: "same", interruptions: 1 });
	});

	it("times out with the interruptions it has counted when the session neither returns nor is replaced", async () => {
		vi.useFakeTimers();
		const attempt = createAttempt();
		attempt.observe(RESOLVING);
		const wait = attempt.check.waitUntilSettled(30_000);
		vi.advanceTimersByTime(30_000);
		await expect(wait).resolves.toEqual({ settlement: "timeout", interruptions: 1 });
	});
});
