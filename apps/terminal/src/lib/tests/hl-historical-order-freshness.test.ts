import { shouldReplaceHistoricalOrder } from "@sairn/hl-react/registries/historical-orders";
import { describe, expect, it } from "vitest";

describe("historical order snapshot freshness", () => {
	it("a strictly newer timestamp wins regardless of status phase; an older one never wins", () => {
		expect(
			shouldReplaceHistoricalOrder({ status: "filled", statusTimestamp: 2 }, { status: "open", statusTimestamp: 3 }),
		).toBe(true);
		expect(
			shouldReplaceHistoricalOrder({ status: "open", statusTimestamp: 2 }, { status: "filled", statusTimestamp: 1 }),
		).toBe(false);
	});

	it.each([
		["open", "triggered"],
		["open", "filled"],
		["triggered", "canceled"],
		["triggered", "rejected"],
	] as const)("at equal timestamps %s advances to %s but never regresses", (earlier, later) => {
		expect(
			shouldReplaceHistoricalOrder({ status: earlier, statusTimestamp: 10 }, { status: later, statusTimestamp: 10 }),
		).toBe(true);
		expect(
			shouldReplaceHistoricalOrder({ status: later, statusTimestamp: 10 }, { status: earlier, statusTimestamp: 10 }),
		).toBe(false);
	});

	it("conflicting terminal statuses at the same timestamp do not overwrite each other", () => {
		expect(
			shouldReplaceHistoricalOrder(
				{ status: "filled", statusTimestamp: 10 },
				{ status: "canceled", statusTimestamp: 10 },
			),
		).toBe(false);
		expect(
			shouldReplaceHistoricalOrder(
				{ status: "canceled", statusTimestamp: 10 },
				{ status: "filled", statusTimestamp: 10 },
			),
		).toBe(false);
	});

	it.each(["open", "triggered", "filled", "canceled"] as const)(
		"the same status and timestamp may refresh the remaining order fields: %s",
		(status) =>
			expect(shouldReplaceHistoricalOrder({ status, statusTimestamp: 10 }, { status, statusTimestamp: 10 })).toBe(true),
	);
});
