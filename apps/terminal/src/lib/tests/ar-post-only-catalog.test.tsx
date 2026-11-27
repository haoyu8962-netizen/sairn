/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n, type MessageDescriptor } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeFormTif } from "@/components/trade/tradebox/trade-form-tif";
import { getTooltip } from "@/config/tooltips";
import { buildOrderConfirmationRows, type OrderConfirmationDraft } from "@/domain/trade/order-confirmation";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { formatExchangeErrorText } from "@/lib/errors/exchange-error-text";
import { getNumberFormatters } from "@/lib/format";
import { formatOrderChildError } from "@/lib/trade/order-status-reasons";

vi.mock("@/stores/use-order-entry-store", () => ({
	useTif: () => "Alo",
	useOrderEntryActions: () => ({ setTif: vi.fn() }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ARABIC_POST_ONLY_TERM = "إضافة سيولة فقط";

function readField(block: string, name: "msgctxt" | "msgid" | "msgstr"): string | undefined {
	const lines = block.split("\n");
	const start = lines.findIndex((line) => line.startsWith(`${name} "`));
	if (start === -1) return undefined;
	let value = lines[start].slice(name.length + 2, -1);
	for (let index = start + 1; index < lines.length && lines[index].startsWith('"'); index += 1) {
		value += lines[index].slice(1, -1);
	}
	return value;
}

function parseArabicCatalog(): Map<string, string> {
	const catalog = readFileSync(resolve(__dirname, "../../locales/ar/messages.po"), "utf8");
	const entries = new Map<string, string>();
	for (const block of catalog.split(/\n{2,}/)) {
		if (/^#~ /m.test(block)) continue;
		const id = readField(block, "msgid");
		const translation = readField(block, "msgstr");
		const context = readField(block, "msgctxt") ?? "";
		if (id && translation !== undefined) {
			entries.set(`${id}\x1f${context}`, translation);
		}
	}
	return entries;
}

function linguiId(message: string, context = ""): string {
	return createHash("sha256").update(`${message}\x1f${context}`).digest("base64").slice(0, 6);
}

const BASE_DRAFT: OrderConfirmationDraft = {
	assetId: 0,
	marketLabel: "BTC-USD",
	marketKind: "perp",
	isLeveraged: true,
	side: "buy",
	orderType: "limit",
	tif: "Alo",
	baseToken: "BTC",
	szDecimals: 4,
	sizeValue: 0.5,
	orderValue: 50_000,
	limitPrice: 99_000,
	triggerPrice: null,
	scaleStartPrice: 98_000,
	scaleEndPrice: 100_000,
	scaleLevels: 4,
	scaleSkew: 1,
	twapMinutes: null,
	twapRandomize: false,
	twapTriggerPrice: null,
	twapStopPrice: null,
	tpSlEnabled: false,
	tpPrice: null,
	slPrice: null,
	reduceOnly: false,
	leverage: 10,
	marginMode: "cross",
	marginRequired: 5_000,
	feeQuote: buildOrderFeeQuote({
		orderValue: 50_000,
		protocolRate: 0.00045,
		builderFeeTenthsBps: 10,
		marketKind: "perp",
		side: "buy",
		execution: "order",
	}),
	liqPrice: 90_000,
	liqWarning: false,
	slippagePercent: 2.5,
};

describe("Arabic Post Only catalog consistency", () => {
	const arEntries = parseArabicCatalog();
	const compiledArMessages: Record<string, string> = {};
	for (const [key, translation] of arEntries) {
		const [message, context = ""] = key.split("\x1f");
		compiledArMessages[linguiId(message, context)] = translation;
	}

	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "ar", messages: compiledArMessages });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("translates Post Only and all related ALO rejection notices with consistent Arabic trading terminology", () => {
		const postOnly = arEntries.get("Post Only\x1f");
		const aloTooltipTerm = arEntries.get("ALO (Add Liquidity Only)\x1f");
		const exchangeRejection = arEntries.get(
			"A Post Only order would have matched immediately. Best bid and offer: {bbo}.\x1f",
		);
		const statusRejection = arEntries.get("Rejected because the Post Only order would have matched immediately\x1f");

		expect(postOnly).toBe(ARABIC_POST_ONLY_TERM);
		expect(postOnly).not.toBe("نشر فقط");
		expect(aloTooltipTerm).toBe(`ALO (${ARABIC_POST_ONLY_TERM})`);
		expect(exchangeRejection).toContain(ARABIC_POST_ONLY_TERM);
		expect(exchangeRejection).toContain("{bbo}");
		expect(exchangeRejection).not.toContain("Post Only");
		expect(statusRejection).toContain(ARABIC_POST_ONLY_TERM);
		expect(statusRejection).not.toContain("Post Only");
	});

	it.each(["limit", "scale"] as const)(
		"renders the Arabic Post Only label in TIF selector and confirmation summary for %s orders",
		(orderType) => {
			act(() => {
				root.render(
					<I18nProvider i18n={i18n}>
						<TradeFormTif orderType={orderType} disabled={false} />
					</I18nProvider>,
				);
			});

			const trigger = container.querySelector<HTMLButtonElement>('button[role="combobox"]');
			expect(trigger?.textContent).toBe(ARABIC_POST_ONLY_TERM);
			expect(trigger?.getAttribute("aria-label")).toContain(ARABIC_POST_ONLY_TERM);

			const translate = (descriptor: MessageDescriptor) => i18n._(descriptor);
			const rows = buildOrderConfirmationRows(
				{ ...BASE_DRAFT, orderType, tif: "Alo" },
				getNumberFormatters(),
				translate,
				"ar",
			);
			const orderTypeRow = rows.find((row) => row.key === "orderType");
			expect(orderTypeRow?.value).toContain(ARABIC_POST_ONLY_TERM);
			expect(orderTypeRow?.value).not.toContain("نشر فقط");
		},
	);

	it("uses the same Arabic Post Only term in the TIF tooltip and order rejection messages", () => {
		const translate = (descriptor: MessageDescriptor) => i18n._(descriptor);
		const tooltip = getTooltip("tif", translate, { only: ["Alo"] });
		expect(tooltip.items[0]?.term).toBe(`ALO (${ARABIC_POST_ONLY_TERM})`);

		const bboError = formatExchangeErrorText(
			"Post only order would have immediately matched, bbo was 100.5@101.",
			translate,
		);
		expect(bboError).toContain(ARABIC_POST_ONLY_TERM);
		expect(bboError).toContain("100.5@101");
		expect(bboError).not.toContain("Post Only");

		const statusError = formatOrderChildError("badAloPxRejected", translate);
		expect(statusError).toContain(ARABIC_POST_ONLY_TERM);
		expect(statusError).not.toContain("Post Only");
	});
});
