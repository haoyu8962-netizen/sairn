// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundingHistoryPage } from "@/components/funding-history/funding-history-page";
import { formatDateTime, formatDateTimeShort } from "@/lib/format";
import type { UserFunding } from "@/lib/trade/user-funding";

const ADDRESS = "0x1111111111111111111111111111111111111111";

const mocks = vi.hoisted(() => ({
	buildRows: undefined as ((fundings: UserFunding[]) => string[][]) | undefined,
	exportAddress: undefined as `0x${string}` | undefined,
	exportCsv: vi.fn(),
	history: {
		error: null as unknown,
		fundings: [] as UserFunding[],
		isOffline: false,
		isRefreshing: false,
		rangeEndTime: 1_800_000_000_000 as number | null,
		rangeStartTime: (1_800_000_000_000 - 30 * 24 * 60 * 60 * 1000) as number | null,
		refresh: vi.fn(),
		status: "ready" as "disabled" | "error" | "loading" | "offline" | "ready",
	},
	markets: {} as Record<string, unknown>,
}));

vi.mock("@sairn/ui", () => ({
	buttonVariants: () => "",
	Button: ({ children, disabled, onClick }: { children?: ReactNode; disabled?: boolean; onClick?: () => void }) => (
		<button type="button" disabled={disabled} onClick={onClick}>
			{children}
		</button>
	),
	Pagination: ({
		currentPage,
		getPageLabel,
		nextPageLabel,
		nextText,
		onPageChange,
		previousText,
		totalPages,
	}: {
		currentPage: number;
		getPageLabel?: (page: number) => string;
		nextPageLabel: string;
		nextText?: ReactNode;
		onPageChange?: (page: number) => void;
		previousText?: ReactNode;
		totalPages: number;
	}) => (
		<nav data-testid="pagination" data-page-label={getPageLabel?.(currentPage)}>
			<span data-testid="pagination-previous">{previousText}</span>
			<button
				type="button"
				aria-label={nextPageLabel}
				disabled={currentPage >= totalPages}
				onClick={() => onPageChange?.(currentPage + 1)}
			>
				{nextText}
			</button>
		</nav>
	),
	Select: ({
		label,
		onValueChange,
		options,
		triggerAriaLabel,
		value,
	}: {
		label?: string;
		onValueChange?: (value: string | null) => void;
		options: Array<{ label: string; value: string }>;
		triggerAriaLabel?: string;
		value?: string | null;
	}) => (
		<label>
			{label}
			<select
				aria-label={triggerAriaLabel}
				value={value ?? ""}
				onChange={(event) => onValueChange?.(event.target.value)}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	),
	Table: ({ scrollableRegionLabel, ...props }: ComponentProps<"table"> & { scrollableRegionLabel?: string }) => (
		<table aria-label={scrollableRegionLabel} {...props} />
	),
	TableBody: (props: ComponentProps<"tbody">) => <tbody {...props} />,
	TableCell: (props: ComponentProps<"td">) => <td {...props} />,
	TableHead: (props: ComponentProps<"th">) => <th {...props} />,
	TableHeader: (props: ComponentProps<"thead">) => <thead {...props} />,
	TableRow: (props: ComponentProps<"tr">) => <tr {...props} />,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children?: ReactNode }) => <a href="/trade">{children}</a>,
}));

vi.mock("@/components/trade/components/asset-badge", () => ({
	AssetBadge: ({ coin, onClick }: { coin: string; onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
			{coin}
		</button>
	),
}));

vi.mock("@/components/trade/header/top-nav", () => ({ TopNav: () => null }));
vi.mock("@/components/trade/mobile/mobile-header", () => ({ MobileHeader: () => null }));
vi.mock("@/components/trade/testnet-banner", () => ({ TestnetBanner: () => null }));
vi.mock("@/hooks/trade/use-funding-history", () => ({ useFundingHistory: () => mocks.history }));
vi.mock("@/hooks/trade/use-history-csv-export", () => ({
	useFundingHistoryCsvExport: ({
		address,
		buildRows,
	}: {
		address?: `0x${string}`;
		buildRows: (fundings: UserFunding[]) => string[][];
	}) => {
		mocks.exportAddress = address;
		mocks.buildRows = buildRows;
		return { exportCsv: mocks.exportCsv, isExporting: false };
	},
}));
vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/hyperliquid", () => ({ useMarkets: () => ({ getMarket: (coin: string) => mocks.markets[coin] }) }));
vi.mock("@/lib/lazy", () => ({ createLazyComponent: () => () => null }));
vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	useIsTestnet: () => false,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { serializeCsv } from "@/lib/csv";

const ZH_PAGINATION_MESSAGES = Object.fromEntries(
	[
		["Previous", "上一页"],
		["Next", "下一页"],
		["Page {page}", "第 {page} 页"],
	].map(([message, translation]) => [
		createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6),
		translation,
	]),
);

function paginationLabels(container: HTMLElement) {
	const pagination = container.querySelector('[data-testid="pagination"]');
	return [
		pagination?.querySelector('[data-testid="pagination-previous"]')?.textContent,
		pagination?.querySelector("button")?.textContent,
		pagination?.getAttribute("data-page-label"),
	];
}

function createFunding(index: number): UserFunding {
	const isEth = index >= 26;
	return {
		coin: isEth ? "ETH" : "BTC",
		fundingRate: "0.0001",
		nSamples: null,
		szi: isEth ? "-1" : "1",
		time: 1_800_000_000_000 - index,
		usdc: isEth ? "-0.1" : "0.1",
	};
}

describe("FundingHistoryPage", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.history.error = null;
		mocks.history.fundings = Array.from({ length: 30 }, (_, index) => createFunding(index));
		mocks.history.isOffline = false;
		mocks.history.isRefreshing = false;
		mocks.history.rangeEndTime = 1_800_000_000_000;
		mocks.history.rangeStartTime = 1_800_000_000_000 - 30 * 24 * 60 * 60 * 1000;
		mocks.history.refresh.mockReset();
		mocks.history.status = "ready";
		mocks.exportAddress = undefined;
		mocks.exportCsv.mockReset();
		mocks.markets = {};
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderPage() {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<FundingHistoryPage address={ADDRESS} />
				</I18nProvider>,
			),
		);
	}

	it("labels the pagination controls in the active language", () => {
		renderPage();
		expect(paginationLabels(container)).toEqual(["Previous", "Next", "Page 1"]);

		act(() => i18n.loadAndActivate({ locale: "zh", messages: ZH_PAGINATION_MESSAGES }));

		expect(paginationLabels(container)).toEqual(["上一页", "下一页", "第 1 页"]);
	});

	it("rewrites the loaded range in the active language without remounting the page", () => {
		const start = mocks.history.rangeStartTime ?? 0;
		const end = mocks.history.rangeEndTime ?? 0;
		const rangeIn = (locale: string) =>
			`${formatDateTimeShort(start, { locale })} – ${formatDateTimeShort(end, { locale })}`;
		renderPage();
		const page = container.firstElementChild;
		expect(container.textContent).toContain(rangeIn("en"));

		act(() => i18n.loadAndActivate({ locale: "zh", messages: ZH_PAGINATION_MESSAGES }));

		expect(container.firstElementChild).toBe(page);
		expect(rangeIn("zh")).not.toBe(rangeIn("en"));
		expect(container.textContent).toContain(rangeIn("zh"));
	});

	it("paginates 25 rows locally and resets to page one when filtering without refreshing", () => {
		renderPage();

		expect(container.querySelectorAll("tbody tr")).toHaveLength(25);
		expect(container.textContent).toContain("1–25 / 30");

		const nextPage = container.querySelector<HTMLButtonElement>('button[aria-label="Next funding payments page"]');
		act(() => nextPage?.click());
		expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
		expect(container.textContent).toContain("26–30 / 30");

		const marketFilter = container.querySelector<HTMLSelectElement>(
			'select[aria-label="Filter funding payments by market"]',
		);
		if (!marketFilter) throw new Error("Missing market filter");
		act(() => {
			marketFilter.value = "ETH";
			marketFilter.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
		expect(container.textContent).toContain("1–4 / 4");
		expect(mocks.history.refresh).not.toHaveBeenCalled();
	});

	it("P2-5 applies market and direction to all downloaded funding pages", () => {
		renderPage();
		selectFilter("Filter funding payments by market", "ETH");
		selectFilter("Filter funding payments by side", "short");
		const older = { ...createFunding(27), time: 100 };
		const rows = mocks.buildRows?.([createFunding(0), { ...older, szi: "1" }, older]);
		expect(rows?.slice(1)).toHaveLength(1);
		expect(rows?.[1]?.slice(1, 3)).toEqual(["ETH", "Short"]);
	});

	it("P2-7 preserves funding size digits, the payment and the protocol collateral in CSV", () => {
		mocks.markets = {
			"xyz:TSLA": {
				kind: "builderPerp",
				quoteToken: { name: "USDT0", displayName: "USDT" },
				shortName: "TSLA",
				szDecimals: 3,
			},
		};
		renderPage();
		const rows = mocks.buildRows?.([
			{ ...createFunding(0), coin: "xyz:TSLA", szi: "-1.2300", usdc: "-0.5000", fundingRate: "-0.0010" },
		]);
		expect(serializeCsv(rows ?? [])).toContain("xyz:TSLA,Short,1.2300,-0.0010,-0.5000,USDT0");
	});

	it("keeps a selected market visible after refreshed data no longer contains it", () => {
		renderPage();
		const marketFilter = container.querySelector<HTMLSelectElement>(
			'select[aria-label="Filter funding payments by market"]',
		);
		if (!marketFilter) throw new Error("Missing market filter");
		act(() => {
			marketFilter.value = "ETH";
			marketFilter.dispatchEvent(new Event("change", { bubbles: true }));
		});
		mocks.history.fundings = [createFunding(0)];
		renderPage();

		expect(marketFilter.value).toBe("ETH");
		expect([...marketFilter.options].some((option) => option.value === "ETH")).toBe(true);
		expect(container.textContent).toContain("No funding payments match the selected filters");
	});

	it.each([
		["disabled", "Invalid account address"],
		["loading", "Loading funding payments"],
		["error", "The requested 30-day window could not be verified. No partial history is shown."],
	] as const)("keeps the %s state distinct", (status, expectedText) => {
		mocks.history.status = status;
		mocks.history.fundings = [];
		renderPage();

		expect(container.querySelector('[data-testid="funding-history-page"]')?.getAttribute("data-state")).toBe(status);
		expect(container.textContent).toContain(expectedText);
	});

	function selectFilter(label: string, value: string) {
		const filter = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
		if (!filter) throw new Error(`Missing filter: ${label}`);
		act(() => {
			filter.value = value;
			filter.dispatchEvent(new Event("change", { bubbles: true }));
		});
		return filter;
	}

	function findRetry() {
		return [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry");
	}

	it("states the filter no-match pair for a current, successful snapshot that is not refreshing", () => {
		renderPage();
		selectFilter("Filter funding payments by market", "ETH");
		selectFilter("Filter funding payments by side", "long");

		expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
		expect(container.textContent).toContain("No matching funding payments");
		expect(container.querySelector("output.sr-only")?.textContent).toBe(
			"No funding payments match the selected filters.",
		);
		expect(container.querySelector('[data-slot="history-page-unavailable"]')).toBeNull();
	});

	it.each([
		[
			"its refresh failed",
			() => {
				mocks.history.error = new Error("refresh failed");
			},
			false,
		],
		[
			"the page is offline",
			() => {
				mocks.history.isOffline = true;
			},
			true,
		],
		[
			"a refresh is running",
			() => {
				mocks.history.isRefreshing = true;
			},
			true,
		],
	] as const)("draws no filter no-match conclusion from retained rows while %s", (_state, apply, waiting) => {
		renderPage();
		const first = selectFilter("Filter funding payments by market", "ETH");
		selectFilter("Filter funding payments by side", "long");

		apply();
		renderPage();

		expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
		expect(container.textContent).not.toContain("No matching funding payments");
		expect(container.textContent).not.toContain("No funding payments match the selected filters.");
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(first.isConnected).toBe(true);
		expect(first.value).toBe("ETH");
		const unavailable = container.querySelector('[data-slot="history-page-unavailable"]');
		expect(unavailable).not.toBeNull();
		expect(unavailable?.querySelector('[aria-busy="true"]') !== null).toBe(waiting);
		expect(findRetry() === undefined).toBe(waiting);
		if (!waiting) {
			act(() => findRetry()?.click());
			expect(mocks.history.refresh).toHaveBeenCalledOnce();
		}

		selectFilter("Filter funding payments by market", "__all_funding_markets__");
		selectFilter("Filter funding payments by side", "all");
		expect(container.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
		expect(container.querySelector('[data-slot="history-page-unavailable"]')).toBeNull();

		mocks.history.error = null;
		mocks.history.isOffline = false;
		mocks.history.isRefreshing = false;
		selectFilter("Filter funding payments by market", "ETH");
		selectFilter("Filter funding payments by side", "long");
		expect(container.textContent).toContain("No matching funding payments");
	});

	it("keeps an empty cached result busy while it refreshes, then offers a working Retry if the refresh fails", () => {
		mocks.history.fundings = [];
		mocks.history.isRefreshing = true;
		renderPage();
		expect(container.textContent).not.toContain("No funding payments found");
		expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Retry")).toBe(false);
		const busy = container.querySelector('[data-slot="history-page-unavailable"] [aria-busy="true"]');
		expect(busy).not.toBeNull();
		expect(
			container.querySelector('[data-slot="history-page-unavailable"] output')?.closest('[aria-busy="true"]'),
		).toBeNull();

		mocks.history.isRefreshing = false;
		mocks.history.error = new Error("refresh failed");
		renderPage();
		const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry");
		act(() => retry?.click());
		expect(mocks.history.refresh).toHaveBeenCalled();
	});

	it("keeps loaded payments without a banner and offers Retry instead of an empty conclusion when a refresh fails", () => {
		mocks.history.fundings = [
			{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "1", time: 1_799_999_999_999, usdc: "0.1" },
		];
		mocks.history.error = new Error("refresh failed");
		renderPage();
		expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.textContent).not.toContain("Refresh failed");

		mocks.history.fundings = [];
		renderPage();
		expect(container.textContent).not.toContain("No funding payments found");
		expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Retry")).toBe(true);
	});

	it("shows each funded position's side and pays builder DEX funding in that DEX's collateral", () => {
		mocks.markets = {
			BTC: { kind: "perp", shortName: "BTC", szDecimals: 5 },
			"xyz:TSLA": { kind: "builderPerp", quoteToken: { displayName: "USDE" }, shortName: "TSLA", szDecimals: 3 },
		};
		mocks.history.fundings = [
			{ coin: "xyz:TSLA", fundingRate: "0.0001", nSamples: null, szi: "-2.5", time: 1_800_000_000_000, usdc: "-0.5" },
			{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "1", time: 1_799_999_999_999, usdc: "0.1" },
		];
		renderPage();

		const rows = [...container.querySelectorAll("tbody tr")].map((row) => row.textContent ?? "");
		expect(rows).toHaveLength(2);
		expect(rows[0]).toContain("Short");
		expect(rows[0]).toContain("2.500 TSLA");
		expect(rows[0]).toContain("-0.50000 USDE");
		expect(rows[0]).not.toContain("USDC");
		expect(rows[1]).toContain("Long");
		expect(rows[1]).toContain("1.00000 BTC");
		expect(rows[1]).toContain("USDC");
	});

	it("does not label a delisted HIP-3 market's funding as USDC", () => {
		mocks.history.fundings = [
			{ coin: "xyz:GONE", fundingRate: "0.0001", nSamples: null, szi: "3", time: 1_800_000_000_000, usdc: "-0.25" },
		];
		renderPage();

		const rows = [...container.querySelectorAll("tbody tr")].map((row) => row.textContent ?? "");
		expect(rows).toHaveLength(1);
		expect(rows[0]).toContain("-0.25");
		expect(rows[0]).not.toContain("USDC");
	});

	it("shows a confirmed empty state only after a ready response", () => {
		mocks.history.status = "ready";
		mocks.history.fundings = [];
		renderPage();

		expect(container.textContent).toContain("No funding payments found");
		expect(container.textContent).not.toContain("Funding payments are unavailable");
	});

	it("does not offer a working refresh action for an invalid address", () => {
		mocks.history.status = "disabled";
		mocks.history.fundings = [];
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<FundingHistoryPage address="invalid" />
				</I18nProvider>,
			),
		);

		const refreshButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Refresh",
		);
		expect(refreshButton?.disabled).toBe(true);
		expect(mocks.history.refresh).not.toHaveBeenCalled();
		expect(mocks.exportAddress).toBeUndefined();
	});

	it("dates desktop rows, phone cards and exported payments with the year like the trade history page", () => {
		const funding = createFunding(0);
		mocks.history.fundings = [funding];
		renderPage();

		const withYear = formatDateTime(funding.time, { locale: "en", dateStyle: "short", timeStyle: "short" });
		expect(container.querySelector("tbody")?.textContent).toContain(withYear);
		expect(container.querySelector("time")?.textContent).toBe(withYear);
		expect(mocks.buildRows?.([funding])[1]?.[0]).toBe(withYear);
	});

	it("exports the address shown by the public history page", () => {
		renderPage();

		expect(mocks.exportAddress).toBe(ADDRESS);
		const exportButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Export CSV",
		);
		expect(exportButton).toBeDefined();
		act(() => exportButton?.click());
		expect(mocks.exportCsv).toHaveBeenCalledOnce();
	});
});
