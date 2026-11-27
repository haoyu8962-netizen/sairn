/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileAccountTransfersTab } from "@/components/trade/mobile/mobile-account-transfers-tab";
import type { AccountLedgerRow } from "@/lib/trade/account-ledger";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	rows: [] as AccountLedgerRow[],
}));

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/hooks/trade/use-account-ledger", () => ({
	useAccountLedger: () => ({
		canConfirmEmpty: true,
		error: null,
		isConnected: true,
		isRefreshing: false,
		retry: vi.fn(),
		rows: mocks.rows,
		status: "ready",
	}),
}));

vi.mock("@/lib/hyperliquid", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/hyperliquid")>()),
	useMarkets: () => ({ getTokenDisplayName: (name: string) => name }),
}));

vi.mock("@/hooks/trade/use-account-ledger-csv", () => ({
	useAccountLedgerCsv: () => ({ exportCsv: vi.fn(), isExporting: false }),
}));

vi.mock("@/hooks/trade/use-account-ledger-labels", () => ({
	useAccountLedgerLabels: () => ({
		getActionLabel: () => "Internal Spot to Perps Transfer",
		getLocationLabel: (value: { kind: string }) => value.kind,
	}),
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => "en-US",
	useIsTestnet: () => false,
}));

const LONG_ROW: AccountLedgerRow = {
	action: "withdrawal",
	amount: "-1234567.12345678",
	destination: { kind: "arbitrum" },
	explorer: "hyperliquid",
	fee: { amount: "1234567.12345678", token: "USDC" },
	hash: "0xabc",
	id: "withdrawal-long",
	rawType: "withdraw",
	source: { kind: "perps" },
	time: Date.UTC(2026, 9, 2, 8, 30),
	token: "USDC",
};

describe("MobileAccountTransfersTab touch targets and long-value layout", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.rows = [LONG_ROW];
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("gives both export buttons and the explorer link a 44px touch target", () => {
		mocks.rows = [];
		act(() => root.render(<MobileAccountTransfersTab scrollMode="page" />));
		const emptyExport = container.querySelector<HTMLButtonElement>('button[aria-label="Export CSV"]');
		expect(emptyExport).not.toBeNull();
		expect(emptyExport?.className).toMatch(/\b(?:min-h-11|after:h-11)\b/);
		expect(emptyExport?.className).toMatch(/\b(?:min-w-11|after:w-11|after:size-11)\b/);
		expect(emptyExport?.parentElement?.className).toContain("min-h-11");

		mocks.rows = [LONG_ROW];
		act(() => root.render(<MobileAccountTransfersTab scrollMode="page" />));
		const populatedExport = container.querySelector<HTMLButtonElement>('button[aria-label="Export CSV"]');
		expect(populatedExport).not.toBeNull();
		expect(populatedExport?.className).toMatch(/\b(?:min-h-11|after:h-11)\b/);
		expect(populatedExport?.className).toMatch(/\b(?:min-w-11|after:w-11|after:size-11)\b/);

		const explorerLink = container.querySelector<HTMLAnchorElement>("a[href]");
		expect(explorerLink).not.toBeNull();
		expect(explorerLink?.className).toContain("min-h-11");
		expect(explorerLink?.className).not.toContain("min-h-6");
	});

	it("lets long transfer titles, amounts and fees wrap without truncating or overflowing the card", () => {
		act(() => root.render(<MobileAccountTransfersTab scrollMode="page" />));

		const title = Array.from(container.querySelectorAll("p")).find(
			(element) => element.textContent === "Internal Spot to Perps Transfer",
		);
		expect(title).toBeDefined();
		expect(title?.className).not.toContain("truncate");
		expect(title?.parentElement?.parentElement?.className).toContain("flex-wrap");

		const amount = Array.from(container.querySelectorAll("span")).find((element) =>
			element.textContent?.includes("-1,234,567.12345678 USDC"),
		);
		expect(amount).toBeDefined();
		expect(amount?.className).not.toContain("shrink-0");
		expect(amount?.className).toContain("break-words");

		const feeValue = Array.from(container.querySelectorAll("div")).find(
			(element) => element.textContent === "1,234,567.12345678 USDC",
		);
		expect(feeValue).toBeDefined();
		expect(feeValue?.className).toContain("break-words");
		expect(feeValue?.parentElement?.className).toContain("min-w-0");
	});
});
