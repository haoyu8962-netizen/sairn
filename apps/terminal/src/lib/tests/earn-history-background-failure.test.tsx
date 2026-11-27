// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EarnView } from "@/components/earn/earn-view";
import { useEarnData } from "@/hooks/earn/use-earn-data";
import { accountLedgerQueryKey } from "@/hooks/trade/use-account-ledger";
import { createI18nRoot } from "./harness/react";

const OWNER = "0x1111111111111111111111111111111111111111" as const;

const deps = vi.hoisted(() => ({
	ledgerFetch: vi.fn<(signal?: AbortSignal) => Promise<unknown[]>>(),
	subAccountsFetch: vi.fn<() => Promise<unknown[]>>(),
	interestFetch: vi.fn<() => Promise<unknown[]>>(),
	subscriptionData: { nonFundingLedgerUpdates: [] as unknown[] } as unknown,
	latestData: null as ReturnType<typeof useEarnData> | null,
}));

vi.mock("@/hooks/use-mobile", () => ({ useOnlineStatus: () => true }));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: OWNER, isConnected: true }),
}));
vi.mock("@/hooks/trade/use-account-balances", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/hooks/trade/use-account-balances")>()),
	useDefaultDexBalances: () => ({
		accountAbstraction: "unifiedAccount",
		isSpotStateStale: false,
		spotAvailableAfterMaintenance: [],
		spotBalances: [],
		spotStateReceivedAt: Date.now(),
		spotStateStatus: "success",
	}),
}));
vi.mock("@/lib/hyperliquid", () => ({
	infoQueryOptions: () => ({}),
	useHyperliquid: () => ({
		env: "Mainnet" as const,
		info: {
			subAccounts: () => deps.subAccountsFetch(),
			userBorrowLendInterest: () => deps.interestFetch(),
			userNonFundingLedgerUpdates: (_params: unknown, signal?: AbortSignal) => deps.ledgerFetch(signal),
		},
	}),
	useInfo: () => ({ data: undefined, isError: false, refetch: () => Promise.resolve({}) }),
	useSpotTokens: () => ({ tokens: [] }),
	useSubscription: () => ({
		data: deps.subscriptionData,
		isStale: false,
		status: "active",
	}),
}));

function passthrough(tag: string) {
	return ({ children }: { children?: ReactNode }) => createElement(tag, null, children);
}

vi.mock("@sairn/ui", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		"aria-busy": ariaBusy,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		"aria-busy"?: boolean;
	}) => createElement("button", { type: "button", disabled, onClick, "aria-busy": ariaBusy }, children),
	Table: passthrough("table"),
	TableBody: passthrough("tbody"),
	TableCell: passthrough("td"),
	TableHead: passthrough("th"),
	TableHeader: passthrough("thead"),
	TableRow: passthrough("tr"),
	Tabs: passthrough("div"),
	TabsContent: passthrough("div"),
	TabsList: passthrough("div"),
	TabsTrigger: passthrough("button"),
	Tooltip: ({ children, content }: { children: ReactNode; content: ReactNode }) =>
		createElement("span", null, children, createElement("span", { "data-testid": "tooltip" }, content)),
}));

function EarnHistoryProbe() {
	const data = useEarnData();
	deps.latestData = data;
	return createElement(EarnView, { data, isMobile: false, actionsAllowed: true, notice: null, onOpenAction: vi.fn() });
}

describe("Earn action history background refresh failure", () => {
	let client: QueryClient;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		deps.ledgerFetch.mockReset();
		deps.subAccountsFetch.mockReset().mockResolvedValue([]);
		deps.interestFetch.mockReset().mockResolvedValue([]);
		deps.subscriptionData = { nonFundingLedgerUpdates: [] };
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		client.clear();
	});

	async function flush() {
		for (let step = 0; step < 6; step += 1) {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
		}
	}

	function retryButtons(): HTMLButtonElement[] {
		return [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
			(button) => button.textContent?.trim() === "Retry",
		);
	}

	it("shows a neutral Retry when a background ledger refresh fails on an empty Earn action history", async () => {
		deps.ledgerFetch.mockResolvedValueOnce([]);
		act(() => root.render(createElement(QueryClientProvider, { client }, createElement(EarnHistoryProbe))));
		await flush();

		expect(container.textContent).toContain("No earn actions yet");
		expect(retryButtons()).toHaveLength(0);

		deps.ledgerFetch.mockRejectedValueOnce(new Error("network offline"));
		await act(async () => {
			await client.refetchQueries({ queryKey: accountLedgerQueryKey("Mainnet", OWNER) });
		});
		await flush();

		expect(container.textContent).not.toContain("No earn actions yet");
		expect(retryButtons()).toHaveLength(1);

		deps.ledgerFetch.mockResolvedValueOnce([]);
		await act(async () => {
			retryButtons()[0]?.click();
		});
		await flush();

		expect(container.textContent).toContain("No earn actions yet");
		expect(retryButtons()).toHaveLength(0);
	});

	it("keeps existing Earn action history rows and offers neutral Retry after a background ledger refresh failure", async () => {
		const supplyUpdate = {
			time: Date.now() - 60_000,
			hash: `0x${"a".repeat(64)}`,
			delta: { type: "borrowLend", token: "USDC", operation: "supply", amount: "25" },
		};
		deps.ledgerFetch.mockResolvedValue([supplyUpdate]);
		act(() => root.render(createElement(QueryClientProvider, { client }, createElement(EarnHistoryProbe))));
		await flush();

		expect(container.textContent).toContain("25");
		expect(container.textContent).toContain("USDC");
		expect(retryButtons()).toHaveLength(0);

		deps.ledgerFetch.mockRejectedValueOnce(new Error("network timeout"));
		await act(async () => {
			await client.refetchQueries({ queryKey: accountLedgerQueryKey("Mainnet", OWNER) });
		});
		await flush();

		expect(container.textContent).toContain("25");
		expect(container.textContent).toContain("USDC");
		expect(retryButtons()).toHaveLength(1);

		deps.ledgerFetch.mockResolvedValue([supplyUpdate]);
		await act(async () => {
			retryButtons()[0]?.click();
		});
		await flush();

		expect(container.textContent).toContain("25");
		expect(container.textContent).toContain("USDC");
		expect(retryButtons()).toHaveLength(0);
	});

	it.each([
		{
			label: "empty ledger",
			initialUpdates: [] as unknown[],
			recoveredUpdates: [] as unknown[],
			expectText: "No earn actions yet",
		},
		{
			label: "populated ledger",
			initialUpdates: [
				{
					time: Date.now() - 60_000,
					hash: `0x${"b".repeat(64)}`,
					delta: { type: "borrowLend", token: "USDC", operation: "supply", amount: "42" },
				},
			],
			recoveredUpdates: [
				{
					time: Date.now() - 60_000,
					hash: `0x${"b".repeat(64)}`,
					delta: { type: "borrowLend", token: "USDC", operation: "supply", amount: "42" },
				},
			],
			expectText: "42",
		},
	])(
		"reuses the in-flight recovery request and disables Retry while pending on repeated activation ($label)",
		async ({ initialUpdates, recoveredUpdates, expectText }) => {
			deps.ledgerFetch.mockResolvedValue(initialUpdates);
			act(() => root.render(createElement(QueryClientProvider, { client }, createElement(EarnHistoryProbe))));
			await flush();

			expect(container.textContent).toContain(expectText);
			expect(retryButtons()).toHaveLength(0);

			deps.ledgerFetch.mockRejectedValueOnce(new Error("background failure"));
			await act(async () => {
				await client.refetchQueries({ queryKey: accountLedgerQueryKey("Mainnet", OWNER) });
			});
			await flush();

			expect(retryButtons()).toHaveLength(1);
			expect(retryButtons()[0]?.disabled).toBe(false);

			const signals: Array<AbortSignal | undefined> = [];
			let resolveRecovery!: (value: unknown[]) => void;
			deps.ledgerFetch.mockImplementation((signal) => {
				signals.push(signal);
				return new Promise<unknown[]>((resolve) => {
					resolveRecovery = resolve;
				});
			});
			deps.ledgerFetch.mockClear();

			await act(async () => {
				retryButtons()[0]?.click();
				retryButtons()[0]?.click();
			});
			await flush();

			expect(deps.ledgerFetch).toHaveBeenCalledTimes(1);
			expect(signals).toHaveLength(1);
			expect(signals[0]?.aborted).toBe(false);
			expect(retryButtons()).toHaveLength(1);
			expect(retryButtons()[0]?.disabled).toBe(true);
			expect(retryButtons()[0]?.getAttribute("aria-busy")).toBe("true");
			expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

			await act(async () => {
				deps.latestData?.retryHistory();
			});
			await flush();

			expect(deps.ledgerFetch).toHaveBeenCalledTimes(1);
			expect(signals[0]?.aborted).toBe(false);

			deps.ledgerFetch.mockResolvedValue(recoveredUpdates);
			await act(async () => {
				resolveRecovery(recoveredUpdates);
			});
			await flush();

			expect(container.textContent).toContain(expectText);
			expect(retryButtons()).toHaveLength(0);
		},
	);

	it("re-enables Retry when a pending recovery request fails again", async () => {
		deps.ledgerFetch.mockResolvedValueOnce([]);
		act(() => root.render(createElement(QueryClientProvider, { client }, createElement(EarnHistoryProbe))));
		await flush();

		deps.ledgerFetch.mockRejectedValueOnce(new Error("first failure"));
		await act(async () => {
			await client.refetchQueries({ queryKey: accountLedgerQueryKey("Mainnet", OWNER) });
		});
		await flush();

		let rejectRecovery!: (reason?: unknown) => void;
		deps.ledgerFetch.mockImplementationOnce(
			() =>
				new Promise<unknown[]>((_, reject) => {
					rejectRecovery = reject;
				}),
		);
		await act(async () => {
			retryButtons()[0]?.click();
		});
		await flush();

		expect(retryButtons()[0]?.disabled).toBe(true);
		expect(retryButtons()[0]?.getAttribute("aria-busy")).toBe("true");

		await act(async () => {
			rejectRecovery(new Error("second failure"));
		});
		await flush();

		expect(retryButtons()).toHaveLength(1);
		expect(retryButtons()[0]?.disabled).toBe(false);
		expect(retryButtons()[0]?.getAttribute("aria-busy")).toBeNull();
	});
});
