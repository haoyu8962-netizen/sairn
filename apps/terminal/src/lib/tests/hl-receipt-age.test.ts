import { getReceiptAgeMs } from "@sairn/hl-react/internal/websocket/staleness";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());

describe("receipt age used by freshness and signing deadlines", () => {
	it.each([
		[10_000, 1_000, 10_000, 1_000, 0],
		[10_000, 1_000, 8_000, 16_000, 15_000],
		[10_000, 1_000, 70_000, 1_010, 60_000],
		[10_000, 1_000, 10_500, 1_500, 500],
	])("uses the larger elapsed clock (%i, %i, %i, %i)", (wall, monotonic, now, monotonicNow, age) => {
		expect(getReceiptAgeMs(wall, monotonic, now, monotonicNow)).toBe(age);
	});

	it("defaults to live clocks and keeps aging after a wall-clock rollback", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100_000);
		const wall = Date.now();
		const monotonic = performance.now();
		vi.setSystemTime(1);
		vi.advanceTimersByTime(15_000);
		expect(getReceiptAgeMs(wall, monotonic)).toBe(15_000);
	});
});
