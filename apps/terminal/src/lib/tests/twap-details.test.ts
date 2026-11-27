import { describe, expect, it } from "vitest";
import {
	buildTwapDurationDraft,
	buildTwapOrderDetails,
	formatTwapPriceInput,
	getTwapSuborderSize,
	getTwapTriggerDirection,
	parseTwapPriceInput,
	resolveSubmittedTwapPrice,
	resolveTwapDurationState,
	resolveTwapPriceInputs,
	resolveTwapPriceStates,
} from "@/domain/trade/twap-details";

describe("buildTwapOrderDetails", () => {
	it("omits details entirely when neither trigger nor stop price is set", () => {
		expect(buildTwapOrderDetails({ triggerPx: null, stopPx: null, markPx: "100" })).toBeUndefined();
	});

	it("activates above when the trigger sits above the current mark", () => {
		expect(buildTwapOrderDetails({ triggerPx: "105.5", stopPx: null, markPx: "100" })).toEqual({
			t: { p: "105.5", a: true },
			s: null,
		});
	});

	it("activates below when the trigger sits below the current mark", () => {
		expect(buildTwapOrderDetails({ triggerPx: "95", stopPx: null, markPx: 100 })).toEqual({
			t: { p: "95", a: false },
			s: null,
		});
	});

	it("keeps a stop-only request with a null trigger", () => {
		expect(buildTwapOrderDetails({ triggerPx: null, stopPx: "110", markPx: "100" })).toEqual({
			t: null,
			s: "110",
		});
	});

	it("passes trigger and stop prices through as the exact strings it was given", () => {
		expect(buildTwapOrderDetails({ triggerPx: "0.012345", stopPx: "0.0125", markPx: "0.0121" })).toEqual({
			t: { p: "0.012345", a: true },
			s: "0.0125",
		});
	});

	it("refuses a trigger that equals the mark instead of guessing an activation direction", () => {
		expect(() => buildTwapOrderDetails({ triggerPx: "100", stopPx: null, markPx: "100" })).toThrow(
			"Trigger price is not valid against the live mark price",
		);
	});

	it("refuses a trigger without a live mark price", () => {
		expect(() => buildTwapOrderDetails({ triggerPx: "105", stopPx: null, markPx: 0 })).toThrow(
			"Trigger price is not valid against the live mark price",
		);
		expect(() => buildTwapOrderDetails({ triggerPx: "105", stopPx: null, markPx: null })).toThrow(
			"Trigger price is not valid against the live mark price",
		);
	});

	it("keeps the payload direction identical to the direction derived from the tick-rounded trigger", () => {
		const format = { assetId: 0, szDecimals: 5 };
		const roundedOntoMark = formatTwapPriceInput("117312.4", format);
		expect(roundedOntoMark).toBe("117312");
		expect(getTwapTriggerDirection(roundedOntoMark, "117312")).toBeNull();
		expect(() => buildTwapOrderDetails({ triggerPx: roundedOntoMark, stopPx: null, markPx: "117312" })).toThrow();

		const roundedAbove = formatTwapPriceInput("117312.6", format);
		expect(roundedAbove).toBe("117313");
		expect(getTwapTriggerDirection(roundedAbove, "117312")).toBe("above");
		expect(buildTwapOrderDetails({ triggerPx: roundedAbove, stopPx: null, markPx: "117312" })).toEqual({
			t: { p: "117313", a: true },
			s: null,
		});
	});
});

describe("formatTwapPriceInput", () => {
	it("returns null for empty or unparsable input", () => {
		expect(formatTwapPriceInput("", { assetId: 0, szDecimals: 3 })).toBeNull();
		expect(formatTwapPriceInput("   ", { assetId: 0, szDecimals: 3 })).toBeNull();
		expect(formatTwapPriceInput("abc", { assetId: 0, szDecimals: 3 })).toBeNull();
	});

	it("collapses non-positive input to zero so validation can flag it", () => {
		expect(formatTwapPriceInput("0", { assetId: 0, szDecimals: 3 })).toBe("0");
		expect(formatTwapPriceInput("-1", { assetId: 0, szDecimals: 3 })).toBe("0");
	});

	it("rounds to the market tick using perp and spot decimal rules", () => {
		expect(formatTwapPriceInput("117312.4", { assetId: 0, szDecimals: 5 })).toBe("117312");
		expect(formatTwapPriceInput("1.234567", { assetId: 0, szDecimals: 2 })).toBe("1.2346");
		expect(formatTwapPriceInput("0.0123456789", { assetId: 10_000, szDecimals: 0 })).toBe("0.012346");
		expect(formatTwapPriceInput("105.5", { assetId: undefined, szDecimals: 0 })).toBe("105.5");
	});
});

describe("getTwapTriggerDirection", () => {
	it("returns above or below relative to the mark", () => {
		expect(getTwapTriggerDirection("101", "100")).toBe("above");
		expect(getTwapTriggerDirection("99.99", 100)).toBe("below");
	});

	it("returns null without a positive trigger, a live mark, or a real gap between them", () => {
		expect(getTwapTriggerDirection("100", "100")).toBeNull();
		expect(getTwapTriggerDirection("", "100")).toBeNull();
		expect(getTwapTriggerDirection("0", "100")).toBeNull();
		expect(getTwapTriggerDirection("abc", "100")).toBeNull();
		expect(getTwapTriggerDirection("101", 0)).toBeNull();
		expect(getTwapTriggerDirection("101", null)).toBeNull();
	});
});

describe("resolveTwapPriceInputs", () => {
	it("excludes both configured and invalid draft prices while advanced settings are off", () => {
		const format = { assetId: 0, szDecimals: 5 };
		for (const [trigger, stop] of [
			["105", "110"],
			["100", "0"],
			["abc", "-5"],
		]) {
			expect(resolveTwapPriceInputs(false, trigger, stop, format)).toEqual({ triggerPx: null, stopPx: null });
		}
	});
	it("applies existing precision and empty-field rules when enabled", () => {
		const format = { assetId: 0, szDecimals: 5 };
		expect(resolveTwapPriceInputs(true, "117312.6", "118000.1", format)).toEqual({
			triggerPx: "117313",
			stopPx: "118000",
		});
		expect(resolveTwapPriceInputs(true, "", "118000.1", format)).toEqual({ triggerPx: null, stopPx: "118000" });
		expect(resolveTwapPriceInputs(true, "0", "", format)).toEqual({ triggerPx: "0", stopPx: null });
	});
});

describe("getTwapSuborderSize", () => {
	it("splits the size over one suborder per 30 seconds of runtime plus the first", () => {
		expect(getTwapSuborderSize("61", 30, 100)?.toString()).toBe("1");
	});

	it("raises each suborder to the $10 minimum at the reference price and caps it at the whole order", () => {
		expect(getTwapSuborderSize("3", 30, 100)?.toString()).toBe("0.1");
		expect(getTwapSuborderSize("0.05", 30, 100)?.toString()).toBe("0.05");
	});

	it("is null until a size and runtime are entered", () => {
		expect(getTwapSuborderSize("", 30, 100)).toBeNull();
		expect(getTwapSuborderSize("1", null, 100)).toBeNull();
		expect(getTwapSuborderSize("1", 0, 100)).toBeNull();
	});
});

describe("parseTwapPriceInput and resolveTwapPriceStates", () => {
	const format = { assetId: 0, szDecimals: 5 };

	it("separates empty, valid, and non-empty invalid TWAP price inputs", () => {
		expect(parseTwapPriceInput("", format)).toEqual({ status: "empty", price: null });
		expect(parseTwapPriceInput("   ", format)).toEqual({ status: "empty", price: null });
		expect(parseTwapPriceInput(".", format)).toEqual({ status: "invalid", price: null });
		expect(parseTwapPriceInput("-", format)).toEqual({ status: "invalid", price: null });
		expect(parseTwapPriceInput("-.", format)).toEqual({ status: "invalid", price: null });
		expect(parseTwapPriceInput("0", format)).toEqual({ status: "invalid", price: null });
		expect(parseTwapPriceInput("-5", format)).toEqual({ status: "invalid", price: null });
		expect(parseTwapPriceInput("117312.6", format)).toEqual({ status: "valid", price: "117313" });
		expect(parseTwapPriceInput(".5", { assetId: 0, szDecimals: 2 })).toEqual({ status: "valid", price: "0.5" });
	});

	it("returns empty states while advanced settings are disabled", () => {
		expect(resolveTwapPriceStates(false, ".", "0", format)).toEqual({
			trigger: { status: "empty", price: null },
			stop: { status: "empty", price: null },
		});
		expect(resolveTwapPriceStates(true, ".", "118000", format)).toEqual({
			trigger: { status: "invalid", price: null },
			stop: { status: "valid", price: "118000" },
		});
	});
});

describe("resolveSubmittedTwapPrice", () => {
	const format = { assetId: 0, szDecimals: 5 };

	it("accepts raw drafts that match the normalized payload price", () => {
		expect(resolveSubmittedTwapPrice("", null, format)).toEqual({ ok: true, price: null });
		expect(resolveSubmittedTwapPrice("   ", null, format)).toEqual({ ok: true, price: null });
		expect(resolveSubmittedTwapPrice("101", "101", format)).toEqual({ ok: true, price: "101" });
		expect(resolveSubmittedTwapPrice("101.00", "101", format)).toEqual({ ok: true, price: "101" });
		expect(resolveSubmittedTwapPrice("117312.6", "117313", format)).toEqual({ ok: true, price: "117313" });
	});

	it("fails closed when a raw draft is invalid or contradicts the payload price", () => {
		expect(resolveSubmittedTwapPrice(".", null, format)).toEqual({ ok: false });
		expect(resolveSubmittedTwapPrice(".", "101", format)).toEqual({ ok: false });
		expect(resolveSubmittedTwapPrice("0", "0", format)).toEqual({ ok: false });
		expect(resolveSubmittedTwapPrice("101", "102", format)).toEqual({ ok: false });
		expect(resolveSubmittedTwapPrice("110", "120", format)).toEqual({ ok: false });
		expect(resolveSubmittedTwapPrice("101", null, format)).toEqual({ ok: false });
		expect(resolveSubmittedTwapPrice("101", "0", format)).toEqual({ ok: false });
		expect(resolveSubmittedTwapPrice("117312.6", "117312.6", format)).toEqual({ ok: false });
		expect(resolveSubmittedTwapPrice("", "102", format)).toEqual({ ok: false });
		expect(resolveSubmittedTwapPrice("", "0", format)).toEqual({ ok: false });
	});

	it("preserves legacy payload-only semantics when the raw draft is omitted", () => {
		expect(resolveSubmittedTwapPrice(undefined, null, format)).toEqual({ ok: true, price: null });
		expect(resolveSubmittedTwapPrice(undefined, "", format)).toEqual({ ok: true, price: null });
		expect(resolveSubmittedTwapPrice(undefined, "0", format)).toEqual({ ok: true, price: null });
		expect(resolveSubmittedTwapPrice(undefined, "101", format)).toEqual({ ok: true, price: "101" });
		expect(resolveSubmittedTwapPrice(undefined, ".", format)).toEqual({ ok: false });
	});
});

describe("resolveTwapDurationState", () => {
	it("retains an active invalid draft and clears it when the stored minutes diverge", () => {
		const invalidDraft = buildTwapDurationDraft("0", "60");
		expect(invalidDraft).toEqual({ hours: "0", minutes: "60", expectedMinutes: 0 });
		expect(resolveTwapDurationState(0, invalidDraft)).toMatchObject({
			hoursValue: "0",
			minutesValue: "60",
			hoursInvalid: false,
			minutesInvalid: true,
			hasInlineError: true,
		});
		expect(resolveTwapDurationState(30, invalidDraft)).toMatchObject({
			hoursValue: "0",
			minutesValue: "30",
			hoursInvalid: false,
			minutesInvalid: false,
			hasInlineError: false,
		});
		expect(resolveTwapDurationState(0, null)).toMatchObject({
			hoursValue: "0",
			minutesValue: "0",
			hoursInvalid: false,
			minutesInvalid: false,
			hasInlineError: false,
		});
	});
});
