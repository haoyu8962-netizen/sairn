// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import { createI18nRoot } from "./harness/react";

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

import { AssetSelectionScreen } from "@/components/trade/tradebox/bridge/asset-selection-screen";

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

async function flushAsyncWork(times = 6) {
	for (let index = 0; index < times; index++) {
		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 0));
		});
	}
}

describe("Bridge AssetSelectionScreen passive data presentation", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
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
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		onlineManager.setOnline(true);
		focusManager.setFocused(undefined);
		container.remove();
		vi.clearAllMocks();
	});

	function renderScreen(onSelect = vi.fn()) {
		act(() =>
			root.render(
				<QueryClientProvider client={queryClient}>
					<AssetSelectionScreen address={ADDRESS} onSelect={onSelect} />
				</QueryClientProvider>,
			),
		);
		return onSelect;
	}

	it("renders a quiet aria-busy placeholder without visible loading text or spinner while loading", () => {
		mocks.getWalletBalances.mockReturnValue(new Promise(() => {}));
		renderScreen();

		const busyRegion = container.querySelector('[aria-busy="true"]');
		expect(busyRegion).not.toBeNull();
		expect(container.querySelector(".animate-spin")).toBeNull();
		expect(container.textContent).not.toContain("Loading balances across all chains...");
		expect(container.textContent).not.toContain("No balances found");
	});

	it("renders only a neutral Retry without error copy or warning icon when initial balance fetch fails", async () => {
		mocks.getWalletBalances.mockRejectedValueOnce(new Error("rpc unavailable"));
		renderScreen();
		await flushAsyncWork();

		expect(container.textContent).not.toContain("Failed to load balances");
		expect(container.textContent).not.toContain("Could not fetch your token balances");
		expect(container.textContent).not.toContain("No balances found");
		expect(container.querySelector(".bg-error-soft")).toBeNull();
		expect(container.querySelector("svg")).toBeNull();

		const retryButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === "Retry",
		);
		expect(retryButton).toBeDefined();

		mocks.getWalletBalances.mockResolvedValueOnce({ 42161: [RAW_USDC] });
		act(() => retryButton?.click());
		await flushAsyncWork();

		expect(container.textContent).toContain("USDC");
	});

	it("does not show No balances found while a stale cached empty snapshot is refetching", async () => {
		queryClient.setQueryData(["lifi-balances", ADDRESS.toLowerCase()], [], {
			updatedAt: Date.now() - 120_000,
		});
		let resolveBalances!: (value: Record<number, (typeof RAW_USDC)[]>) => void;
		mocks.getWalletBalances.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveBalances = resolve;
			}),
		);

		renderScreen();

		expect(container.textContent).not.toContain("No balances found");
		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

		resolveBalances({});
		await flushAsyncWork();

		expect(container.textContent).toContain("No balances found");
	});

	it("does not retain pre-mount cached tokens when refresh fails, and retains post-mount tokens disabled with Retry", async () => {
		queryClient.setQueryData(["lifi-balances", ADDRESS.toLowerCase()], [CACHED_TOKEN], {
			updatedAt: Date.now() - 120_000,
		});
		mocks.getWalletBalances.mockRejectedValueOnce(new Error("network error"));

		const onSelect = renderScreen();
		await flushAsyncWork();

		expect(container.textContent).not.toContain("USDC");
		expect(container.textContent).not.toContain("Failed to load balances");
		const retryButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === "Retry",
		);
		expect(retryButton).toBeDefined();

		mocks.getWalletBalances.mockResolvedValueOnce({ 42161: [RAW_USDC] });
		act(() => retryButton?.click());
		await flushAsyncWork();

		const tokenButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("USDC"),
		);
		expect(tokenButton?.disabled).toBe(false);

		mocks.getWalletBalances.mockRejectedValueOnce(new Error("refresh failed"));
		await act(async () => {
			await queryClient.refetchQueries({ queryKey: ["lifi-balances", ADDRESS.toLowerCase()] });
		});
		await flushAsyncWork();
		expect(mocks.getWalletBalances).toHaveBeenCalledTimes(3);

		const retainedTokenButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("USDC"),
		);
		expect(retainedTokenButton).toBeDefined();
		expect(retainedTokenButton?.disabled).toBe(true);
		act(() => retainedTokenButton?.click());
		expect(onSelect).not.toHaveBeenCalled();
		expect(container.textContent).not.toContain("Failed to load balances");
		expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Retry")).toBe(
			true,
		);
	});

	it("does not show No balances found when offline with a stale or paused query", async () => {
		mocks.isOnline = false;
		queryClient.setQueryData(["lifi-balances", ADDRESS.toLowerCase()], [], {
			updatedAt: Date.now(),
		});
		renderScreen();

		expect(container.textContent).not.toContain("No balances found");
	});

	it("keeps the passive loading description screen-reader-only inside the busy region", () => {
		mocks.getWalletBalances.mockReturnValue(new Promise(() => {}));
		renderScreen();

		const busyRegion = container.querySelector('[aria-busy="true"]');
		expect(busyRegion).not.toBeNull();
		const srOnlyLabel = busyRegion?.querySelector(".sr-only");
		expect(srOnlyLabel?.textContent?.trim()).toBe("Loading balances");

		const visibleClone = busyRegion?.cloneNode(true) as HTMLElement | undefined;
		for (const hidden of visibleClone?.querySelectorAll(".sr-only") ?? []) hidden.remove();
		expect(visibleClone?.textContent?.trim()).toBe("");
	});

	it("triggers a controlled foreground refresh when balances naturally expire after staleTime without showing stale rows", async () => {
		vi.useFakeTimers();
		try {
			mocks.getWalletBalances.mockResolvedValueOnce({ 42161: [RAW_USDC] });
			renderScreen();

			await act(async () => {
				await vi.advanceTimersByTimeAsync(10);
			});

			const initialButton = [...container.querySelectorAll("button")].find((button) =>
				button.textContent?.includes("USDC"),
			);
			expect(initialButton).toBeDefined();
			expect(initialButton?.disabled).toBe(false);
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);

			let resolveRefresh!: (value: Record<number, (typeof RAW_USDC)[]>) => void;
			mocks.getWalletBalances.mockReturnValueOnce(
				new Promise((resolve) => {
					resolveRefresh = resolve;
				}),
			);

			await act(async () => {
				await vi.advanceTimersByTimeAsync(60_000);
			});

			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(2);
			expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
			expect(container.textContent).not.toContain("USDC");
			expect(container.textContent).not.toContain("No balances found");

			await act(async () => {
				resolveRefresh({
					42161: [{ ...RAW_USDC, symbol: "WETH", name: "Wrapped Ether", amount: "20000000" }],
				});
				await vi.advanceTimersByTimeAsync(10);
			});

			const refreshedButton = [...container.querySelectorAll("button")].find((button) =>
				button.textContent?.includes("WETH"),
			);
			expect(refreshedButton).toBeDefined();
			expect(refreshedButton?.disabled).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("shows disabled retained tokens and neutral Retry without looping when expiry refresh fails", async () => {
		vi.useFakeTimers();
		try {
			mocks.getWalletBalances.mockResolvedValueOnce({ 42161: [RAW_USDC] });
			const onSelect = renderScreen();

			await act(async () => {
				await vi.advanceTimersByTimeAsync(10);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);

			mocks.getWalletBalances.mockRejectedValueOnce(new Error("refresh timeout"));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(60_000);
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(10);
			});

			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(2);
			const retainedButton = [...container.querySelectorAll("button")].find((button) =>
				button.textContent?.includes("USDC"),
			);
			expect(retainedButton).toBeDefined();
			expect(retainedButton?.disabled).toBe(true);
			act(() => retainedButton?.click());
			expect(onSelect).not.toHaveBeenCalled();
			expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Retry")).toBe(
				true,
			);
			expect(container.textContent).not.toContain("Failed to load balances");
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not refresh expired balances while hidden and refreshes once the page returns to the foreground", async () => {
		vi.useFakeTimers();
		const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
		let visibilityState: DocumentVisibilityState = "visible";
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			get: () => visibilityState,
		});
		try {
			mocks.getWalletBalances.mockResolvedValueOnce({ 42161: [RAW_USDC] });
			renderScreen();

			await act(async () => {
				await vi.advanceTimersByTimeAsync(10);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);

			visibilityState = "hidden";
			act(() => {
				window.dispatchEvent(new Event("visibilitychange"));
				document.dispatchEvent(new Event("visibilitychange"));
			});

			mocks.getWalletBalances.mockResolvedValueOnce({ 42161: [RAW_USDC] });
			await act(async () => {
				await vi.advanceTimersByTimeAsync(65_000);
			});

			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);
			expect(container.textContent).not.toContain("USDC");
			expect(container.textContent).not.toContain("No balances found");

			visibilityState = "visible";
			await act(async () => {
				window.dispatchEvent(new Event("visibilitychange"));
				document.dispatchEvent(new Event("visibilitychange"));
				await vi.advanceTimersByTimeAsync(10);
			});

			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(2);
			expect(container.textContent).toContain("USDC");
		} finally {
			if (originalVisibility) Object.defineProperty(document, "visibilityState", originalVisibility);
			else Reflect.deleteProperty(document, "visibilityState");
			vi.useRealTimers();
		}
	});

	it("treats sub-$2 balances whose float value rounds up to 2 as dust", async () => {
		mocks.getWalletBalances.mockResolvedValueOnce({
			42161: [
				{
					...RAW_USDC,
					symbol: "DAI",
					name: "Dai Stablecoin",
					decimals: 18,
					priceUSD: "1",
					amount: "1999999999999999999",
				},
			],
		});
		renderScreen();
		await flushAsyncWork();

		const daiButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("DAI"));
		expect(daiButton).toBeDefined();
		expect(daiButton?.disabled).toBe(true);
		expect(daiButton?.textContent).toContain("Low balance");
	});

	it("offers neutral Retry without looping or stale rows when a controlled stale refresh is cancelled and reverted", async () => {
		vi.useFakeTimers();
		try {
			mocks.getWalletBalances.mockResolvedValueOnce({ 42161: [RAW_USDC] });
			const onSelect = renderScreen();

			await act(async () => {
				await vi.advanceTimersByTimeAsync(10);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);
			expect(container.textContent).toContain("USDC");

			mocks.getWalletBalances.mockReturnValueOnce(new Promise(() => {}));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(60_000);
			});

			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(2);
			expect(queryClient.getQueryState(["lifi-balances", ADDRESS.toLowerCase()])?.fetchStatus).toBe("fetching");
			expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
			expect(container.textContent).not.toContain("USDC");

			await act(async () => {
				await queryClient.cancelQueries({ queryKey: ["lifi-balances", ADDRESS.toLowerCase()] });
				await vi.advanceTimersByTimeAsync(10);
			});

			await act(async () => {
				await vi.advanceTimersByTimeAsync(5_000);
			});

			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(2);
			expect(container.querySelector('[aria-busy="true"]')).toBeNull();
			expect(container.textContent).not.toContain("USDC");
			expect(container.querySelector(".bg-error-soft")).toBeNull();
			expect(container.querySelector("svg")).toBeNull();
			expect(onSelect).not.toHaveBeenCalled();

			const retryButton = [...container.querySelectorAll("button")].find(
				(button) => button.textContent?.trim() === "Retry",
			);
			expect(retryButton).toBeDefined();

			mocks.getWalletBalances.mockResolvedValueOnce({
				42161: [{ ...RAW_USDC, symbol: "WETH", name: "Wrapped Ether", amount: "20000000" }],
			});
			await act(async () => {
				retryButton?.click();
				await vi.advanceTimersByTimeAsync(10);
			});

			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(3);
			const refreshedButton = [...container.querySelectorAll("button")].find((button) =>
				button.textContent?.includes("WETH"),
			);
			expect(refreshedButton).toBeDefined();
			expect(refreshedButton?.disabled).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not refetch expired balances when network reconnects while hidden, and refreshes once when returning to foreground", async () => {
		vi.useFakeTimers();
		const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
		let visibilityState: DocumentVisibilityState = "visible";
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			get: () => visibilityState,
		});
		try {
			mocks.getWalletBalances.mockResolvedValueOnce({ 42161: [RAW_USDC] });
			renderScreen();

			await act(async () => {
				await vi.advanceTimersByTimeAsync(10);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);
			expect(mocks.getChains).toHaveBeenCalledTimes(1);

			visibilityState = "hidden";
			act(() => {
				window.dispatchEvent(new Event("visibilitychange"));
				document.dispatchEvent(new Event("visibilitychange"));
			});

			mocks.getWalletBalances.mockResolvedValueOnce({
				42161: [{ ...RAW_USDC, symbol: "WETH", name: "Wrapped Ether", amount: "20000000" }],
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(65_000);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);
			expect(mocks.getChains).toHaveBeenCalledTimes(1);

			mocks.isOnline = false;
			await act(async () => {
				onlineManager.setOnline(false);
				renderScreen();
				await vi.advanceTimersByTimeAsync(10);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);
			expect(mocks.getChains).toHaveBeenCalledTimes(1);

			mocks.isOnline = true;
			await act(async () => {
				onlineManager.setOnline(true);
				renderScreen();
				await vi.advanceTimersByTimeAsync(100);
			});

			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);
			expect(mocks.getChains).toHaveBeenCalledTimes(1);
			expect(container.textContent).not.toContain("USDC");
			expect(container.textContent).not.toContain("WETH");

			visibilityState = "visible";
			await act(async () => {
				window.dispatchEvent(new Event("visibilitychange"));
				document.dispatchEvent(new Event("visibilitychange"));
				await vi.advanceTimersByTimeAsync(10);
			});

			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(2);
			expect(mocks.getChains).toHaveBeenCalledTimes(2);
			const refreshedButton = [...container.querySelectorAll("button")].find((button) =>
				button.textContent?.includes("WETH"),
			);
			expect(refreshedButton).toBeDefined();
			expect(refreshedButton?.disabled).toBe(false);
		} finally {
			if (originalVisibility) Object.defineProperty(document, "visibilityState", originalVisibility);
			else Reflect.deleteProperty(document, "visibilityState");
			vi.useRealTimers();
		}
	});

	it("stops after bounded retries on expiry failure with production-like QueryClient retry settings and keeps exact $2 assets selectable", async () => {
		vi.useFakeTimers();
		const retryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: 2,
					retryDelay: 50,
					gcTime: Infinity,
				},
			},
		});
		try {
			mocks.getWalletBalances.mockResolvedValueOnce({
				42161: [
					{
						...RAW_USDC,
						address: "0x0000000000000000000000000000000000000001",
						symbol: "EXACT2",
						name: "Exact Two",
						decimals: 0,
						priceUSD: "2",
						amount: "1",
					},
					{
						...RAW_USDC,
						address: "0x0000000000000000000000000000000000000002",
						symbol: "SUB2",
						name: "Just Below Two",
						decimals: 0,
						priceUSD: "1.999999999999999999999999",
						amount: "1",
					},
				],
			});
			const onSelect = vi.fn();
			act(() =>
				root.render(
					<QueryClientProvider client={retryClient}>
						<AssetSelectionScreen address={ADDRESS} onSelect={onSelect} />
					</QueryClientProvider>,
				),
			);

			await act(async () => {
				await vi.advanceTimersByTimeAsync(10);
			});

			const exactButton = [...container.querySelectorAll("button")].find((button) =>
				button.textContent?.includes("EXACT2"),
			);
			const subButton = [...container.querySelectorAll("button")].find((button) =>
				button.textContent?.includes("SUB2"),
			);
			expect(exactButton?.disabled).toBe(false);
			expect(subButton?.disabled).toBe(true);
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(1);

			mocks.getWalletBalances.mockRejectedValue(new Error("rpc timeout"));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(60_000);
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(4);

			await act(async () => {
				await vi.advanceTimersByTimeAsync(120_000);
			});
			expect(mocks.getWalletBalances).toHaveBeenCalledTimes(4);
			const retainedExact = [...container.querySelectorAll("button")].find((button) =>
				button.textContent?.includes("EXACT2"),
			);
			expect(retainedExact?.disabled).toBe(true);
			expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Retry")).toBe(
				true,
			);
		} finally {
			retryClient.clear();
			vi.useRealTimers();
		}
	});
});
