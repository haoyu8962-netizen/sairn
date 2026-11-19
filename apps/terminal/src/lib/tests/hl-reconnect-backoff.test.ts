import { getReconnectDelayMs } from "@sairn/hl-react/internal/websocket/reliability";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

describe("subscription reconnect backoff", () => {
	it("starts at 250ms, doubles, and caps the base delay at 5 seconds", () => {
		vi.spyOn(Math, "random").mockReturnValue(0);
		expect([0, 1, 2, 3, 4, 5, 6, 20].map(getReconnectDelayMs)).toEqual([
			250, 250, 500, 1_000, 2_000, 4_000, 5_000, 5_000,
		]);
	});

	it("adds positive jitter of up to 20 percent even after the base reaches its cap", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		expect(getReconnectDelayMs(1)).toBe(275);
		expect(getReconnectDelayMs(20)).toBe(5_500);
		vi.mocked(Math.random).mockReturnValue(0.999999);
		expect(getReconnectDelayMs(20)).toBe(6_000);
	});

	it("rounds fractional jitter to whole milliseconds", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.013);
		expect(getReconnectDelayMs(1)).toBe(251);
	});
});
