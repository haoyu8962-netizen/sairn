import Big from "big.js";
import { ORDER_MIN_NOTIONAL_USD, TWAP_MINUTES_MAX, TWAP_SUBORDER_INTERVAL_SECONDS } from "@/config/trade";
import { formatPriceForOrder } from "@/domain/trade/orders";
import { type Numeric, toBig, toNumber } from "@/lib/trade/numbers";

export type TwapTriggerDirection = "above" | "below";

export type TwapPriceInputState =
	| { status: "empty"; price: null }
	| { status: "valid"; price: string }
	| { status: "invalid"; price: null };

export type ResolvedSubmittedTwapPrice = { ok: true; price: string | null } | { ok: false };

export interface TwapDurationDraft {
	hours: string;
	minutes: string;
	expectedMinutes: number;
}

export interface TwapDurationState {
	hoursValue: string;
	minutesValue: string;
	hoursInvalid: boolean;
	minutesInvalid: boolean;
	minutesLocked: boolean;
	hasInlineError: boolean;
}

export const TWAP_HOURS_MAX = Math.floor(TWAP_MINUTES_MAX / 60);
export const TWAP_MINUTES_PER_INPUT_MAX = 59;

const TWAP_TRIGGER_PRICE_ERROR_IDS: ReadonlySet<string> = new Set([
	"twap-trigger-price-positive",
	"twap-trigger-price-tick",
	"twap-trigger-differs-from-mark",
]);

const TWAP_STOP_PRICE_ERROR_IDS: ReadonlySet<string> = new Set([
	"twap-stop-price-positive",
	"twap-stop-price-tick",
	"twap-stop-direction",
	"twap-stop-beyond-trigger",
]);

export interface TwapOrderDetails {
	t: { p: string; a: boolean } | null;
	s: string | null;
}

export interface TwapPriceFormat {
	assetId: number | undefined;
	szDecimals: number;
}

export class TwapOrderDetailsError extends Error {
	constructor() {
		super("Trigger price is not valid against the live mark price");
		this.name = "TwapOrderDetailsError";
	}
}

interface BuildTwapOrderDetailsInput {
	triggerPx: string | null;
	stopPx: string | null;
	markPx: Numeric;
}

export function formatTwapPriceInput(input: string, { assetId, szDecimals }: TwapPriceFormat): string | null {
	const raw = toBig(input);
	if (!raw) return null;
	return formatPriceForOrder(raw, assetId === undefined ? undefined : { assetId, szDecimals });
}

export function resolveTwapPriceInputs(
	advancedEnabled: boolean,
	triggerInput: string,
	stopInput: string,
	format: TwapPriceFormat,
) {
	return {
		triggerPx: advancedEnabled ? formatTwapPriceInput(triggerInput, format) : null,
		stopPx: advancedEnabled ? formatTwapPriceInput(stopInput, format) : null,
	};
}

export function parseTwapPriceInput(input: string, format: TwapPriceFormat): TwapPriceInputState {
	if (input.trim() === "") return { status: "empty", price: null };
	const formatted = formatTwapPriceInput(input, format);
	if (!formatted || !toBig(formatted)?.gt(0) || toNumber(formatted) === null) {
		return { status: "invalid", price: null };
	}
	return { status: "valid", price: formatted };
}

export function resolveTwapPriceStates(
	advancedEnabled: boolean,
	triggerInput: string,
	stopInput: string,
	format: TwapPriceFormat,
): { trigger: TwapPriceInputState; stop: TwapPriceInputState } {
	if (!advancedEnabled) {
		return {
			trigger: { status: "empty", price: null },
			stop: { status: "empty", price: null },
		};
	}
	return {
		trigger: parseTwapPriceInput(triggerInput, format),
		stop: parseTwapPriceInput(stopInput, format),
	};
}

export function resolveSubmittedTwapPrice(
	rawInput: string | undefined,
	payloadPx: string | null,
	format: TwapPriceFormat,
): ResolvedSubmittedTwapPrice {
	if (rawInput !== undefined) {
		const parsed = parseTwapPriceInput(rawInput, format);
		if (parsed.status === "invalid") return { ok: false };
		if (payloadPx !== parsed.price) return { ok: false };
		return { ok: true, price: parsed.price };
	}
	if (payloadPx === null || payloadPx.trim() === "") {
		return { ok: true, price: null };
	}
	const numeric = toBig(payloadPx);
	if (!numeric) return { ok: false };
	return { ok: true, price: numeric.gt(0) ? payloadPx : null };
}

export function getTwapPriceFieldErrorMessage(
	errors: readonly { id: string; message: string }[],
	field: "trigger" | "stop",
): string {
	const ids = field === "trigger" ? TWAP_TRIGGER_PRICE_ERROR_IDS : TWAP_STOP_PRICE_ERROR_IDS;
	return errors
		.filter((error) => ids.has(error.id))
		.map((error) => error.message)
		.join(" \u2022 ");
}

function parseTwapDurationPart(value: string): number | null {
	if (value === "") return 0;
	if (!/^\d+$/.test(value)) return null;
	return Number.parseInt(value, 10);
}

function isTwapDurationPartInvalid(parsed: number | null, max: number): boolean {
	return parsed === null || !Number.isSafeInteger(parsed) || parsed < 0 || parsed > max;
}

export function isTwapHoursAtMax(value: string): boolean {
	return parseTwapDurationPart(value) === TWAP_HOURS_MAX;
}

export function buildTwapDurationDraft(hours: string, minutes: string): TwapDurationDraft {
	const parsedHours = parseTwapDurationPart(hours);
	const parsedMinutes = parseTwapDurationPart(minutes);
	const hoursInvalid = isTwapDurationPartInvalid(parsedHours, TWAP_HOURS_MAX);
	const minutesInvalid = isTwapDurationPartInvalid(parsedMinutes, TWAP_MINUTES_PER_INPUT_MAX);
	const expectedMinutes =
		hoursInvalid || minutesInvalid || parsedHours === null || parsedMinutes === null
			? 0
			: parsedHours * 60 + parsedMinutes;
	return { hours, minutes, expectedMinutes };
}

export function resolveTwapDurationState(
	twapMinutesNum: number | null,
	draft: TwapDurationDraft | null | undefined,
): TwapDurationState {
	const totalMinutes = getTwapRuntimeMinutes(twapMinutesNum);
	const storeHours = Math.floor(totalMinutes / 60);
	const storeMinutes = totalMinutes - storeHours * 60;
	const activeDraft =
		draft != null && twapMinutesNum !== null && draft.expectedMinutes === twapMinutesNum ? draft : null;
	const hoursValue = activeDraft ? activeDraft.hours : String(storeHours);
	const minutesValue = activeDraft ? activeDraft.minutes : String(storeMinutes);
	const parsedHours = parseTwapDurationPart(hoursValue);
	const parsedMinutes = parseTwapDurationPart(minutesValue);
	const hoursInvalid = isTwapDurationPartInvalid(parsedHours, TWAP_HOURS_MAX);
	const minutesInvalid = isTwapDurationPartInvalid(parsedMinutes, TWAP_MINUTES_PER_INPUT_MAX);
	const minutesLocked = parsedHours === TWAP_HOURS_MAX;
	return {
		hoursValue,
		minutesValue,
		hoursInvalid,
		minutesInvalid,
		minutesLocked,
		hasInlineError: hoursInvalid || minutesInvalid,
	};
}

export function getTwapRuntimeMinutes(minutes: number | null): number {
	return Math.max(0, Math.round(minutes ?? 0));
}

/**
 * The size of each TWAP suborder as the official terminal estimates it: one suborder every 30 seconds
 * of the runtime plus the first, each at least the minimum order value at the reference price and
 * never more than the whole order. The exchange spaces suborders by size and runtime, with intervals of
 * at least 30 seconds, so a small order runs fewer, larger suborders; null while an input is missing.
 */
export function getTwapSuborderSize(totalSize: Numeric, minutes: number | null, referencePx: Numeric): Big | null {
	const size = toBig(totalSize);
	const runtime = getTwapRuntimeMinutes(minutes);
	if (!size?.gt(0) || runtime <= 0) return null;
	const suborders = Math.floor((runtime * 60) / TWAP_SUBORDER_INTERVAL_SECONDS) + 1;
	const evenSplit = size.div(suborders);
	const price = toBig(referencePx);
	const minimumSize = price?.gt(0) ? Big(ORDER_MIN_NOTIONAL_USD).div(price) : Big(0);
	const suborderSize = evenSplit.gt(minimumSize) ? evenSplit : minimumSize;
	return suborderSize.gt(size) ? size : suborderSize;
}

export function getTwapTriggerDirection(triggerPx: Numeric, markPx: Numeric): TwapTriggerDirection | null {
	const trigger = toBig(triggerPx);
	const mark = toBig(markPx);
	if (!trigger || !mark || trigger.lte(0) || mark.lte(0) || trigger.eq(mark)) return null;
	return trigger.gt(mark) ? "above" : "below";
}

export function buildTwapOrderDetails({
	triggerPx,
	stopPx,
	markPx,
}: BuildTwapOrderDetailsInput): TwapOrderDetails | undefined {
	if (triggerPx === null && stopPx === null) return undefined;
	if (triggerPx === null) return { t: null, s: stopPx };
	const direction = getTwapTriggerDirection(triggerPx, markPx);
	if (!direction) throw new TwapOrderDetailsError();
	return { t: { p: triggerPx, a: direction === "above" }, s: stopPx };
}
