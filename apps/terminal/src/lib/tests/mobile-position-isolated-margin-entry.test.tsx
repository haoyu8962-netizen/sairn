// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePositionCard } from "@/components/trade/mobile/mobile-position-card";
import type { Position } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import { createI18nRoot } from "./harness/react";

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span data-testid="position-asset-logo" data-coin={coin} />,
}));

const isolatedPosition: Position = {
	dex: "xyz",
	coin: "xyz:CXMT",
	szi: "205.9",
	entryPx: "7.79995",
	positionValue: "1559.84",
	unrealizedPnl: "-46.18",
	returnOnEquity: "-0.3366",
	liquidationPx: "7.27304",
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
		iconUrl: "https://assets.example/CXMT.svg",
		assetId: 120_031,
		szDecimals: 1,
		marginMode: "noCross",
	}),
} as unknown as Markets;

describe("MobilePositionCard isolated margin entry", () => {
	let container: HTMLDivElement;
	let root: Root;

	function expandPositionDetails(): void {
		const button = container.querySelector('button[aria-label^="Expand "]');
		if (!(button instanceof HTMLButtonElement)) throw new Error("Position details trigger was not rendered");
		act(() => button.click());
	}

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("keeps Reverse disabled while trading is blocked in the region but leaves Market Close available", () => {
		const onReverse = vi.fn();

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					markPriceStatus: "success",
					tpSlInfo: undefined,
					isRowClosing: false,
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse,
					reverseBlocked: true,
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket: vi.fn(),
				}),
			);
		});
		expandPositionDetails();
		const button = (label: string) =>
			[...container.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent === label);

		expect(button("Reverse")?.disabled).toBe(true);
		act(() => button("Reverse")?.click());
		expect(onReverse).not.toHaveBeenCalled();
		expect(button("Market Close")?.disabled).toBe(false);
	});

	it("opens the margin flow with the exact HIP-3 market identity", () => {
		const onAdjustMargin = vi.fn();

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					markPriceStatus: "success",
					tpSlInfo: undefined,
					isRowClosing: false,
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse: vi.fn(),
					reverseBlocked: false,
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin,
					onSelectMarket: vi.fn(),
				}),
			);
		});
		expandPositionDetails();
		const disclosureControls = container.querySelectorAll(
			'button[aria-label="Collapse CXMT (xyz) position details"][aria-controls]',
		);
		expect(disclosureControls).toHaveLength(1);
		expect(disclosureControls[0]?.getAttribute("aria-expanded")).toBe("true");

		const button = container.querySelector('button[aria-label="Adjust isolated margin for CXMT (xyz)"]');
		if (!(button instanceof HTMLButtonElement)) throw new Error("Isolated margin entry was not rendered");
		expect(button.className).toContain("after:h-11");
		expect(button.className).toContain("after:min-w-11");

		act(() => button.click());

		expect(onAdjustMargin).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			isLong: true,
			szDecimals: 1,
			marginConstraint: "noCross",
			marginUsed: "137.19",
			positionValue: "1559.84",
			liquidationPx: "7.27304",
		});
		expect(container.textContent).toContain("1,559.84 USDC");
		expect(container.textContent).toContain("$137.19");
		expect(container.textContent).toContain("(Isolated)");
		const tpSlButton = [...container.querySelectorAll("button")].find((element) =>
			element.textContent?.startsWith("TP/SL"),
		);
		expect(tpSlButton?.textContent).toContain("--/--");
		expect(tpSlButton?.className).toContain("after:h-11");
		expect(tpSlButton?.className).toContain("after:min-w-11");
	});

	it("preserves limit close, market close, and reverse actions in the expanded card", () => {
		const onMarketClose = vi.fn();
		const onReverse = vi.fn();
		const onLimitClose = vi.fn();

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					markPriceStatus: "success",
					tpSlInfo: undefined,
					isRowClosing: false,
					onMarketClose,
					onShare: vi.fn(),
					onReverse,
					reverseBlocked: false,
					onLimitClose,
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket: vi.fn(),
				}),
			);
		});
		expandPositionDetails();

		function getButton(label: string): HTMLButtonElement {
			const button = [...container.querySelectorAll("button")].find((element) => element.textContent?.trim() === label);
			if (!button) throw new Error(`${label} button was not rendered`);
			return button;
		}

		act(() => getButton("Limit Close").click());
		expect(onLimitClose).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			signedPositionSize: "205.9",
			entryPx: "7.79995",
			markPx: "7.5759",
			szDecimals: 1,
			marginMode: "isolated",
		});

		act(() => getButton("Market Close").click());
		expect(onMarketClose).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			szDecimals: 1,
			signedPositionSize: "205.9",
			markPx: "7.5759",
			marginMode: "isolated",
		});
		expect(container.textContent).not.toContain("Confirm Close");

		act(() => getButton("Reverse").click());
		expect(onReverse).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			signedPositionSize: "205.9",
			szDecimals: 1,
			marginMode: "isolated",
		});
	});

	it("orders expanded metrics like the official mobile position card", () => {
		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					markPriceStatus: "success",
					tpSlInfo: undefined,
					isRowClosing: false,
					expanded: true,
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse: vi.fn(),
					reverseBlocked: false,
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket: vi.fn(),
				}),
			);
		});

		const disclosure = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Collapse CXMT (xyz) position details"]',
		);
		const detailsId = disclosure?.getAttribute("aria-controls");
		const details = detailsId ? document.getElementById(detailsId) : null;
		const metrics = details?.querySelector<HTMLDivElement>(":scope > div.grid");
		if (!metrics) throw new Error("Expanded position metrics were not rendered");

		const labels = [...metrics.children].map((metric) => {
			const metricRoot = metric instanceof HTMLButtonElement ? metric.firstElementChild : metric;
			return metricRoot?.firstElementChild?.textContent;
		});
		expect(metrics.className).toContain("grid-cols-3");
		expect(labels).toEqual([
			"Entry Price",
			"Mark Price",
			"Liquidation Price",
			"Position Value",
			"Margin",
			"TP/SL",
			"Funding",
		]);
	});

	it("keeps close and reverse actions available without a toolbar mark", () => {
		const onMarketClose = vi.fn();
		const onLimitClose = vi.fn();
		const onReverse = vi.fn();
		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: undefined,
					markPriceStatus: "loading",
					tpSlInfo: undefined,
					isRowClosing: false,
					onMarketClose,
					onShare: vi.fn(),
					onReverse,
					reverseBlocked: false,
					onLimitClose,
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket: vi.fn(),
				}),
			);
		});
		expandPositionDetails();

		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		const marketClose = buttons.find((button) => button.textContent?.trim() === "Market Close");
		const limitClose = buttons.find((button) => button.textContent?.trim() === "Limit Close");
		const reverse = buttons.find((button) => button.textContent?.trim() === "Reverse");
		expect(marketClose?.disabled).toBe(false);
		expect(limitClose?.disabled).toBe(false);
		expect(reverse?.disabled).toBe(false);
		expect(container.querySelector('[aria-label="Loading..."]')).toBeNull();
		expect(container.querySelector('[aria-label^="Mark price is unavailable"]')).toBeNull();
		act(() => {
			marketClose?.click();
			limitClose?.click();
			reverse?.click();
		});
		expect(onMarketClose).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			szDecimals: 1,
			signedPositionSize: "205.9",
			marginMode: "isolated",
		});
		expect(onLimitClose).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			signedPositionSize: "205.9",
			entryPx: "7.79995",
			szDecimals: 1,
			marginMode: "isolated",
		});
		expect(onReverse).toHaveBeenCalledOnce();
	});

	it("keeps stale mark presentation quiet while close dialogs perform their own data checks", () => {
		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					markPriceStatus: "stale",
					tpSlInfo: undefined,
					isRowClosing: false,
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse: vi.fn(),
					reverseBlocked: false,
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket: vi.fn(),
				}),
			);
		});
		expandPositionDetails();

		expect(container.querySelector('[aria-label^="Mark price is unavailable"]')).toBeNull();
		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		expect(buttons.find((button) => button.textContent?.trim() === "Market Close")?.disabled).toBe(false);
		expect(buttons.find((button) => button.textContent?.trim() === "Limit Close")?.disabled).toBe(false);
	});

	it("keeps the mobile summary compact until the user expands the position", () => {
		const onExpandedChange = vi.fn();
		const onSelectMarket = vi.fn();

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					markPriceStatus: "success",
					tpSlInfo: undefined,
					isRowClosing: false,
					expanded: false,
					onExpandedChange,
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse: vi.fn(),
					reverseBlocked: false,
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket,
				}),
			);
		});

		expect(container.textContent).toContain("205.9 CXMT");
		expect(container.textContent).toContain("10x");
		expect(container.textContent).toContain("Long 10x");
		expect(container.querySelector('[data-testid="position-asset-logo"]')).toBeNull();
		expect(container.querySelector('button[aria-label="Adjust isolated margin for CXMT (xyz)"]')).toBeNull();

		const marketButton = container.querySelector('button[aria-label="Switch to CXMT (xyz) market, long position"]');
		if (!(marketButton instanceof HTMLButtonElement)) throw new Error("Market identity button was not rendered");
		expect(marketButton.className).toContain("after:h-11");
		expect(marketButton.className).toContain("after:min-w-11");
		act(() => marketButton.click());
		expect(onSelectMarket).toHaveBeenCalledWith("xyz:CXMT", "buy");

		const expandButton = container.querySelector('button[aria-label="Expand CXMT (xyz) position details"]');
		if (!(expandButton instanceof HTMLButtonElement)) throw new Error("Position details trigger was not rendered");

		act(() => expandButton.click());

		expect(onExpandedChange).toHaveBeenCalledWith(true);
	});

	it("wraps long market and PNL values without hiding the position summary", () => {
		const longMarketPosition: Position = {
			...isolatedPosition,
			coin: "xyz:BRENTOIL",
			szi: "-2",
			unrealizedPnl: "-159.41",
			returnOnEquity: "-0.22",
			leverage: { type: "cross", value: 20 },
		};
		const longNameMarkets = {
			getMarket: () => ({
				kind: "builderPerp",
				name: "xyz:BRENTOIL",
				shortName: "BRENTOIL",
				pairName: "BRENTOIL-USDC",
				iconUrl: "https://assets.example/BRENTOIL.svg",
				assetId: 120_032,
				szDecimals: 2,
				marginMode: "noCross",
			}),
		} as unknown as Markets;

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: longMarketPosition,
					env: "Mainnet",
					isDataStale: false,
					markets: longNameMarkets,
					markPx: "83.528",
					markPriceStatus: "success",
					tpSlInfo: undefined,
					isRowClosing: false,
					expanded: false,
					onExpandedChange: vi.fn(),
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse: vi.fn(),
					reverseBlocked: false,
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket: vi.fn(),
				}),
			);
		});

		const marketButton = container.querySelector(
			'button[aria-label="Switch to BRENTOIL (xyz) market, short position"]',
		);
		if (!(marketButton instanceof HTMLButtonElement)) throw new Error("Long market identity button was not rendered");
		expect(marketButton.className).toContain("flex-wrap");

		const marketName = [...marketButton.children].find((element) => element.textContent === "BRENTOIL");
		if (!(marketName instanceof HTMLElement)) throw new Error("Long market name was not rendered");
		expect(marketName.className).toContain("shrink-0");
		expect(marketName.className).toContain("break-words");
		expect(marketName.className).not.toContain("truncate");
		for (const label of ["Market", "Size", "PNL (ROE %)"]) {
			const labelElement = [...container.querySelectorAll<HTMLElement>("div")].find(
				(element) => element.children.length === 0 && element.textContent === label,
			);
			if (!(labelElement instanceof HTMLElement)) throw new Error(`${label} summary label was not rendered`);
			expect(labelElement.className).toContain("whitespace-normal");
			expect(labelElement.className).not.toContain("truncate");
		}

		const titledValues = [...container.querySelectorAll<HTMLElement>("[title]")];
		const sizeValue = titledValues.find((element) => element.textContent?.trim() === "2.00 BRENTOIL");
		if (!(sizeValue instanceof HTMLElement)) throw new Error("Long position size was not rendered");
		expect(sizeValue.className).toContain("whitespace-normal");
		expect(sizeValue.className).not.toContain("truncate");

		const pnlValue = titledValues.find(
			(element) => element.textContent?.includes("-$159.41") && element.textContent.includes("-22.0%"),
		);
		if (!(pnlValue instanceof HTMLElement)) throw new Error("Long position PNL was not rendered");
		expect(pnlValue.textContent).toBe("-$159.41 (-22.0%)");
		expect(pnlValue.className).toContain("flex-wrap");
		expect(pnlValue.className).not.toContain("truncate");
		expect([...pnlValue.children]).toHaveLength(2);
		expect([...pnlValue.children].every((element) => element.className.includes("shrink-0"))).toBe(true);

		const summary = marketButton.closest("div.grid");
		if (!(summary instanceof HTMLDivElement)) throw new Error("Position summary was not rendered");
		expect(summary.className).toContain("items-start");
		expect(summary.className).toContain("[&>svg]:self-center");
		const shareButton = container.querySelector<HTMLButtonElement>('button[aria-label="Share PNL for BRENTOIL (xyz)"]');
		expect(shareButton).not.toBeNull();
		expect(shareButton?.className).toContain("size-11");
		expect(shareButton?.className).not.toContain("after:size-11");
	});

	it("does not expose the entry for cross-margin positions", () => {
		const onAdjustMargin = vi.fn();

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: {
						...isolatedPosition,
						leverage: { type: "cross", value: 10 },
					},
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					markPriceStatus: "success",
					tpSlInfo: undefined,
					isRowClosing: false,
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse: vi.fn(),
					reverseBlocked: false,
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin,
					onSelectMarket: vi.fn(),
				}),
			);
		});

		expect(container.querySelector('button[aria-label="Adjust isolated margin for CXMT (xyz)"]')).toBeNull();
	});

	it("disables every position mutation while a market close is pending", () => {
		const onMarketClose = vi.fn();
		const onLimitClose = vi.fn();
		const onReverse = vi.fn();
		const onOpenTpSl = vi.fn();
		const onAdjustMargin = vi.fn();

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					markPriceStatus: "success",
					tpSlInfo: undefined,
					isRowClosing: true,
					expanded: true,
					onMarketClose,
					onShare: vi.fn(),
					onReverse,
					reverseBlocked: false,
					onLimitClose,
					onOpenTpSl,
					onAdjustMargin,
					onSelectMarket: vi.fn(),
				}),
			);
		});

		const namedLabels = ["Adjust isolated margin for CXMT (xyz)", "Limit Close", "Market Close", "Reverse"];
		const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
		for (const label of namedLabels) {
			const button = buttons.find(
				(candidate) => candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label,
			);
			expect(button?.disabled, label).toBe(true);
			act(() => button?.click());
		}
		const tpSlButton = buttons.find((candidate) => candidate.textContent?.trim().startsWith("TP/SL"));
		expect(tpSlButton?.disabled, "TP/SL").toBe(true);
		act(() => tpSlButton?.click());

		expect(onMarketClose).not.toHaveBeenCalled();
		expect(onLimitClose).not.toHaveBeenCalled();
		expect(onReverse).not.toHaveBeenCalled();
		expect(onOpenTpSl).not.toHaveBeenCalled();
		expect(onAdjustMargin).not.toHaveBeenCalled();
	});

	it("names TP/SL and footer actions with full market and DEX identity across same-symbol positions", () => {
		const flxPosition: Position = {
			...isolatedPosition,
			dex: "flx",
			coin: "flx:CXMT",
		};
		const multiDexMarkets = {
			getMarket: (coin: string) =>
				coin === "flx:CXMT"
					? {
							kind: "builderPerp",
							dex: "flx",
							name: "flx:CXMT",
							shortName: "CXMT",
							pairName: "CXMT-USDC",
							assetId: 130_031,
							szDecimals: 1,
							marginMode: "noCross",
						}
					: {
							kind: "builderPerp",
							dex: "xyz",
							name: "xyz:CXMT",
							shortName: "CXMT",
							pairName: "CXMT-USDC",
							assetId: 120_031,
							szDecimals: 1,
							marginMode: "noCross",
						},
		} as unknown as Markets;
		const onOpenTpSl = vi.fn();
		const onLimitClose = vi.fn();
		const onMarketClose = vi.fn();
		const onReverse = vi.fn();

		act(() => {
			root.render(
				<div>
					<MobilePositionCard
						position={isolatedPosition}
						env="Mainnet"
						isDataStale={false}
						markets={multiDexMarkets}
						markPx="7.5759"
						markPriceStatus="success"
						tpSlInfo={{ tpPrice: "9.5", slPrice: "6.5" }}
						isRowClosing={false}
						expanded
						onMarketClose={onMarketClose}
						onShare={vi.fn()}
						onReverse={onReverse}
						reverseBlocked={false}
						onLimitClose={onLimitClose}
						onOpenTpSl={onOpenTpSl}
						onAdjustMargin={vi.fn()}
						onSelectMarket={vi.fn()}
					/>
					<MobilePositionCard
						position={flxPosition}
						env="Mainnet"
						isDataStale={false}
						markets={multiDexMarkets}
						markPx="7.5759"
						markPriceStatus="success"
						tpSlInfo={{ tpPrice: "10.0", slPrice: "6.0" }}
						isRowClosing={false}
						expanded
						onMarketClose={onMarketClose}
						onShare={vi.fn()}
						onReverse={onReverse}
						reverseBlocked={false}
						onLimitClose={onLimitClose}
						onOpenTpSl={onOpenTpSl}
						onAdjustMargin={vi.fn()}
						onSelectMarket={vi.fn()}
					/>
				</div>,
			);
		});

		for (const dex of ["xyz", "flx"]) {
			const tpSl = container.querySelector<HTMLButtonElement>(`button[aria-label="TP/SL for CXMT (${dex})"]`);
			expect(tpSl, `TP/SL ${dex}`).not.toBeNull();
			const describedBy = tpSl?.getAttribute("aria-describedby");
			expect(describedBy, `TP/SL aria-describedby ${dex}`).toBeTruthy();
			expect(describedBy ? document.getElementById(describedBy)?.textContent : null).toContain("/");
			expect(container.querySelector(`button[aria-label="Limit Close CXMT (${dex})"]`)).not.toBeNull();
			expect(container.querySelector(`button[aria-label="Market Close CXMT (${dex})"]`)).not.toBeNull();
			expect(container.querySelector(`button[aria-label="Reverse CXMT (${dex}) position"]`)).not.toBeNull();
		}

		act(() => {
			container.querySelector<HTMLButtonElement>('button[aria-label="TP/SL for CXMT (flx)"]')?.click();
			container.querySelector<HTMLButtonElement>('button[aria-label="Limit Close CXMT (flx)"]')?.click();
			container.querySelector<HTMLButtonElement>('button[aria-label="Market Close CXMT (flx)"]')?.click();
			container.querySelector<HTMLButtonElement>('button[aria-label="Reverse CXMT (flx) position"]')?.click();
		});
		expect(onOpenTpSl).toHaveBeenCalledWith(
			expect.objectContaining({ coin: "flx:CXMT", dex: "flx", assetId: 130_031 }),
		);
		expect(onLimitClose).toHaveBeenCalledWith(
			expect.objectContaining({ coin: "flx:CXMT", dex: "flx", assetId: 130_031 }),
		);
		expect(onMarketClose).toHaveBeenCalledWith(
			expect.objectContaining({ coin: "flx:CXMT", dex: "flx", assetId: 130_031 }),
		);
		expect(onReverse).toHaveBeenCalledWith(expect.objectContaining({ coin: "flx:CXMT", dex: "flx", assetId: 130_031 }));
	});
});
