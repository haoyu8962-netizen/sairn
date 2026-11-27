// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { LeaderboardView, type LeaderboardViewProps } from "../leaderboard-view";

const mocks = vi.hoisted(() => ({
	isMobile: false,
	numberFormatLocale: "en-US",
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mocks.isMobile }));
vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => mocks.numberFormatLocale,
}));

function createProps(overrides: Partial<LeaderboardViewProps> = {}): LeaderboardViewProps {
	return {
		pageState: "normal",
		dataNotice: null,
		period: "month",
		sortKey: "pnl",
		sortDirection: "descending",
		query: "",
		rowsPerPage: 10,
		rows: [
			{
				rank: 1,
				address: "0x1111111111111111111111111111111111111111",
				displayName: "VeryLongUnbrokenTraderDisplayNameWithoutAnySpaces1234567890",
				accountValue: "2450000",
				pnl: "185000",
				roi: "0.25",
				volume: "18000000",
				prize: 0,
				pnlTone: "positive",
				roiTone: "positive",
				href: "https://app.hyperliquid.xyz/explorer/address/0x1111111111111111111111111111111111111111",
			},
		],
		totalRows: 1250,
		totalPages: 125,
		page: 1,
		start: 1,
		end: 10,
		isRefreshing: false,
		canRetry: true,
		onPeriodChange: vi.fn(),
		onQueryChange: vi.fn(),
		onClearQuery: vi.fn(),
		onSort: vi.fn(),
		onRowsPerPageChange: vi.fn(),
		onPreviousPage: vi.fn(),
		onNextPage: vi.fn(),
		onRetry: vi.fn(),
		...overrides,
	};
}

describe("LeaderboardView", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.isMobile = false;
		mocks.numberFormatLocale = "en-US";
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

	function render(props: LeaderboardViewProps) {
		act(() => root.render(<LeaderboardView {...props} />));
	}

	it("keeps horizontal scrolling and a named scroll region on the desktop table", () => {
		render(createProps());
		const scrollContainer = container.querySelector<HTMLDivElement>('[data-slot="table-scroll-container"]');
		expect(scrollContainer).not.toBeNull();
		expect(scrollContainer?.className).toContain("overflow-x-auto");
		expect(scrollContainer?.className).not.toContain("overflow-visible");

		if (scrollContainer) {
			Object.defineProperty(scrollContainer, "scrollWidth", { configurable: true, value: 1200 });
			Object.defineProperty(scrollContainer, "clientWidth", { configurable: true, value: 800 });
		}
		render(createProps());
		const scrollRegion = container.querySelector<HTMLDivElement>('[data-slot="table-scroll-container"]');
		expect(scrollRegion?.className).toContain("focus-visible:outline-stroke-focus");
	});

	it("allows the mobile sort bar to wrap without clipping narrow labels", () => {
		mocks.isMobile = true;
		render(createProps());
		const rankedByLabel = [...container.querySelectorAll("p")].find((node) => node.textContent?.trim() === "Ranked by");
		expect(rankedByLabel).toBeDefined();
		const sortBar = rankedByLabel?.parentElement;
		expect(sortBar?.className).toContain("flex-wrap");
		const controls = sortBar?.querySelector("div");
		expect(controls?.className).toContain("max-w-full");
		expect(controls?.className).toContain("min-w-0");
	});

	it("keeps desktop sort and pagination controls mounted and preserves focus during page loading", () => {
		const initialProps = createProps();
		render(initialProps);

		const nextButton = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
		expect(nextButton).not.toBeNull();
		nextButton?.focus();
		expect(document.activeElement).toBe(nextButton);

		render(createProps({ pageState: "loading", rows: [], page: 2, totalRows: 0, start: 0, end: 0 }));
		const nextButtonWhileLoading = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
		expect(nextButtonWhileLoading).toBe(nextButton);
		expect(document.activeElement).toBe(nextButton);
		expect(nextButtonWhileLoading?.getAttribute("aria-disabled")).toBe("true");

		const sortButton = [...container.querySelectorAll<HTMLButtonElement>("thead button")].find((button) =>
			button.textContent?.includes("Account Value"),
		);
		expect(sortButton).toBeDefined();
		sortButton?.focus();
		expect(document.activeElement).toBe(sortButton);

		render(createProps({ page: 2, start: 11, end: 20 }));
		expect(document.activeElement).toBe(sortButton);
	});

	it("keeps mobile pagination controls mounted and preserves focus during page loading", () => {
		mocks.isMobile = true;
		render(createProps());

		const nextButton = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
		expect(nextButton).not.toBeNull();
		nextButton?.focus();
		expect(document.activeElement).toBe(nextButton);

		render(createProps({ pageState: "loading", rows: [], page: 2, totalRows: 0, start: 0, end: 0 }));
		expect(container.querySelector('button[aria-label="Next page"]')).toBe(nextButton);
		expect(document.activeElement).toBe(nextButton);
	});

	it("adds touch press feedback to trader links on mobile and desktop", () => {
		mocks.isMobile = true;
		render(createProps());
		const link = container.querySelector<HTMLAnchorElement>('a[href*="/explorer/address/"]');
		expect(link).not.toBeNull();
		expect(link?.className).toMatch(/active:(opacity-60|bg-fill-weak)/);
	});

	it("formats pagination counts with the active number format and isolates the range direction", () => {
		render(createProps({ start: 1001, end: 1010, totalRows: 1250 }));
		const rangeBdi = [...container.querySelectorAll<HTMLElement>('bdi[dir="ltr"]')].find((node) =>
			node.textContent?.includes("1,250"),
		);
		expect(rangeBdi?.textContent).toBe("1,001–1,010 / 1,250");

		mocks.numberFormatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(rangeBdi?.textContent).toBe("1.001–1.010 / 1.250");
	});

	it("keeps desktop sort and pagination controls mounted and preserves focus across error, paused, empty, and noResults states", () => {
		render(createProps({ page: 2, totalPages: 5, start: 11, end: 20 }));

		const sortButton = [...container.querySelectorAll<HTMLButtonElement>("thead button")].find((button) =>
			button.textContent?.includes("Account Value"),
		);
		expect(sortButton).toBeDefined();
		sortButton?.focus();
		expect(document.activeElement).toBe(sortButton);

		for (const pageState of ["loading", "error", "paused", "empty", "noResults"] as const) {
			render(createProps({ pageState, rows: [], page: 2, totalRows: 0, totalPages: 1, start: 0, end: 0 }));
			const currentSortButton = [...container.querySelectorAll<HTMLButtonElement>("thead button")].find((button) =>
				button.textContent?.includes("Account Value"),
			);
			expect(currentSortButton).toBe(sortButton);
			expect(document.activeElement).toBe(sortButton);
		}

		render(createProps({ page: 2, totalPages: 5, start: 11, end: 20 }));
		const nextButton = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
		expect(nextButton).not.toBeNull();
		nextButton?.focus();
		expect(document.activeElement).toBe(nextButton);

		for (const pageState of ["loading", "error", "paused", "empty", "noResults"] as const) {
			render(createProps({ pageState, rows: [], page: 2, totalRows: 0, totalPages: 1, start: 0, end: 0 }));
			expect(container.querySelector('button[aria-label="Next page"]')).toBe(nextButton);
			expect(document.activeElement).toBe(nextButton);
		}
	});

	it("keeps mobile sort and pagination controls mounted and preserves focus across error, paused, empty, and noResults states", () => {
		mocks.isMobile = true;
		render(createProps({ page: 2, totalPages: 5, start: 11, end: 20 }));

		const sortDirectionButton = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Change to ascending order"]',
		);
		expect(sortDirectionButton).not.toBeNull();
		sortDirectionButton?.focus();
		expect(document.activeElement).toBe(sortDirectionButton);

		for (const pageState of ["loading", "error", "paused", "empty", "noResults"] as const) {
			render(createProps({ pageState, rows: [], page: 2, totalRows: 0, totalPages: 1, start: 0, end: 0 }));
			expect(container.querySelector('button[aria-label="Change to ascending order"]')).toBe(sortDirectionButton);
			expect(document.activeElement).toBe(sortDirectionButton);
		}

		render(createProps({ page: 2, totalPages: 5, start: 11, end: 20 }));
		const nextButton = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
		expect(nextButton).not.toBeNull();
		nextButton?.focus();
		expect(document.activeElement).toBe(nextButton);

		for (const pageState of ["loading", "error", "paused", "empty", "noResults"] as const) {
			render(createProps({ pageState, rows: [], page: 2, totalRows: 0, totalPages: 1, start: 0, end: 0 }));
			expect(container.querySelector('button[aria-label="Next page"]')).toBe(nextButton);
			expect(document.activeElement).toBe(nextButton);
		}
	});

	it("formats rank numbers with the active number format and LTR isolation on desktop and mobile", () => {
		const rows = [
			createProps().rows[0],
			{
				...createProps().rows[0],
				rank: 1250,
				address: "0x2222222222222222222222222222222222222222",
				displayName: "Rank1250Trader",
			},
		];

		for (const isMobile of [false, true]) {
			mocks.isMobile = isMobile;
			mocks.numberFormatLocale = "en-US";
			render(createProps({ rows }));

			const rankBdi = [...container.querySelectorAll<HTMLElement>('bdi[dir="ltr"]')].find(
				(node) => node.textContent === "#1,250",
			);
			expect(rankBdi).toBeDefined();
			expect(container.textContent).not.toContain("#1250");
			const topRankBdi = [...container.querySelectorAll<HTMLElement>('bdi[dir="ltr"]')].find(
				(node) => node.textContent === "#1",
			);
			expect(topRankBdi?.parentElement?.className).toContain("text-warning");

			mocks.numberFormatLocale = "de-DE";
			act(() => notifyNumberFormatChange());
			expect(rankBdi?.textContent).toBe("#1.250");
		}
	});

	it("exposes a localized named scroll region only while the desktop leaderboard overflows and reacts to resize", () => {
		let widths = { clientWidth: 800, scrollWidth: 800 };
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
			render(createProps());
			const scrollRegion = container.querySelector<HTMLDivElement>('[data-slot="table-scroll-container"]');
			expect(scrollRegion).not.toBeNull();
			expect(scrollRegion?.hasAttribute("role")).toBe(false);
			expect(scrollRegion?.hasAttribute("aria-label")).toBe(false);
			expect(scrollRegion?.tabIndex).toBe(-1);

			widths = { clientWidth: 800, scrollWidth: 1200 };
			act(() => {
				for (const callback of callbacks) callback([], {} as ResizeObserver);
			});
			expect(scrollRegion?.getAttribute("role")).toBe("region");
			expect(scrollRegion?.getAttribute("aria-label")).toBe("Leaderboard");
			expect(scrollRegion?.tabIndex).toBe(0);

			act(() =>
				i18n.loadAndActivate({
					locale: "zh",
					messages: {
						[createHash("sha256").update("Leaderboard\x1f").digest("base64").slice(0, 6)]: "排行榜",
					},
				}),
			);
			expect(scrollRegion?.getAttribute("role")).toBe("region");
			expect(scrollRegion?.getAttribute("aria-label")).toBe("排行榜");
			expect(scrollRegion?.tabIndex).toBe(0);

			widths = { clientWidth: 1200, scrollWidth: 1200 };
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
