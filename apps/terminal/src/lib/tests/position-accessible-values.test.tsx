// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePositionCard } from "@/components/trade/mobile/mobile-position-card";
import { PositionRow } from "@/components/trade/positions/position-row";
import type { Position } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import type { TpSlOrderInfo } from "@/lib/trade/open-orders";
import { createI18nRoot } from "./harness/react";

vi.mock("@/components/trade/components/asset-badge", () => ({
	AssetBadge: ({ coin }: { coin: string }) => <span data-coin={coin} />,
}));
vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span data-coin={coin} />,
}));

const position: Position = {
	dex: "xyz",
	coin: "xyz:CXMT",
	szi: "-205.9000",
	entryPx: "7.79995",
	positionValue: "1559.84",
	unrealizedPnl: "-46.18",
	returnOnEquity: "-0.3366",
	liquidationPx: "8.27304",
	marginUsed: "137.19",
	maxLeverage: 10,
	leverage: { type: "isolated", value: 10, rawUsd: "-18.794" },
	cumFunding: { allTime: "-22.59", sinceChange: "0", sinceOpen: "-22.59" },
};

const markets = {
	getMarket: () => ({
		kind: "builderPerp",
		name: "xyz:CXMT",
		shortName: "CXMT",
		pairName: "CXMT-USDC",
		assetId: 120_031,
		szDecimals: 1,
		marginMode: "noCross",
	}),
} as unknown as Markets;

const NEAR_MARK = "7.5759";
const FAR_MARK = "20";

function describedText(element: Element | null | undefined): string {
	const ids = element?.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean) ?? [];
	return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
}

function shared(overrides: { markPx?: string; isDataStale?: boolean; tpSlInfo?: TpSlOrderInfo; position?: Position }) {
	return {
		position: overrides.position ?? position,
		env: "Mainnet" as const,
		isDataStale: overrides.isDataStale ?? false,
		markets,
		markPx: overrides.markPx ?? NEAR_MARK,
		markPriceStatus: "success" as const,
		tpSlInfo: overrides.tpSlInfo,
		isRowClosing: false,
		onMarketClose: vi.fn(),
		onShare: vi.fn(),
		onLimitClose: vi.fn(),
		onReverse: vi.fn(),
		reverseBlocked: false,
		onOpenTpSl: vi.fn(),
		onAdjustMargin: vi.fn(),
		onSelectMarket: vi.fn(),
	};
}

describe("position values reach assistive technology", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderRow(overrides: Parameters<typeof shared>[0] = {}) {
		act(() => {
			root.render(
				createElement(
					"table",
					null,
					createElement(
						"tbody",
						null,
						createElement(PositionRow, { ...shared(overrides), isEven: false, pnlMode: "roe" }),
					),
				),
			);
		});
	}

	function renderCard(overrides: Parameters<typeof shared>[0] = {}) {
		act(() => root.render(createElement(MobilePositionCard, shared(overrides))));
		const expand = container.querySelector<HTMLButtonElement>('button[aria-label^="Expand "]');
		if (expand) act(() => expand.click());
	}

	function liquidationCell(): HTMLElement {
		const cell = [...container.querySelectorAll<HTMLTableCellElement>("tbody tr > td")].find((candidate) =>
			candidate.querySelector("span[title]")?.getAttribute("title")?.startsWith("8.27"),
		);
		if (!cell) throw new Error("Expected the liquidation price cell");
		return cell;
	}

	function mobileLiquidationValue(): HTMLElement {
		const label = [...container.querySelectorAll("div")].find(
			(node) => node.children.length === 0 && node.textContent === "Liquidation Price",
		);
		const value = label?.nextElementSibling;
		if (!(value instanceof HTMLElement)) throw new Error("Expected the mobile liquidation price value");
		return value;
	}

	it("states in text when the desktop liquidation price is near the mark, and only while fresh", () => {
		renderRow();
		expect(liquidationCell().querySelector(".sr-only")?.textContent?.trim()).toBe("Near liquidation");
		expect(liquidationCell().querySelector("[aria-live], [role='status'], [role='alert']")).toBeNull();

		renderRow({ markPx: FAR_MARK });
		expect(liquidationCell().querySelector(".sr-only")).toBeNull();

		renderRow({ isDataStale: true });
		expect(liquidationCell().querySelector(".sr-only")).toBeNull();
	});

	it("states in text when the mobile liquidation price is near the mark, and only while fresh", () => {
		renderCard();
		const value = mobileLiquidationValue();
		expect(value.classList).toContain("text-error");
		expect(value.querySelector(".sr-only")?.textContent?.trim()).toBe("Near liquidation");
		expect(value.querySelector("[aria-live], [role='status'], [role='alert']")).toBeNull();

		renderCard({ markPx: FAR_MARK });
		expect(mobileLiquidationValue().querySelector(".sr-only")).toBeNull();

		renderCard({ isDataStale: true });
		expect(mobileLiquidationValue().querySelector(".sr-only")).toBeNull();
	});

	it("keeps the edit actions named by verb and describes each row's own TP/SL and margin", () => {
		renderRow({ tpSlInfo: { tpPrice: "6.5", slPrice: "8.1" } });
		const tpSl = container.querySelector<HTMLButtonElement>('button[aria-label="Edit TP/SL"]');
		const margin = container.querySelector<HTMLButtonElement>('button[aria-label="Adjust Margin"]');
		const [tpText, slText] = [...(tpSl?.querySelectorAll("span.font-semibold") ?? [])].map((node) => node.textContent);
		expect(tpText).toContain("6.5");
		expect(slText).toContain("8.1");
		expect(describedText(tpSl)).toBe(`TP ${tpText} SL ${slText}`);
		expect(describedText(margin)).toContain("137.19");
		expect(describedText(margin)).toContain("Isolated");

		renderRow({
			tpSlInfo: { tpPrice: "6.2" },
			position: { ...position, marginUsed: "42.5" },
		});
		expect(describedText(container.querySelector('button[aria-label="Edit TP/SL"]'))).toMatch(/^TP 6\.2\d* SL —$/);
		expect(describedText(container.querySelector('button[aria-label="Adjust Margin"]'))).toContain("42.5");

		renderRow();
		const add = container.querySelector<HTMLButtonElement>('button[aria-label="Add TP/SL"]');
		expect(add?.getAttribute("aria-describedby")).toBeNull();
	});

	it("keeps the mobile margin action named by verb and describes its amount", () => {
		renderCard();
		const margin = container.querySelector<HTMLButtonElement>('button[aria-label^="Adjust isolated margin for "]');
		expect(margin?.getAttribute("aria-label")).not.toMatch(/\d/);
		expect(describedText(margin)).toContain("137.19");
		expect(describedText(margin)).toContain("Isolated");

		renderCard({ position: { ...position, marginUsed: "42.5" } });
		expect(describedText(container.querySelector('button[aria-label^="Adjust isolated margin for "]'))).toContain(
			"42.5",
		);
	});
});
