// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_APPLY_VOLUME_LIMIT } from "@/config/referral";
import {
	type ActionFailure,
	classifyActionError,
	classifyActionErrorOr,
	describeActionFailure,
	describeAmountLimit,
	formatActionFailure,
} from "@/lib/errors/action-error";
import { formatTransferError } from "@/lib/errors/format";
import { AmountLimitActionError } from "@/lib/errors/localized-action-error";
import { getNumberFormatters, type NumberFormatters, useNumberFormat } from "@/lib/format";
import { getCctpDepositLimitFailure } from "@/lib/hyperliquid/cctp-deposit-limit";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { getOrderNotificationCopy } from "@/lib/trade/order-notification-copy";
import { canApplyReferralCode, type ReferralData } from "@/lib/trade/referral";
import type { Translate } from "@/lib/translate";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";

const formatSettings = vi.hoisted(() => ({ numberFormatLocale: "en-US" as "en-US" | "de-DE" | "fr-FR" }));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => formatSettings.numberFormatLocale,
}));

const LRI = "⁦";
const PDI = "⁩";
const translate: Translate = (descriptor) => i18n._(descriptor);

const REFERRAL_ERROR_TEXT = "Referral codes cannot be applied after cumulative volume exceeds $10,000";
const SEPARATORS = [
	["en-US", "10,000,000", "1,000", "10,000"],
	["de-DE", "10.000.000", "1.000", "10.000"],
	["fr-FR", "10 000 000", "1 000", "10 000"],
] as const;

function setNumberFormat(locale: (typeof SEPARATORS)[number][0]) {
	formatSettings.numberFormatLocale = locale;
	notifyNumberFormatChange();
}

function referralFailureOrder(error: ActionFailure): OrderQueueItem {
	return {
		id: "referral-apply",
		owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		env: "Mainnet",
		createdAt: 0,
		status: "failed",
		title: { id: "referral-request", message: "Referral request" },
		error,
	};
}

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
	setNumberFormat("en-US");
});

describe("amount limit failures", () => {
	it("classifies our limit error, also when a wallet adapter or SDK wraps it", () => {
		const limit = new AmountLimitActionError("cctp-mainnet-deposit-limit", "10000000");
		const expected = { kind: "action-error", code: "cctp-mainnet-deposit-limit", amount: "10000000" };

		expect(classifyActionError(limit)).toEqual(expected);
		expect(classifyActionError(new Error("adapter failed", { cause: limit }))).toEqual(expected);
		expect(classifyActionError(new Error("sdk", { cause: new Error("adapter", { cause: limit }) }))).toEqual(expected);
		expect(limit.message).toBe("Amount limit cctp-mainnet-deposit-limit: 10000000");
	});

	it("reads the referral volume limit from our English error text", () => {
		expect(classifyActionError(new Error(REFERRAL_ERROR_TEXT))).toEqual({
			kind: "action-error",
			code: "referral-apply-volume-limit",
			amount: REFERRAL_APPLY_VOLUME_LIMIT,
		});
	});

	it("applies the referral limit it names", () => {
		const data = { referredBy: null, cumVlm: "10000", tokenToState: [] } as unknown as ReferralData;
		expect(canApplyReferralCode(data)).toBe(true);
		expect(canApplyReferralCode({ ...data, cumVlm: "10000.01" })).toBe(false);
	});

	it("finds the Circle limit a deposit exceeds on each network", () => {
		const mainnetLimit = 10_000_000n * 10n ** 6n;
		const testnetLimit = 1_000n * 10n ** 6n;

		expect(getCctpDepositLimitFailure(mainnetLimit, false)).toBeNull();
		expect(getCctpDepositLimitFailure(mainnetLimit + 1n, false)).toEqual({
			kind: "action-error",
			code: "cctp-mainnet-deposit-limit",
			amount: "10000000",
		});
		expect(getCctpDepositLimitFailure(testnetLimit + 1n, false)).toBeNull();
		expect(getCctpDepositLimitFailure(testnetLimit, true)).toBeNull();
		expect(getCctpDepositLimitFailure(testnetLimit + 1n, true)).toEqual({
			kind: "action-error",
			code: "cctp-testnet-deposit-limit",
			amount: "1000",
		});
		expect(getCctpDepositLimitFailure(mainnetLimit + 1n, true)?.code).toBe("cctp-mainnet-deposit-limit");
	});

	it.each(SEPARATORS)(
		"formats every limit with the %s separators and no decimals",
		(locale, mainnet, testnet, referral) => {
			setNumberFormat(locale);
			const numberFormat = getNumberFormatters();
			const mainnetError = new AmountLimitActionError("cctp-mainnet-deposit-limit", "10000000");
			const testnetError = new AmountLimitActionError("cctp-testnet-deposit-limit", "1000");

			expect(formatTransferError(mainnetError, translate, numberFormat)).toBe(
				`Circle CCTP deposits are limited to ${mainnet} USDC per transfer.`,
			);
			expect(formatTransferError(testnetError, translate, numberFormat)).toBe(
				`Circle testnet deposits are limited to ${testnet} USDC per transfer.`,
			);
			expect(describeActionFailure(classifyActionError(new Error(REFERRAL_ERROR_TEXT)), translate, numberFormat)).toBe(
				`Referral codes cannot be applied after cumulative volume exceeds $${referral}.`,
			);
			expect(
				describeAmountLimit("referral-apply-volume-limit", REFERRAL_APPLY_VOLUME_LIMIT, translate, numberFormat),
			).toBe(`Referral codes cannot be applied after cumulative volume exceeds $${referral}.`);
		},
	);

	it.each(SEPARATORS)(
		"shows a stored referral failure in a notification with the %s separators",
		(locale, _mainnet, _testnet, referral) => {
			setNumberFormat(locale);
			const failure = classifyActionErrorOr(new Error(REFERRAL_ERROR_TEXT), {
				id: "fallback",
				message: "Referral request could not be completed.",
			});

			expect(getOrderNotificationCopy(referralFailureOrder(failure), translate, getNumberFormatters()).error).toBe(
				`Referral codes cannot be applied after cumulative volume exceeds $${referral}.`,
			);
		},
	);

	it("keeps a limit failure out of the generic and unknown paths", () => {
		const failure = classifyActionError(new AmountLimitActionError("cctp-testnet-deposit-limit", "1000"));
		expect(formatActionFailure(failure, translate, getNumberFormatters())).not.toBeNull();
		expect(
			classifyActionErrorOr(new AmountLimitActionError("cctp-testnet-deposit-limit", "1000"), { id: "x" }),
		).toEqual(failure);
	});
});

describe("amount limit failures while the setting or language changes", () => {
	let container: HTMLDivElement;
	let root: Root;
	const formatters: NumberFormatters[] = [];
	const referralFailure = classifyActionError(new Error(REFERRAL_ERROR_TEXT));
	const depositError = new AmountLimitActionError("cctp-mainnet-deposit-limit", "10000000");

	function Probe() {
		const { t } = useLingui();
		const numberFormat = useNumberFormat();
		formatters.push(numberFormat);
		const translateHere: Translate = (descriptor) => t(descriptor);
		return (
			<>
				<p data-testid="notification">
					{getOrderNotificationCopy(referralFailureOrder(referralFailure), translateHere, numberFormat).error}
				</p>
				<p data-testid="deposit">{formatTransferError(depositError, translateHere, numberFormat)}</p>
			</>
		);
	}

	function text(testId: string) {
		return container.querySelector(`[data-testid="${testId}"]`)?.textContent;
	}

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		formatters.length = 0;
		container = document.createElement("div");
		document.body.append(container);
		root = createI18nRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("renders a stored failure again with the new separators after the setting changes", () => {
		expect(text("notification")).toBe("Referral codes cannot be applied after cumulative volume exceeds $10,000.");
		expect(text("deposit")).toBe("Circle CCTP deposits are limited to 10,000,000 USDC per transfer.");

		act(() => setNumberFormat("de-DE"));

		expect(text("notification")).toBe("Referral codes cannot be applied after cumulative volume exceeds $10.000.");
		expect(text("deposit")).toBe("Circle CCTP deposits are limited to 10.000.000 USDC per transfer.");
	});

	it("isolates a space-grouped limit only in a right-to-left interface", () => {
		act(() => setNumberFormat("fr-FR"));
		expect(text("deposit")).toBe("Circle CCTP deposits are limited to 10 000 000 USDC per transfer.");

		act(() => i18n.loadAndActivate({ locale: "ar", messages: {} }));
		expect(text("deposit")).toBe(`Circle CCTP deposits are limited to ${LRI}10 000 000${PDI} USDC per transfer.`);
		expect(text("notification")).toBe(
			`Referral codes cannot be applied after cumulative volume exceeds $${LRI}10 000${PDI}.`,
		);

		act(() => setNumberFormat("en-US"));
		expect(text("deposit")).toBe("Circle CCTP deposits are limited to 10,000,000 USDC per transfer.");

		act(() => setNumberFormat("de-DE"));
		expect(text("deposit")).toBe("Circle CCTP deposits are limited to 10.000.000 USDC per transfer.");
	});
});
