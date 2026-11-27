// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tradeColumn } from "@/components/trade/mobile/mobile-trade-frame-view";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	market: {
		kind: "perp" as const,
		markPx: "100",
		midPx: "100.25",
		markPriceStatus: "success" as const,
		midPriceReceivedAt: Date.now(),
		name: "HYPE",
		pairName: "HYPE-USDC",
		szDecimals: 2,
	},
	book: {
		coin: "HYPE",
		levels: [[{ n: 1, px: "99.5", sz: "10" }], [{ n: 1, px: "100.5", sz: "12" }]] as [
			Array<{ n: number; px: string; sz: string }>,
			Array<{ n: number; px: string; sz: string }>,
		],
		time: Date.now(),
	},
}));

vi.mock("@/components/trade/orderbook/orderbook-hover-tooltip", () => ({
	OrderbookHoverTooltip: ({
		hover,
	}: ComponentProps<typeof import("@/components/trade/orderbook/orderbook-hover-tooltip").OrderbookHoverTooltip>) => (
		<div role="tooltip" id={hover.tooltipId} />
	),
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", () => ({
	useOrderbookMidPrice: () => ({ isStale: false, midPx: "100", status: "active" }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: "Mainnet" }),
	useSelectedMarketInfo: () => ({ data: mocks.market }),
	canUseL2Decompression: () => true,
	L2BookStreamError: class L2BookStreamError extends Error {},
	useL2BookSubscription: () => ({
		data: mocks.book,
		error: undefined,
		isStale: false,
		lastMessageAt: Date.now(),
		status: "active",
	}),
	useSubscription: () => ({
		data: mocks.book,
		error: undefined,
		isStale: false,
		lastMessageAt: Date.now(),
		status: "active",
	}),
}));

import { MobileBookView, SplitOrderbookRow } from "@/components/trade/mobile/mobile-book-view";

describe("mobile orderbook RTL alignment, grouping active state, and touch targets", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		getOrderbookActionsStore().actions.clearSelectedPrice();
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			bottom: 304,
			height: 304,
			left: 0,
			right: 360,
			top: 0,
			width: 360,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		});
		vi.stubGlobal(
			"ResizeObserver",
			class implements ResizeObserver {
				disconnect() {}
				observe() {}
				unobserve() {}
			},
		);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		document.querySelectorAll("[data-base-ui-portal]").forEach((portal) => {
			portal.remove();
		});
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("uses logical inline-end divider and center-seam alignment for RTL split trade and book views", () => {
		expect(tradeColumn).toContain("border-e");
		expect(tradeColumn).not.toContain("border-r");

		act(() => root.render(<MobileBookView active compact={false} inTabLayout view="book" />));

		const bidPriceHeading = container.querySelector<HTMLElement>('[data-slot="split-orderbook-bid-price-heading"]');
		const askPriceHeading = container.querySelector<HTMLElement>('[data-slot="split-orderbook-ask-price-heading"]');
		const askTotalHeading = container.querySelector<HTMLElement>(
			'[data-slot="split-orderbook-ask-headings"] > :last-child',
		);
		expect(bidPriceHeading?.className).toContain("text-end");
		expect(bidPriceHeading?.className).not.toContain("text-right");
		expect(askPriceHeading?.className).toContain("text-start");
		expect(askTotalHeading?.className).toContain("text-end");
		expect(askTotalHeading?.className).not.toContain("text-right");

		const level = { price: "99.5", size: "10", total: "10", quoteSize: "995", quoteTotal: "995" };
		act(() =>
			root.render(
				<>
					<SplitOrderbookRow
						level={level}
						marketName="HYPE"
						side="bid"
						maxTotal="20"
						priceDecimals={2}
						showInQuote={false}
						szDecimals={2}
					/>
					<SplitOrderbookRow
						level={{ ...level, price: "100.5" }}
						marketName="HYPE"
						side="ask"
						maxTotal="20"
						priceDecimals={2}
						showInQuote={false}
						szDecimals={2}
					/>
				</>,
			),
		);

		const bidRow = container.querySelector<HTMLButtonElement>('button[data-orderbook-side="bid"]');
		const askRow = container.querySelector<HTMLButtonElement>('button[data-orderbook-side="ask"]');
		expect(bidRow?.className).toContain("text-start");
		expect(bidRow?.className).not.toContain("text-left");
		expect(bidRow?.querySelector(".orderbook-price-bid")?.className).toContain("text-end");
		expect(bidRow?.querySelector(".orderbook-price-bid")?.className).not.toContain("text-right");
		expect(askRow?.querySelector(".orderbook-price-ask")?.className).toContain("text-start");
		expect(askRow?.querySelector(".orderbook-price-ask")?.className).not.toContain("text-left");

		const bidDepth = bidRow?.querySelector<HTMLElement>(".depth-bar-bid");
		const askDepth = askRow?.querySelector<HTMLElement>(".depth-bar-ask");
		expect(bidDepth?.className).toContain("end-0");
		expect(bidDepth?.style.right).toBe("");
		expect(bidDepth?.style.left).toBe("");
		expect(askDepth?.className).toContain("start-0");
		expect(askDepth?.style.left).toBe("");
		expect(askDepth?.style.right).toBe("");
	});

	it("marks the effective active price grouping in both split and compact menus", async () => {
		act(() => root.render(<MobileBookView active compact={false} inTabLayout view="book" />));
		const splitTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="Price grouping"]');
		expect(splitTrigger).not.toBeNull();
		await act(async () => splitTrigger?.click());
		const splitItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		expect(splitItems.length).toBeGreaterThan(1);
		expect(splitItems[0]?.getAttribute("aria-current")).toBe("true");
		expect(splitItems[0]?.querySelector("svg")).not.toBeNull();
		await act(async () => splitTrigger?.click());

		act(() => root.render(<MobileBookView active compact inTabLayout view="book" />));
		const compactTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="Price precision"]');
		expect(compactTrigger).not.toBeNull();
		expect(compactTrigger?.getAttribute("aria-description")).toBe(compactTrigger?.textContent);

		await act(async () => compactTrigger?.click());
		let compactItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		expect(compactItems.length).toBeGreaterThan(1);
		expect(compactItems[0]?.getAttribute("aria-current")).toBe("true");
		expect(compactItems[0]?.querySelector("svg")).not.toBeNull();

		await act(async () => compactItems[1]?.click());
		await act(async () => compactTrigger?.click());
		compactItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		expect(compactItems[0]?.getAttribute("aria-current")).toBeNull();
		expect(compactItems[1]?.getAttribute("aria-current")).toBe("true");
	});

	it("exposes the formatted active price grouping on the split trigger across fallback, selection, and market switch", async () => {
		const initialMarket = mocks.market;
		try {
			act(() => root.render(<MobileBookView active compact={false} inTabLayout view="book" />));
			const getSplitTrigger = () => container.querySelector<HTMLButtonElement>('button[aria-label="Price grouping"]');

			const initialTrigger = getSplitTrigger();
			expect(initialTrigger).not.toBeNull();
			const initialLabel = initialTrigger?.textContent?.trim();
			expect(initialLabel).toBeTruthy();
			expect(initialTrigger?.getAttribute("aria-description")).toBe(initialLabel);

			await act(async () => initialTrigger?.click());
			const initialItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
			expect(initialItems.length).toBeGreaterThan(1);
			expect(initialItems[0]?.getAttribute("aria-current")).toBe("true");
			const chosenLabel = initialItems[1]?.textContent?.trim();
			expect(chosenLabel).toBeTruthy();
			expect(chosenLabel).not.toBe(initialLabel);

			await act(async () => initialItems[1]?.click());
			expect(getSplitTrigger()?.textContent?.trim()).toBe(chosenLabel);
			expect(getSplitTrigger()?.getAttribute("aria-description")).toBe(chosenLabel);

			mocks.market = {
				...initialMarket,
				markPx: "0.05",
				midPx: "0.05",
				name: "MICRO",
				pairName: "MICRO-USDC",
				szDecimals: 2,
			};
			act(() => root.render(<MobileBookView active compact={false} inTabLayout view="book" />));

			const switchedTrigger = getSplitTrigger();
			const fallbackLabel = switchedTrigger?.textContent?.trim();
			expect(fallbackLabel).toBeTruthy();
			expect(fallbackLabel).not.toBe(chosenLabel);
			expect(switchedTrigger?.getAttribute("aria-description")).toBe(fallbackLabel);

			await act(async () => switchedTrigger?.click());
			const switchedItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
			expect(switchedItems.length).toBeGreaterThan(1);
			expect(switchedItems[0]?.getAttribute("aria-current")).toBe("true");
		} finally {
			mocks.market = initialMarket;
		}
	});

	it("gives compact mode switches and price precision trigger at least 24px targets and press feedback", () => {
		act(() => root.render(<MobileBookView active compact inTabLayout view="book" />));

		const modeButtons = [...container.querySelectorAll<HTMLButtonElement>("button[data-mode]")];
		expect(modeButtons).toHaveLength(3);
		for (const button of modeButtons) {
			expect(button.className).not.toContain("h-[22px]");
			expect(button.className).toMatch(/\b(?:size-6|h-6)\b/);
			expect(button.className).toMatch(/\b(?:size-6|w-6)\b/);
			const isSelected = button.getAttribute("aria-pressed") === "true";
			expect(button.className).toContain(isSelected ? "active:opacity-60" : "active:bg-fill-weak");
		}

		const precisionTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="Price precision"]');
		expect(precisionTrigger).not.toBeNull();
		expect(precisionTrigger?.className).toMatch(/\bmin-w-(?:6|7)\b/);
		expect(precisionTrigger?.className).toContain("min-h-6");
		expect(precisionTrigger?.className).toContain("active:bg-fill-weak");
	});
});
