// @vitest-environment jsdom

import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeToken } from "@/lib/lifi/use-balances";

const mocks = vi.hoisted(() => ({
	getChains: vi.fn(),
	getWalletBalances: vi.fn(),
	isOnline: true,
}));

vi.mock("@lifi/sdk", () => ({
	getChains: mocks.getChains,
	getWalletBalances: mocks.getWalletBalances,
}));

vi.mock("@/hooks/use-mobile", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/hooks/use-mobile")>()),
	useOnlineStatus: () => mocks.isOnline,
}));

import { useBridgeBalances } from "@/lib/lifi/use-balances";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const CHAIN = { id: 42161, name: "Arbitrum", logoURI: undefined };
const RAW_USDC = {
	chainId: 42161,
	address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
	symbol: "USDC",
	name: "USD Coin",
	decimals: 6,
	logoURI: undefined,
	priceUSD: "1",
	amount: "10000000",
};

const CACHED_TOKEN: BridgeToken = {
	chainId: 42161,
	address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
	symbol: "USDC",
	name: "USD Coin",
	decimals: 6,
	logoURI: undefined,
	priceUSD: "1",
	amount: "10000000",
	amountUSD: 10,
	chainName: "Arbitrum",
	chainLogoURI: undefined,
	isDust: false,
};

interface HookSnapshot {
	dataUpdatedAt: number;
	isSnapshotCurrent: boolean;
	needsStaleRetry: boolean;
}

describe("useBridgeBalances refresh key bounds", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	beforeEach(() => {
		onlineManager.setOnline(true);
		focusManager.setFocused(undefined);
		mocks.isOnline = true;
		mocks.getChains.mockReset();
		mocks.getWalletBalances.mockReset();
		mocks.getChains.mockResolvedValue([CHAIN]);
		queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
					gcTime: Infinity,
				},
			},
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		onlineManager.setOnline(true);
		focusManager.setFocused(undefined);
		container.remove();
		vi.clearAllMocks();
	});

	it("discards superseded snapshot refresh keys after repeated refreshes so retained keys stay bounded", async () => {
		vi.useFakeTimers();
		try {
			let latest: HookSnapshot = { dataUpdatedAt: 0, isSnapshotCurrent: false, needsStaleRetry: false };
			let recordingRetryFlags = false;
			const observedRetryFlags: boolean[] = [];

			function Probe() {
				const result = useBridgeBalances(ADDRESS);
				latest = {
					dataUpdatedAt: result.dataUpdatedAt,
					isSnapshotCurrent: result.isSnapshotCurrent,
					needsStaleRetry: result.needsStaleRetry,
				};
				if (recordingRetryFlags) observedRetryFlags.push(result.needsStaleRetry);
				return null;
			}

			mocks.getWalletBalances.mockResolvedValue({ 42161: [RAW_USDC] });

			act(() => {
				root.render(
					<QueryClientProvider client={queryClient}>
						<Probe />
					</QueryClientProvider>,
				);
			});

			await act(async () => {
				await vi.advanceTimersByTimeAsync(10);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);
			expect(latest.isSnapshotCurrent).toBe(true);
			const snapshotTimestamps: number[] = [latest.dataUpdatedAt];

			for (let cycle = 1; cycle <= 5; cycle++) {
				await act(async () => {
					await vi.advanceTimersByTimeAsync(60_000);
				});
				await act(async () => {
					await vi.advanceTimersByTimeAsync(10);
				});
				expect(mocks.getWalletBalances).toHaveBeenCalledTimes(cycle + 1);
				expect(latest.isSnapshotCurrent).toBe(true);
				expect(latest.needsStaleRetry).toBe(false);
				snapshotTimestamps.push(latest.dataUpdatedAt);
			}

			const queryKey = ["lifi-balances", ADDRESS.toLowerCase()];
			for (const [index, supersededTimestamp] of snapshotTimestamps.slice(0, 2).entries()) {
				const callsBefore = mocks.getWalletBalances.mock.calls.length;
				observedRetryFlags.length = 0;
				recordingRetryFlags = true;

				await act(async () => {
					queryClient.setQueryData(queryKey, [CACHED_TOKEN], { updatedAt: supersededTimestamp });
					await vi.advanceTimersByTimeAsync(10);
				});

				recordingRetryFlags = false;
				expect(observedRetryFlags, `superseded snapshot #${index} must not keep settled retry state`).not.toContain(
					true,
				);
				expect(
					mocks.getWalletBalances,
					`superseded snapshot #${index} must be evicted and refreshed`,
				).toHaveBeenCalledTimes(callsBefore + 1);
				expect(latest.isSnapshotCurrent).toBe(true);
			}
		} finally {
			vi.useRealTimers();
		}
	});

	it("still retains the current snapshot key across cancellation and foreground toggles until a newer snapshot arrives", async () => {
		vi.useFakeTimers();
		const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
		let visibilityState: DocumentVisibilityState = "visible";
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			get: () => visibilityState,
		});
		try {
			let latest: HookSnapshot & { refetch: () => Promise<unknown> } = {
				dataUpdatedAt: 0,
				isSnapshotCurrent: false,
				needsStaleRetry: false,
				refetch: async () => undefined,
			};

			function Probe() {
				const result = useBridgeBalances(ADDRESS);
				latest = {
					dataUpdatedAt: result.dataUpdatedAt,
					isSnapshotCurrent: result.isSnapshotCurrent,
					needsStaleRetry: result.needsStaleRetry,
					refetch: result.refetch,
				};
				return null;
			}

			mocks.getWalletBalances.mockResolvedValueOnce({ 42161: [RAW_USDC] });
			act(() => {
				root.render(
					<QueryClientProvider client={queryClient}>
						<Probe />
					</QueryClientProvider>,
				);
			});

			await act(async () => {
				await vi.advanceTimersByTimeAsync(10);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);

			mocks.getWalletBalances.mockReturnValueOnce(new Promise(() => {}));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(60_000);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(2);

			await act(async () => {
				await queryClient.cancelQueries({ queryKey: ["lifi-balances", ADDRESS.toLowerCase()] });
				await vi.advanceTimersByTimeAsync(10);
			});
			expect(latest.needsStaleRetry).toBe(true);

			visibilityState = "hidden";
			act(() => {
				document.dispatchEvent(new Event("visibilitychange"));
			});
			visibilityState = "visible";
			await act(async () => {
				document.dispatchEvent(new Event("visibilitychange"));
				await vi.advanceTimersByTimeAsync(100);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(2);
			expect(latest.needsStaleRetry).toBe(true);

			mocks.getWalletBalances.mockResolvedValueOnce({ 42161: [RAW_USDC] });
			await act(async () => {
				await latest.refetch();
				await vi.advanceTimersByTimeAsync(10);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(3);
			expect(latest.needsStaleRetry).toBe(false);
			expect(latest.isSnapshotCurrent).toBe(true);
		} finally {
			if (originalVisibility) Object.defineProperty(document, "visibilityState", originalVisibility);
			else Reflect.deleteProperty(document, "visibilityState");
			vi.useRealTimers();
		}
	});
});
