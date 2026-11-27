// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeRow } from "@/components/trade/orderbook/trade-row";
import { formatNumber } from "@/lib/format";
import { getNumberFormatRevision, notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import type { ProcessedTrade } from "@/lib/trade/trades";
import { getResolvedFormatLocale } from "@/stores/use-global-settings-store";

const mocks = vi.hoisted(() => ({ formatLocale: "en-US", lastRevision: 0, renderCount: 0 }));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string, isTestnet: boolean) =>
		`https://${isTestnet ? "testnet." : ""}example.test/tx/${hash}`,
}));

vi.mock("@/lib/format", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/format")>();
	return {
		...actual,
		useNumberFormat: () => {
			mocks.renderCount += 1;
			mocks.lastRevision = getNumberFormatRevision();
			return actual.useNumberFormat();
		},
	};
});

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => mocks.formatLocale,
}));

const baseTrade: ProcessedTrade = {
	id: "1721649600000:HYPE:42",
	hash: "0xabc",
	time: "12:00:00",
	price: "64.50",
	size: "1.25",
	side: "buy",
};

const baseProps: ComponentProps<typeof TradeRow> = {
	trade: baseTrade,
	priceDecimals: 2,
	szDecimals: 2,
	isTestnet: false,
	compact: false,
	initial: false,
};

describe("TradeRow", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.formatLocale = "en-US";
		mocks.lastRevision = 0;
		mocks.renderCount = 0;
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("does not rerender for an equal cloned trade", () => {
		renderRow(baseProps);
		renderRow({ ...baseProps, trade: { ...baseTrade } });

		expect(mocks.renderCount).toBe(1);
		const row = container.querySelector("a.recent-trade-row");
		expect(row).not.toBeNull();
		expect(row?.classList).toContain("h-6");
	});

	it("rerenders for a number-format notification despite equal props", () => {
		renderRow(baseProps);
		renderRow({ ...baseProps, trade: { ...baseTrade } });
		expect(mocks.renderCount).toBe(1);
		expect(container.textContent).toContain("64.50");

		mocks.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());

		expect(mocks.renderCount).toBe(2);
		expect(mocks.lastRevision).toBeGreaterThan(0);
		expect(getResolvedFormatLocale()).toBe("de-DE");
		expect(formatNumber("64.50", 2)).toBe("64,50");
		expect(container.textContent).toContain("64,50");
	});

	it.each([
		["trade id", { trade: { ...baseTrade, id: "1721649600000:HYPE:43" } }],
		["trade hash", { trade: { ...baseTrade, hash: "0xdef" } }],
		["trade time", { trade: { ...baseTrade, time: "12:00:01" } }],
		["trade price", { trade: { ...baseTrade, price: "64.51" } }],
		["trade size", { trade: { ...baseTrade, size: "1.26" } }],
		["trade side", { trade: { ...baseTrade, side: "sell" as const } }],
		["price decimals", { priceDecimals: 3 }],
		["size decimals", { szDecimals: 3 }],
		["network", { isTestnet: true }],
		["compact layout", { compact: true }],
		["initial snapshot", { initial: true }],
	] satisfies Array<[string, Partial<ComponentProps<typeof TradeRow>>]>)(
		"rerenders when %s changes",
		(_name, changedProps) => {
			renderRow(baseProps);
			renderRow({ ...baseProps, ...changedProps });

			expect(mocks.renderCount).toBe(2);
		},
	);

	it("exposes localized buy and sell direction to screen readers rather than color alone", () => {
		renderRow(baseProps);
		const buyLabel = container.querySelector("a.recent-trade-row")?.getAttribute("aria-label");
		expect(buyLabel).toContain("Buy");
		expect(buyLabel).toContain("64.50");
		expect(buyLabel).toContain("1.25");
		expect(buyLabel).toContain("12:00:00");

		renderRow({ ...baseProps, trade: { ...baseTrade, side: "sell" } });
		const sellLabel = container.querySelector("a.recent-trade-row")?.getAttribute("aria-label");
		expect(sellLabel).toContain("Sell");
		expect(sellLabel).not.toBe(buyLabel);

		const getMessageId = (message: string) =>
			createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
		const zhMessages: Messages = {
			[getMessageId("Sell")]: "卖出",
			[getMessageId("Price")]: "价格",
			[getMessageId("Size")]: "数量",
			[getMessageId("Time")]: "时间",
		};
		act(() => i18n.loadAndActivate({ locale: "zh", messages: zhMessages }));
		expect(container.querySelector("a.recent-trade-row")?.getAttribute("aria-label")).toContain("卖出");
	});

	it("formats exact decimal strings without losing precision through JS number", () => {
		renderRow({
			...baseProps,
			trade: { ...baseTrade, price: "9007199254740993", size: "12345678901234567" },
			priceDecimals: 0,
			szDecimals: 0,
		});

		const row = container.querySelector<HTMLAnchorElement>("a.recent-trade-row");
		expect(row?.children[0]?.textContent).toBe("9,007,199,254,740,993");
		expect(row?.children[0]?.getAttribute("title")).toBe("9,007,199,254,740,993");
		expect(row?.children[1]?.textContent).toBe("12,345,678,901,234,567");
		expect(row?.getAttribute("aria-label")).toContain("9,007,199,254,740,993");

		mocks.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(row?.children[0]?.textContent).toBe("9.007.199.254.740.993");
	});

	function renderRow(props: ComponentProps<typeof TradeRow>) {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<TradeRow {...props} />
				</I18nProvider>,
			),
		);
	}
});

describe("TradeRow containment", () => {
	it("keeps every row in the DOM while allowing offscreen rendering work to be skipped", () => {
		const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

		expect(styles).toMatch(
			/\.recent-trade-row\s*\{\s*content-visibility:\s*auto;\s*contain-intrinsic-block-size:\s*24px;\s*}/,
		);
	});
});
