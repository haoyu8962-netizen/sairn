import { createBatchedUpdater } from "@sairn/hl-react/internal/websocket/batch-updater";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("WebSocket frame batching in the timer fallback", () => {
	it("delivers all arrivals in order as one batch on the next frame", () => {
		const flush = vi.fn();
		const updater = createBatchedUpdater<number>(flush);
		updater.add(1);
		updater.add(2);
		vi.advanceTimersByTime(15);
		expect(flush).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(flush.mock.calls).toEqual([[[1, 2]]]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("an explicit flush delivers once and does not replay the batch on the scheduled frame", () => {
		const flush = vi.fn();
		const updater = createBatchedUpdater<string>(flush);
		updater.add("snapshot");
		updater.flush();
		updater.flush();
		vi.advanceTimersByTime(32);
		expect(flush.mock.calls).toEqual([[["snapshot"]]]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("destroy discards pending arrivals and cancels their delivery", () => {
		const flush = vi.fn();
		const updater = createBatchedUpdater<number>(flush);
		updater.add(1);
		updater.destroy();
		updater.flush();
		vi.advanceTimersByTime(32);
		expect(flush).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("arrivals during a delivery belong to a subsequent batch", () => {
		const batches: number[][] = [];
		const updater = createBatchedUpdater<number>((items) => {
			batches.push(items);
			if (items[0] === 1) updater.add(2);
		});
		updater.add(1);
		vi.advanceTimersByTime(16);
		expect(batches).toEqual([[1]]);
		vi.advanceTimersByTime(16);
		expect(batches).toEqual([[1], [2]]);
	});
});
