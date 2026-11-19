import {
	markFrameReceivedAt,
	receiveFrameNow,
	takeFrameReceivedAt,
} from "@sairn/hl-react/internal/websocket/frame-receipt";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());

describe("frame receipt capture", () => {
	it("captures both clocks at reception, keeping monotonic progress across wall-clock rollback", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100_000);
		const first = receiveFrameNow();
		expect(first).toEqual({ receivedAt: Date.now(), monotonicReceivedAt: performance.now() });
		vi.setSystemTime(1);
		vi.advanceTimersByTime(200);
		const next = receiveFrameNow();
		expect(next.receivedAt).toBe(201);
		expect(next.monotonicReceivedAt - first.monotonicReceivedAt).toBe(200);
		expect(first.receivedAt).toBe(100_000);
	});

	it("replayed frames keep their original receipt, consumed once without renewing freshness", () => {
		vi.useFakeTimers();
		const frame = {};
		const receipt = receiveFrameNow();
		markFrameReceivedAt(frame, receipt.receivedAt, receipt.monotonicReceivedAt);
		vi.advanceTimersByTime(60_000);
		expect(takeFrameReceivedAt(frame)).toEqual(receipt);
		expect(takeFrameReceivedAt(frame)).toBeUndefined();
	});
});
