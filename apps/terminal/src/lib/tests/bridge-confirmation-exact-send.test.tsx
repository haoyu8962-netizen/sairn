// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	formatLocale: "en-US",
	getQuote: vi.fn(),
}));

vi.mock("@lifi/sdk", () => ({
	getQuote: testState.getQuote,
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => testState.formatLocale,
}));

import { ConfirmationScreen } from "@/components/trade/tradebox/bridge/confirmation-screen";
import { formatExactSendAmount } from "@/lib/bridge/format";
import { getNumberFormatters } from "@/lib/format";

const ADDRESS = "0x1111111111111111111111111111111111111111";

const DAI_TOKEN: BridgeToken = {
	chainId: 42161,
	address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
	symbol: "DAI",
	name: "Dai Stablecoin",
	decimals: 18,
	logoURI: undefined,
	priceUSD: "1",
	amount: "9999999999999999999",
	amountUSD: 10,
	chainName: "Arbitrum",
	chainLogoURI: undefined,
	isDust: false,
};

const USDC_TOKEN: BridgeToken = {
	chainId: 42161,
	address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
	symbol: "USDC",
	name: "USD Coin",
	decimals: 6,
	logoURI: undefined,
	priceUSD: "1",
	amount: "10006000",
	amountUSD: 10.006,
	chainName: "Arbitrum",
	chainLogoURI: undefined,
	isDust: false,
};

function createStep(fromAmount: string) {
	return {
		estimate: {
			fromAmount,
			fromAmountUSD: "10",
			toAmount: "9950000",
			toAmountMin: "9900000",
			toAmountUSD: "9.95",
			executionDuration: 30,
			approvalAddress: "",
			gasCosts: [],
			feeCosts: [],
		},
	};
}

async function flushAsyncWork(times = 6) {
	for (let index = 0; index < times; index++) {
		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 0));
		});
	}
}

describe("Bridge ConfirmationScreen exact send amount and LI.FI quote atomic units", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.formatLocale = "en-US";
		testState.getQuote.mockReset();
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
		container.remove();
		vi.clearAllMocks();
	});

	function getSendRowText(): string | undefined {
		return [...container.querySelectorAll('[data-slot="info-row"]')]
			.find((row) => row.querySelector('[data-slot="info-row-label"]')?.textContent?.trim() === "You send")
			?.querySelector('[data-slot="info-row-value"]')
			?.textContent?.trim();
	}

	it("renders 9.999999999999999999 DAI without rounding to 10.000 and requests atomic 9999999999999999999 from LI.FI", async () => {
		testState.getQuote.mockResolvedValueOnce(createStep("9999999999999999999"));
		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<ConfirmationScreen
						token={DAI_TOKEN}
						tokenAmount="9.999999999999999999"
						address={ADDRESS}
						onBack={vi.fn()}
						onConfirm={vi.fn()}
					/>
				</QueryClientProvider>,
			);
		});
		await flushAsyncWork();

		expect(getSendRowText()).toBe("9.999999999999999999 DAI");
		expect(container.textContent).not.toContain("10.000");
		expect(testState.getQuote).toHaveBeenCalledWith(
			expect.objectContaining({
				fromChain: DAI_TOKEN.chainId,
				fromToken: DAI_TOKEN.address,
				fromAddress: ADDRESS,
				fromAmount: "9999999999999999999",
			}),
		);

		testState.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(getSendRowText()).toBe("9,999999999999999999 DAI");
	});

	it("strips insignificant trailing zeros while preserving grouping and decimal separators", async () => {
		testState.getQuote.mockResolvedValueOnce(createStep("10006000"));
		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<ConfirmationScreen
						token={USDC_TOKEN}
						tokenAmount="10.006000"
						address={ADDRESS}
						onBack={vi.fn()}
						onConfirm={vi.fn()}
					/>
				</QueryClientProvider>,
			);
		});
		await flushAsyncWork();

		expect(getSendRowText()).toBe("10.006 USDC");
		expect(testState.getQuote).toHaveBeenLastCalledWith(
			expect.objectContaining({
				fromAmount: "10006000",
			}),
		);

		testState.getQuote.mockResolvedValueOnce(createStep("123456789000"));
		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<ConfirmationScreen
						token={USDC_TOKEN}
						tokenAmount="123456.789000"
						address={ADDRESS}
						onBack={vi.fn()}
						onConfirm={vi.fn()}
					/>
				</QueryClientProvider>,
			);
		});
		await flushAsyncWork();

		expect(getSendRowText()).toBe("123,456.789 USDC");

		testState.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(getSendRowText()).toBe("123.456,789 USDC");

		testState.formatLocale = "fr-FR";
		act(() => notifyNumberFormatChange());
		expect(getSendRowText()).toBe("123 456,789 USDC");
	});

	it.each([
		["9.999999999999999999", "9.999999999999999999"],
		["10.006000", "10.006"],
		["1", "1"],
		["1.000000", "1"],
		["0.000000000000000001", "0.000000000000000001"],
		["123456.789000", "123,456.789"],
		["0.0000", "0"],
	] as const)("formats exact decimal string %s as %s without rounding", (input, expected) => {
		expect(formatExactSendAmount(input, getNumberFormatters())).toBe(expected);
	});
});
