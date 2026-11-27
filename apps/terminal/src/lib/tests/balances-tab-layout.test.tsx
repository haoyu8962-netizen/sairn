/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BalancesTab } from "@/components/trade/positions/balances-tab";

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span>{coin}</span>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: ReactNode }) => <div data-testid="balances-scroll-area">{children}</div>,
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ actionsBlocked: false }),
}));

vi.mock("@/hooks/trade/use-balance-rows", () => ({
	useBalanceRows: () => {
		const row = {
			asset: "USDC",
			available: "1000",
			entryNtl: "0",
			inOrder: "0",
			total: "1000",
			transferable: "1000",
			type: "spot" as const,
			usdValue: "1000",
		};
		return {
			accountAbstraction: "disabled",
			accountDataReady: true,
			accountModeReady: true,
			accountModeSetup: "not-applicable",
			balances: [row],
			hasError: false,
			internalTransfersEnabled: true,
			isConnected: true,
			isDataStale: false,
			isLoading: false,
			perpBalances: [],
			perpFundsActionsEnabled: true,
			showBalanceAccountType: true,
			spotBalanceRows: [row],
		};
	},
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: true,
		path: "external",
		unavailableLabel: "Deposit unavailable",
		unavailableReason: null,
	}),
}));

vi.mock("@/hooks/trade/use-funds-action-availability", () => ({
	useFundsActionAvailability: () => ({
		assertFreshGeoAllowed: vi.fn(),
		internalTransfer: { available: true, reason: null, unavailableReason: null },
		withdrawal: { available: true, reason: null, unavailableReason: null },
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ hasWalletAccess: true, sessionMode: "wallet" }),
}));

vi.mock("@/lib/hyperliquid/markets/use-spot-tokens", () => ({
	useSpotTokens: () => ({ getToken: () => ({ szDecimals: 2 }) }),
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
	useSwapModalActions: () => ({ open: vi.fn() }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	useGlobalSettingsActions: () => ({ setHideSmallBalances: vi.fn() }),
	useHideSmallBalances: () => false,
}));

vi.mock("@/components/trade/positions/send-modal", () => ({
	SendModal: () => null,
}));

vi.mock("@/components/trade/positions/transfer-modal", () => ({
	TransferModal: () => null,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("BalancesTab desktop column layout", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("allocates enough Actions column width for all four manual-account USDC buttons without intruding on USD Value", () => {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<BalancesTab />
				</I18nProvider>,
			);
		});

		const buttons = [...container.querySelectorAll("tbody button")].map((button) => button.textContent?.trim());
		expect(buttons).toEqual(["To Perp", "Swap", "Send", "Withdraw"]);

		const scrollContainer = container.querySelector<HTMLDivElement>('[data-slot="table-scroll-container"]');
		expect(scrollContainer?.className).toContain("overflow-visible");

		const table = container.querySelector("table");
		const minWidthMatch = /min-w-\[(\d+(?:\.\d+)?)rem\]/.exec(table?.className ?? "");
		expect(minWidthMatch).not.toBeNull();
		const tableMinWidthPx = Number(minWidthMatch?.[1] ?? 0) * 16;

		const headers = [...container.querySelectorAll("thead th")];
		expect(headers).toHaveLength(5);
		const percents = headers.map((header) => {
			const match = /w-\[(\d+(?:\.\d+)?)%\]/.exec(header.className);
			return Number(match?.[1] ?? 0);
		});
		expect(percents.reduce((sum, pct) => sum + pct, 0)).toBe(100);

		const actionsPercent = percents[4] ?? 0;
		const cellHorizontalPaddingPx = 40;
		const actionsContentWidthPx = (tableMinWidthPx * actionsPercent) / 100 - cellHorizontalPaddingPx;
		expect(actionsContentWidthPx).toBeGreaterThanOrEqual(320);
	});
});
