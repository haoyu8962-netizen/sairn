// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x1111111111111111111111111111111111111111",
		hasWalletAccess: true,
		isResolving: false,
		sessionMode: "wallet",
		walletAddress: "0x1111111111111111111111111111111111111111",
		walletIntent: "external",
	}),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: () => true,
	useDefaultDexBalances: () => ({
		spotBalances: [{ coin: "USDC", total: "100", hold: "0" }],
		accountAbstraction: "disabled",
		withdrawable: "50",
		spotStateStatus: "success",
		perpStateStatus: "success",
		spotStateReceivedAt: Date.now(),
		perpStateReceivedAt: Date.now(),
		isDataStale: false,
		hasError: false,
	}),
}));

vi.mock("@/hooks/trade/use-funds-action-availability", () => ({
	FundsActionGeoExecutionError: class extends Error {},
	useFundsActionAvailability: () => ({
		internalTransfer: { available: true, reason: null },
		assertFreshGeoAllowed: vi.fn(),
	}),
}));

vi.mock("@/hooks/trade/use-account-abstraction-guard", () => ({
	AccountAbstractionExecutionError: class extends Error {},
	useAccountAbstractionPreExecutionGuard: () => vi.fn(),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		clientKey: "0x1111111111111111111111111111111111111111",
		env: "Mainnet",
		exchangeLifecycle: { active: true },
		sessionMode: "wallet",
	}),
	useExchange: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { TransferModal } from "@/components/trade/positions/transfer-modal";

describe("TransferModal flip button controls", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders the direction flip control with ButtonIcon press feedback, focus ring and expanded touch target", () => {
		act(() => root.render(createElement(TransferModal, { open: true, onOpenChange: vi.fn() })));

		const flipButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="Flip transfer direction"]');
		expect(flipButton).not.toBeNull();
		expect(flipButton?.className).toContain("active:not-data-disabled:scale-[0.97]");
		expect(flipButton?.className).toContain("active:bg-fill-press");
		expect(flipButton?.className).toContain("focus-visible:outline-stroke-focus");
		expect(flipButton?.className).toContain("before:-inset-2");

		expect(document.body.textContent).toContain("Perp");
		act(() => flipButton?.click());
		expect(flipButton?.disabled).toBe(false);
	});
});
