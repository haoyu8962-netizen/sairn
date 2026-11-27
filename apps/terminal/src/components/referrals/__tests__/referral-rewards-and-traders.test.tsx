// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralRewardsCard } from "@/components/referrals/referral-rewards-card";
import { ReferredTraders } from "@/components/referrals/referred-traders";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "@/lib/tests/harness/react";
import type { ReferralRewardRow, ReferredTrader } from "@/lib/trade/referral";

const mocks = vi.hoisted(() => ({ formatLocale: "en-US" }));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => mocks.formatLocale,
}));

vi.mock("@/components/trade/mobile/mobile-progressive-list", () => ({
	MobileProgressiveList: ({
		items,
		children,
	}: {
		items: ReferredTrader[];
		children: (visible: ReferredTrader[]) => React.ReactNode;
	}) => children(items.slice(0, 1)),
}));

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

function createTrader(index: number): ReferredTrader {
	return {
		user: `0x${String(index + 1).padStart(40, "0")}`,
		timeJoined: 1_725_000_000_000,
		cumVlm: "1000.5",
		cumRewardedFeesSinceReferred: "1.25",
		cumFeesRewardedToReferrer: "2.5",
		tokenToState: [
			[
				7,
				{
					cumVlm: "1000.5",
					cumRewardedFeesSinceReferred: "1.25",
					cumFeesRewardedToReferrer: "2.5",
				},
			],
		],
	};
}

describe("ReferralRewardsCard and ReferredTraders", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.formatLocale = "en-US";
		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
	});

	it("wraps long reward amounts and translates token labels in ReferralRewardsCard", () => {
		const rewards: ReferralRewardRow[] = [
			{
				tokenId: 7,
				name: null,
				weiDecimals: 8,
				cumVlm: "1000000",
				unclaimedRewards: "123456789.12345678",
				claimedRewards: "987654321.87654321",
				builderRewards: "1111111111.11111111",
			},
		];

		act(() => root.render(<ReferralRewardsCard rewards={rewards} snapshotCurrent onRetry={vi.fn()} />));

		const row = container.querySelector(".divide-y > div");
		expect(row?.className).toContain("grid-cols-1");
		const amountNodes = [...container.querySelectorAll("p.tabular-nums")];
		expect(amountNodes).toHaveLength(3);
		for (const node of amountNodes) {
			expect(node.className).toMatch(/break-words|wrap-anywhere|overflow-wrap:anywhere/);
			expect(node.parentElement?.className).toContain("min-w-0");
		}
		const detailsSummary = container.querySelector("details > summary");
		expect(detailsSummary?.className).toContain("active:bg-fill-weak");

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: {
					[messageId("Token #{tokenId}")]: "代币 #{tokenId}",
				},
			}),
		);
		expect(container.textContent).toContain("代币 #7");
		expect(container.textContent).not.toContain("Token #7");
	});

	it("gives ReferredTraders a named scroll region, press feedback, translated fallback tokens, and formatted pagination", () => {
		const firstPage = Array.from({ length: 25 }, (_, index) => createTrader(index));
		const filler = createTrader(99);
		const traders = [...firstPage, ...Array<ReferredTrader>(24_975).fill(filler)];
		act(() => root.render(<ReferredTraders traders={traders} tokenMetadata={null} />));

		const scrollContainer = container.querySelector<HTMLDivElement>('[data-slot="table-scroll-container"]');
		expect(scrollContainer?.className).toContain("focus-visible:outline-stroke-focus");

		const summary = container.querySelector("details > summary");
		expect(summary?.className).toContain("active:bg-fill-weak");

		const paginationText = container.querySelector('nav[aria-label="Referred traders pages"] p');
		expect(paginationText?.textContent).toBe("Page 1 of 1,000");

		mocks.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(paginationText?.textContent).toBe("Page 1 of 1.000");

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: {
					[messageId("Token #{tokenId}")]: "代币 #{tokenId}",
				},
			}),
		);
		expect(container.textContent).toContain("代币 #7");
		expect(container.textContent).not.toContain("Token #7");
	});

	it("exposes a localized named scroll region on ReferredTraders only when overflowing and reacts to resize", () => {
		let widths = { clientWidth: 900, scrollWidth: 900 };
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
			return this.dataset.slot === "table-scroll-container" ? widths.clientWidth : 0;
		});
		vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
			return this.dataset.slot === "table-scroll-container" ? widths.scrollWidth : 0;
		});

		const callbacks = new Set<ResizeObserverCallback>();
		const originalResizeObserver = globalThis.ResizeObserver;
		class MockResizeObserver {
			private callback: ResizeObserverCallback;
			constructor(callback: ResizeObserverCallback) {
				this.callback = callback;
				callbacks.add(callback);
			}
			observe() {}
			unobserve() {}
			disconnect() {
				callbacks.delete(this.callback);
			}
		}
		globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

		try {
			act(() => root.render(<ReferredTraders traders={[createTrader(0)]} tokenMetadata={null} />));
			const scrollRegion = container.querySelector<HTMLDivElement>('[data-slot="table-scroll-container"]');
			expect(scrollRegion).not.toBeNull();
			expect(scrollRegion?.hasAttribute("role")).toBe(false);
			expect(scrollRegion?.hasAttribute("aria-label")).toBe(false);
			expect(scrollRegion?.tabIndex).toBe(-1);

			widths = { clientWidth: 600, scrollWidth: 1100 };
			act(() => {
				for (const callback of callbacks) callback([], {} as ResizeObserver);
			});
			expect(scrollRegion?.getAttribute("role")).toBe("region");
			expect(scrollRegion?.getAttribute("aria-label")).toBe("Referred traders");
			expect(scrollRegion?.tabIndex).toBe(0);

			act(() =>
				i18n.loadAndActivate({
					locale: "zh",
					messages: {
						[messageId("Referred traders")]: "受邀交易者",
					},
				}),
			);
			expect(scrollRegion?.getAttribute("role")).toBe("region");
			expect(scrollRegion?.getAttribute("aria-label")).toBe("受邀交易者");
			expect(scrollRegion?.tabIndex).toBe(0);

			widths = { clientWidth: 1100, scrollWidth: 1100 };
			act(() => {
				for (const callback of callbacks) callback([], {} as ResizeObserver);
			});
			expect(scrollRegion?.hasAttribute("role")).toBe(false);
			expect(scrollRegion?.hasAttribute("aria-label")).toBe(false);
			expect(scrollRegion?.tabIndex).toBe(-1);
		} finally {
			globalThis.ResizeObserver = originalResizeObserver;
		}
	});
});
