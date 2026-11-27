/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, useId, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileDisclosureHeader } from "@/components/trade/mobile/mobile-disclosure-header";
import { MobileOrderModificationModal } from "@/components/trade/mobile/mobile-order-modification-modal";
import { MobilePositionCard } from "@/components/trade/mobile/mobile-position-card";
import type { Position } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import { createI18nRoot } from "./harness/react";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const MODAL_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-order-modification-modal.tsx"),
	"utf8",
);
const ORDERS_TAB_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-orders-tab.tsx"),
	"utf8",
);

function DisclosureHarness() {
	const [expanded, setExpanded] = useState(false);
	const panelId = useId();
	return (
		<div>
			<MobileDisclosureHeader
				expanded={expanded}
				label={expanded ? "Collapse details" : "Expand details"}
				controls={panelId}
				onToggle={() => setExpanded((value) => !value)}
				className="grid-cols-[1fr_16px]"
			>
				<span>Row</span>
			</MobileDisclosureHeader>
			{expanded ? <div id={panelId}>Details</div> : null}
		</div>
	);
}

function pressKey(input: HTMLInputElement, key: string) {
	input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
}

describe("G1b mobile disclosure, position card, and order modification fixes", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeAll(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn((query: string) => ({
				matches: true,
				media: query,
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		});
	});

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("omits aria-controls when collapsed (B-06/F-07) and mirrors chevron in RTL collapsed state (B1-06)", () => {
		act(() => root.render(<DisclosureHarness />));
		const trigger = container.querySelector<HTMLButtonElement>("button");
		const svg = container.querySelector<SVGSVGElement>("svg");

		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		expect(trigger?.getAttribute("aria-controls")).toBeNull();
		expect(svg?.className.baseVal).toMatch(/rtl:(?:rotate-180|-scale-x-100)/);
		expect(svg?.className.baseVal).not.toContain("rotate-90");

		act(() => trigger?.click());
		const controlsId = trigger?.getAttribute("aria-controls");
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(controlsId).toBeTruthy();
		expect(controlsId ? document.getElementById(controlsId) : null).not.toBeNull();
		expect(svg?.className.baseVal).toContain("rotate-90");
		expect(svg?.className.baseVal).not.toMatch(/rtl:(?:rotate-180|-scale-x-100)/);
	});

	it("shows DEX identity on MobilePositionCard, never truncates details, and wraps bottom actions (B-01, B-02, 320px FR)", () => {
		const onSelectMarket = vi.fn();
		const onMarketClose = vi.fn();
		const position: Position = {
			dex: "xyz",
			coin: "xyz:ORCL",
			szi: "10.5",
			entryPx: "123456.78",
			positionValue: "1296296.19",
			unrealizedPnl: "12345.67",
			returnOnEquity: "0.25",
			liquidationPx: "98765.43",
			marginUsed: "12345.67",
			maxLeverage: 10,
			leverage: { type: "isolated", value: 10, rawUsd: "0" },
			cumFunding: { allTime: "-123.45", sinceChange: "0", sinceOpen: "-123.45" },
		};
		const markets = {
			getMarket: () => ({
				kind: "builderPerp" as const,
				name: "xyz:ORCL",
				shortName: "ORCL",
				pairName: "ORCL-USDC",
				dex: "xyz",
				assetId: 120_001,
				szDecimals: 2,
				marginMode: "noCross",
			}),
		} as unknown as Markets;

		act(() => {
			root.render(
				<MobilePositionCard
					position={position}
					env="Mainnet"
					isDataStale={false}
					markets={markets}
					markPx="124000"
					markPriceStatus="success"
					tpSlInfo={{ tpPrice: "150000.5", slPrice: "110000.25" }}
					isRowClosing={false}
					expanded
					onMarketClose={onMarketClose}
					onShare={vi.fn()}
					onReverse={vi.fn()}
					reverseBlocked={false}
					onLimitClose={vi.fn()}
					onOpenTpSl={vi.fn()}
					onAdjustMargin={vi.fn()}
					onSelectMarket={onSelectMarket}
				/>,
			);
		});

		const marketButton = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Switch to ORCL (xyz) market, long position"]',
		);
		expect(marketButton).not.toBeNull();
		expect(marketButton?.textContent).toContain("ORCL");
		expect(marketButton?.textContent).toContain("xyz");
		act(() => marketButton?.click());
		expect(onSelectMarket).toHaveBeenCalledWith("xyz:ORCL", "buy");

		expect(container.querySelector('button[aria-label="Collapse ORCL (xyz) position details"]')).not.toBeNull();
		expect(container.querySelector('button[aria-label="Share PNL for ORCL (xyz)"]')).not.toBeNull();
		expect(container.querySelector('button[aria-label="Adjust isolated margin for ORCL (xyz)"]')).not.toBeNull();

		const detailsId = container
			.querySelector<HTMLButtonElement>('button[aria-label="Collapse ORCL (xyz) position details"]')
			?.getAttribute("aria-controls");
		const details = detailsId ? document.getElementById(detailsId) : null;
		expect(details).not.toBeNull();
		expect(details?.querySelectorAll(".truncate")).toHaveLength(0);

		const tpSlButton = [...(details?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((button) =>
			button.textContent?.startsWith("TP/SL"),
		);
		expect(tpSlButton?.querySelector("span.flex-wrap")).not.toBeNull();

		const limitCloseButton = [...(details?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
			(button) => button.textContent?.trim() === "Limit Close",
		);
		expect(limitCloseButton?.parentElement?.className).toContain("flex-wrap");
	});

	it("preserves shared AdaptiveModal transitions and lingers mount on close (B-03)", () => {
		expect(MODAL_SOURCE).not.toContain("!transition-none");
		expect(MODAL_SOURCE).not.toContain("data-starting-style:");
		expect(MODAL_SOURCE).not.toContain("data-ending-style:");
		expect(ORDERS_TAB_SOURCE).toContain("useLingeringValue(");
	});

	it("moves focus on Enter in price inputs (enterKeyHint=next) and submits only from size (C-02)", () => {
		const onConfirm = vi.fn();
		act(() => {
			root.render(
				<MobileOrderModificationModal
					open
					marketLabel="ORCL (xyz)"
					directionLabel="Buy"
					directionTone="positive"
					typeLabel="Stop Limit"
					sizeValue="1.5"
					triggerPriceValue="165"
					limitPriceValue="170"
					sizeInvalid={false}
					triggerPriceInvalid={false}
					limitPriceInvalid={false}
					isInteractionLocked={false}
					isConfirmDisabled={false}
					onSizeChange={vi.fn()}
					onTriggerPriceChange={vi.fn()}
					onLimitPriceChange={vi.fn()}
					onOpenChange={vi.fn()}
					onConfirm={onConfirm}
				/>,
			);
		});

		const trigger = document.body.querySelector<HTMLInputElement>('input[aria-label="Trigger Price"]');
		const price = document.body.querySelector<HTMLInputElement>('input[aria-label="Price"]');
		const size = document.body.querySelector<HTMLInputElement>('input[aria-label="Size"]');
		expect(trigger).not.toBeNull();
		expect(price).not.toBeNull();
		expect(size).not.toBeNull();

		act(() => {
			trigger?.focus();
			if (trigger) pressKey(trigger, "Enter");
		});
		expect(onConfirm).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(price);

		act(() => {
			if (price) pressKey(price, "Enter");
		});
		expect(onConfirm).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(size);

		act(() => {
			if (size) pressKey(size, "Enter");
		});
		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it("moves focus directly from Trigger Price to Size when no Limit Price input exists (C-02)", () => {
		const onConfirm = vi.fn();
		act(() => {
			root.render(
				<MobileOrderModificationModal
					open
					marketLabel="ORCL (xyz)"
					directionLabel="Buy"
					directionTone="positive"
					typeLabel="Stop Market"
					sizeValue="1.5"
					triggerPriceValue="165"
					sizeInvalid={false}
					triggerPriceInvalid={false}
					limitPriceInvalid={false}
					isInteractionLocked={false}
					isConfirmDisabled={false}
					onSizeChange={vi.fn()}
					onTriggerPriceChange={vi.fn()}
					onLimitPriceChange={vi.fn()}
					onOpenChange={vi.fn()}
					onConfirm={onConfirm}
				/>,
			);
		});

		const trigger = document.body.querySelector<HTMLInputElement>('input[aria-label="Trigger Price"]');
		const size = document.body.querySelector<HTMLInputElement>('input[aria-label="Size"]');
		act(() => {
			trigger?.focus();
			if (trigger) pressKey(trigger, "Enter");
		});
		expect(onConfirm).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(size);
	});
});
