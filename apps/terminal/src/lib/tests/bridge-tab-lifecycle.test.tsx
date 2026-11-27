// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeTab } from "@/components/trade/tradebox/bridge/bridge-tab";
import { createI18nRoot } from "./harness/react";

const WALLET_ADDRESS = "0x1111111111111111111111111111111111111111";
const ROUTE_WALLET_MISMATCH = msg`The active wallet does not match this bridge route.`;
const BRIDGING_TO_HYPERLIQUID = msg`Bridging to Hyperliquid...`;

const testState = vi.hoisted(() => ({
	bridge: { status: "idle" } as Record<string, unknown>,
	closeDepositModal: vi.fn(),
	continueBridgeInBackground: vi.fn(),
	executeBridge: vi.fn(),
	resetBridge: vi.fn(() => true),
	restoreBridgeInForeground: vi.fn(),
	initLiFi: vi.fn(),
	selectToken: null as null | ((token: unknown) => void),
	confirmQuote: null as null | ((quote: unknown) => void),
	backFromConfirm: null as null | (() => void),
	confirmTokenAmount: null as null | string,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@/lib/lifi/config", () => ({ initLiFi: testState.initLiFi }));
vi.mock("@/config/lifi-bridge", () => ({
	LIFI_BRIDGE_FEATURES: { createNewRoute: true },
}));
vi.mock("@/lib/lifi/use-bridge", () => ({
	useBridgeExecutor: () => ({
		...testState.bridge,
		execute: testState.executeBridge,
		retry: vi.fn(),
		reset: testState.resetBridge,
		continueInBackground: testState.continueBridgeInBackground,
		restoreInForeground: testState.restoreBridgeInForeground,
	}),
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: true,
		walletAddress: WALLET_ADDRESS,
	}),
}));
vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ close: testState.closeDepositModal }),
}));
vi.mock("@/components/trade/tradebox/bridge/asset-selection-screen", () => ({
	AssetSelectionScreen: ({ onSelect }: { onSelect: (token: unknown) => void }) => {
		testState.selectToken = onSelect;
		return null;
	},
}));
vi.mock("@/components/trade/tradebox/bridge/confirmation-screen", () => ({
	ConfirmationScreen: ({
		tokenAmount,
		onBack,
		onConfirm,
	}: {
		tokenAmount: string;
		onBack: () => void;
		onConfirm: (quote: unknown) => void;
	}) => {
		testState.confirmTokenAmount = tokenAmount;
		testState.backFromConfirm = onBack;
		testState.confirmQuote = onConfirm;
		return createElement("div", { "data-testid": "bridge-confirm-screen" });
	},
}));

describe("BridgeTab lifecycle", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.bridge = { status: "idle" };
		testState.closeDepositModal.mockReset();
		testState.continueBridgeInBackground.mockReset();
		testState.executeBridge.mockReset();
		testState.executeBridge.mockResolvedValue("success");
		testState.resetBridge.mockReset();
		testState.resetBridge.mockReturnValue(true);
		testState.initLiFi.mockReset();
		testState.restoreBridgeInForeground.mockReset();
		testState.selectToken = null;
		testState.confirmQuote = null;
		testState.backFromConfirm = null;
		testState.confirmTokenAmount = null;
	});

	afterEach(() => {
		container.remove();
		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
		vi.clearAllMocks();
	});

	it("moves any active route to background execution when the bridge view unmounts", () => {
		act(() => root.render(createElement(BridgeTab)));
		expect(testState.initLiFi).toHaveBeenCalledOnce();
		expect(testState.restoreBridgeInForeground).toHaveBeenCalledOnce();

		act(() => root.unmount());

		expect(testState.continueBridgeInBackground).toHaveBeenCalledOnce();
	});

	it("renders a stored bridge failure in the active language and follows a language switch", () => {
		testState.bridge = {
			status: "error",
			error: ROUTE_WALLET_MISMATCH,
			recoveryWarning: null,
			retryMode: null,
			canAbandon: true,
			sourceAddress: WALLET_ADDRESS,
		};
		act(() => root.render(createElement(BridgeTab)));
		expect(container.textContent).toContain("The active wallet does not match this bridge route.");

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [ROUTE_WALLET_MISMATCH.id]: "当前钱包与此跨链路线不匹配。" },
			}),
		);
		expect(container.textContent).toContain("当前钱包与此跨链路线不匹配。");
		expect(container.textContent).not.toContain("The active wallet does not match this bridge route.");

		act(() => root.unmount());
	});

	it("renders an unrecognised bridge failure as a translated generic message instead of its raw text", () => {
		testState.bridge = {
			status: "error",
			error: { kind: "action-error", code: "unknown" },
			recoveryWarning: null,
			retryMode: null,
			canAbandon: true,
			sourceAddress: WALLET_ADDRESS,
		};
		act(() => root.render(createElement(BridgeTab)));

		expect(container.textContent).toContain("The request could not be completed. Try again.");

		act(() => root.unmount());
	});

	it("renders bridge progress in the active language", () => {
		testState.bridge = {
			status: "executing",
			statusText: BRIDGING_TO_HYPERLIQUID,
			txHash: null,
			recoveryWarning: null,
			sourceAddress: WALLET_ADDRESS,
		};
		act(() => root.render(createElement(BridgeTab)));
		expect(container.textContent).toContain("Bridging to Hyperliquid...");

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [BRIDGING_TO_HYPERLIQUID.id]: "正在跨链到 Hyperliquid…" },
			}),
		);
		expect(container.textContent).toContain("正在跨链到 Hyperliquid…");

		act(() => root.unmount());
	});

	it("closes the deposit modal when Close is clicked on the bridge success screen, while New deposit stays open", () => {
		testState.bridge = {
			status: "success",
			receivedAmount: "1000000",
			txHash: null,
			startTime: 1_000,
			endTime: 61_000,
			processDetails: [],
			sourceAddress: WALLET_ADDRESS,
		};
		act(() => root.render(createElement(BridgeTab)));
		const closeButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Close");
		expect(closeButton).toBeDefined();

		act(() => closeButton?.click());

		expect(testState.resetBridge).toHaveBeenCalledOnce();
		expect(testState.closeDepositModal).toHaveBeenCalledOnce();

		act(() => root.unmount());
		testState.resetBridge.mockClear();
		testState.closeDepositModal.mockClear();
		root = createI18nRoot(container);
		act(() => root.render(createElement(BridgeTab)));
		const newDepositButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "New deposit",
		);
		expect(newDepositButton).toBeDefined();

		act(() => newDepositButton?.click());

		expect(testState.resetBridge).toHaveBeenCalledOnce();
		expect(testState.closeDepositModal).not.toHaveBeenCalled();

		act(() => root.unmount());
	});

	it("ignores a stale confirmation callback after the user navigated back from confirmation or unmounted", () => {
		act(() => root.render(createElement(BridgeTab)));
		act(() => {
			testState.selectToken?.({
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
			});
		});
		const maxButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Max");
		act(() => maxButton?.click());
		const continueButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Continue",
		);
		act(() => continueButton?.click());

		const staleConfirm = testState.confirmQuote;
		expect(staleConfirm).toBeTypeOf("function");

		act(() => testState.backFromConfirm?.());
		act(() => staleConfirm?.({ toAmount: "995000" }));
		expect(testState.executeBridge).not.toHaveBeenCalled();

		const continueAgain = [...container.querySelectorAll("button")].find((button) => button.textContent === "Continue");
		act(() => continueAgain?.click());
		const confirmBeforeUnmount = testState.confirmQuote;
		act(() => root.unmount());
		act(() => confirmBeforeUnmount?.({ toAmount: "995000" }));
		expect(testState.executeBridge).not.toHaveBeenCalled();
	});

	it("ignores a first-generation confirm callback while a second confirmation screen is open and ignores repeated calls to a consumed callback", async () => {
		act(() => root.render(createElement(BridgeTab)));
		act(() => {
			testState.selectToken?.({
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
			});
		});

		const clickButton = (label: string) => {
			const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
			if (!button) throw new Error(`Missing button: ${label}`);
			act(() => button.click());
		};

		clickButton("Max");
		clickButton("Continue");
		const firstGenConfirm = testState.confirmQuote;
		expect(firstGenConfirm).toBeTypeOf("function");

		act(() => testState.backFromConfirm?.());
		clickButton("Continue");
		const secondGenConfirm = testState.confirmQuote;
		expect(secondGenConfirm).toBeTypeOf("function");

		act(() => firstGenConfirm?.({ toAmount: "111000" }));
		expect(testState.executeBridge).not.toHaveBeenCalled();

		testState.executeBridge.mockResolvedValueOnce("rejected");
		await act(async () => {
			secondGenConfirm?.({ toAmount: "222000" });
			secondGenConfirm?.({ toAmount: "222000" });
			secondGenConfirm?.({ toAmount: "333000" });
			await Promise.resolve();
		});
		expect(testState.executeBridge).toHaveBeenCalledTimes(1);
		expect(testState.executeBridge).toHaveBeenCalledWith({ toAmount: "222000" });

		const thirdGenConfirm = testState.confirmQuote;
		expect(thirdGenConfirm).toBeTypeOf("function");
		act(() => secondGenConfirm?.({ toAmount: "444000" }));
		expect(testState.executeBridge).toHaveBeenCalledTimes(1);

		testState.executeBridge.mockResolvedValueOnce("success");
		await act(async () => {
			thirdGenConfirm?.({ toAmount: "555000" });
			await Promise.resolve();
		});
		expect(testState.executeBridge).toHaveBeenCalledTimes(2);
		expect(testState.executeBridge).toHaveBeenLastCalledWith({ toAmount: "555000" });

		act(() => root.unmount());
	});

	it("preserves exact Max atomic amount across Continue and Back for an indivisible fractional-cent token", () => {
		act(() => root.render(createElement(BridgeTab)));
		act(() => {
			testState.selectToken?.({
				chainId: 42161,
				address: "0x0000000000000000000000000000000000000005",
				symbol: "WHOLE",
				name: "Whole Token",
				decimals: 0,
				logoURI: undefined,
				priceUSD: "2.004",
				amount: "1",
				amountUSD: 2.004,
				chainName: "Arbitrum",
				chainLogoURI: undefined,
				isDust: false,
			});
		});

		const findButton = (label: string) =>
			[...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);

		act(() => findButton("Max")?.click());
		expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("2.00");
		expect(findButton("Continue")?.disabled).toBe(false);

		act(() => findButton("Continue")?.click());
		expect(testState.confirmTokenAmount).toBe("1");

		act(() => testState.backFromConfirm?.());
		expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("2.00");
		expect(findButton("Continue")?.disabled).toBe(false);

		act(() => findButton("Continue")?.click());
		expect(testState.confirmTokenAmount).toBe("1");

		act(() => testState.backFromConfirm?.());
		const input = container.querySelector<HTMLInputElement>("input");
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		act(() => {
			if (!input) return;
			setter?.call(input, "2.0");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		act(() => {
			if (!input) return;
			setter?.call(input, "2.00");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(findButton("Continue")?.disabled).toBe(true);

		act(() => root.unmount());
	});
});
