/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountTransfersTab } from "@/components/trade/positions/account-transfers-tab";
import { createI18nRoot } from "./harness/react";
import {
	resetWalletSessionStage,
	setWalletSessionStage,
	type WalletSessionStage,
} from "./harness/wallet-session-stage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const CONNECT = "Connect your wallet to view deposits and withdrawals.";

const mocks = vi.hoisted(() => ({
	exportCsv: vi.fn(async () => undefined),
	ledgerRequests: [] as string[],
}));

vi.mock("@privy-io/react-auth", async () => (await import("./harness/wallet-session-stage")).privyMock);
vi.mock("wagmi", async () => (await import("./harness/wallet-session-stage")).wagmiMock);
vi.mock("@privy-io/wagmi", async () => (await import("./harness/wallet-session-stage")).privyWagmiMock);

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollBar: () => null,
}));

vi.mock("@/lib/hyperliquid", async () => {
	const { hyperliquidSessionMock, useHyperliquidSession } = await import("./harness/wallet-session-stage");
	const info = {
		userNonFundingLedgerUpdates: async ({ user }: { user: string }) => {
			mocks.ledgerRequests.push(user);
			return [];
		},
		subAccounts: async () => null,
	};
	return {
		...hyperliquidSessionMock,
		useHyperliquid: () => ({ ...useHyperliquidSession(), info }),
		useMarkets: () => ({ getTokenDisplayName: (name: string) => name }),
		useSubscription: () => ({
			data: { isSnapshot: true, nonFundingLedgerUpdates: [], user: "0x1111111111111111111111111111111111111111" },
			isStale: false,
			status: "active",
		}),
	};
});

vi.mock("@/hooks/trade/use-account-ledger-csv", () => ({
	useAccountLedgerCsv: () => ({ exportCsv: mocks.exportCsv, isExporting: false }),
}));

vi.mock("@/hooks/trade/use-account-ledger-labels", () => ({
	useAccountLedgerLabels: () => ({
		getActionLabel: (value: string) => value,
		getLocationLabel: (value: { kind: string }) => value.kind,
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => false,
}));

describe("desktop Deposits & Withdrawals tab while the wallet session resolves", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	function mount(stage: WalletSessionStage) {
		resetWalletSessionStage(stage);
		act(() =>
			root.render(
				<QueryClientProvider client={queryClient}>
					<AccountTransfersTab />
				</QueryClientProvider>,
			),
		);
	}

	function exportButton(): HTMLButtonElement {
		const button = [...container.querySelectorAll("button")].find((candidate) =>
			candidate.textContent?.includes("Export CSV"),
		);
		if (!button) throw new Error("Export CSV button not found");
		return button;
	}

	beforeEach(() => {
		window.sessionStorage.clear();
		mocks.ledgerRequests = [];
		mocks.exportCsv.mockClear();
		queryClient = new QueryClient();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		queryClient.clear();
	});

	it.each([
		"authentication-initialising",
		"directory-initialising",
		"activating",
		"connecting",
		"reconnecting",
	] as const)("shows a busy region, not the Connect sentence, while the session is %s", (stage) => {
		mount(stage);

		expect(container.textContent).not.toContain(CONNECT);
		expect(container.textContent).not.toContain("No deposits or withdrawals found.");
		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
		expect(exportButton().disabled).toBe(true);
		expect(mocks.ledgerRequests).toEqual([]);
	});

	it.each([
		"signed-out",
		"wallet-missing",
		"connected-other-account",
		"authentication-initialising-first-visit",
	] as const)("keeps the Connect sentence once the session is %s", (stage) => {
		mount(stage);

		expect(container.textContent).toContain(CONNECT);
		expect(exportButton().disabled).toBe(true);
		expect(mocks.ledgerRequests).toEqual([]);
	});

	it("moves from the busy region to the account's list when the session resolves", async () => {
		mount("reconnecting");
		expect(container.textContent).not.toContain(CONNECT);

		act(() => setWalletSessionStage("connected"));
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.textContent).toContain("No deposits or withdrawals found.");
		});
		expect(mocks.ledgerRequests).toEqual(["0x1111111111111111111111111111111111111111"]);
	});

	it("moves from the busy region to the Connect sentence when the session ends signed out", () => {
		mount("authentication-initialising");
		expect(container.textContent).not.toContain(CONNECT);

		act(() => setWalletSessionStage("signed-out"));
		expect(container.textContent).toContain(CONNECT);
	});
});
