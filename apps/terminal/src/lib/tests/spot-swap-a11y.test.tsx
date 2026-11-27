// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	mode: "spot" as "spot" | "stablecoin",
}));

vi.mock("@sairn/ui", () => ({
	Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
	Modal: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? createElement("div", { role: "dialog" }, children) : null,
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalPopup: ({ children }: { children: ReactNode }) => createElement("section", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => createElement("span", null, coin),
}));

vi.mock("@/components/trade/components/token-selector-dropdown", () => ({
	TokenSelectorDropdown: () => null,
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ actionsBlocked: false, tradeRestricted: false }),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: () => true,
	useDefaultDexBalances: () => ({
		accountAbstraction: "unifiedAccount",
		spotBalances: [{ coin: "USDC", total: "1000", hold: "0" }],
		spotAvailableAfterMaintenance: undefined,
		spotStateStatus: "success",
		spotStateReceivedAt: Date.now(),
		isDataStale: false,
		hasError: false,
	}),
}));

vi.mock("@/hooks/trade/use-fee-rates", () => ({ useFeeRates: () => ({ takerRate: 0.0007 }) }));
vi.mock("@/hooks/trade/use-tracked-order", () => ({
	useTrackedOrder: () => ({ submitOrder: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		isResolving: false,
		walletAddress: "0x1111111111111111111111111111111111111111",
	}),
}));
vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		builderConfig: null,
		clientKey: "0x1111111111111111111111111111111111111111",
		env: "Mainnet",
		sessionMode: "wallet",
	}),
	useSubscription: () => ({
		data: { coin: "@107", levels: [[{ px: "24.9", sz: "500" }], [{ px: "25", sz: "500" }]] },
		status: "active",
		isStale: false,
		lastMessageAt: Date.now(),
	}),
}));
vi.mock("@/lib/hyperliquid/hooks/useMarketsInfo", () => ({
	useMarketsInfo: () => ({
		spotMarkets: [
			{
				name: "@107",
				pairName: "HYPE/USDC",
				assetId: 10_107,
				szDecimals: 2,
				markPx: "25",
				isStablePair: false,
				tokensInfo: [
					{ name: "HYPE", displayName: "HYPE", szDecimals: 2 },
					{ name: "USDC", displayName: "USDC", szDecimals: 8 },
				],
			},
			{
				name: "@108",
				pairName: "USDE/USDC",
				assetId: 10_108,
				szDecimals: 2,
				markPx: "1",
				isStablePair: true,
				tokensInfo: [
					{ name: "USDE", displayName: "USDe", szDecimals: 2 },
					{ name: "USDC", displayName: "USDC", szDecimals: 8 },
				],
			},
		],
	}),
}));
vi.mock("@/stores/use-global-modal-store", () => ({
	useGlobalModalType: () => "swap",
	getGlobalModalOpening: () => "swap:1",
	useGlobalModalOpening: () => "swap:1",
	useSwapModalActions: () => ({ close: vi.fn() }),
	useSwapModalFromToken: () => "USDC",
	useSwapModalMode: () => mocks.mode,
	useSwapModalOpen: () => true,
	useSwapModalToToken: () => (mocks.mode === "stablecoin" ? "USDE" : "HYPE"),
}));

import { SpotSwapModal } from "@/components/trade/components/spot-swap-modal";

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

function computeAccessibleName(element: HTMLElement): string {
	const labelledBy = element.getAttribute("aria-labelledby")?.trim();
	if (labelledBy) {
		return labelledBy
			.split(/\s+/)
			.map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
			.filter(Boolean)
			.join(" ");
	}
	const ariaLabel = element.getAttribute("aria-label")?.trim();
	if (ariaLabel) return ariaLabel;
	if (element.id) {
		const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
		return label?.textContent?.trim() ?? "";
	}
	return "";
}

describe("SpotSwapModal accessible amount name", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.mode = "spot";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("includes the visible field label and token context in the computed accessible name for spot and stablecoin swaps", () => {
		act(() => root.render(createElement(SpotSwapModal)));
		const input = container.querySelector<HTMLInputElement>("input");
		expect(input).not.toBeNull();
		expect(input?.id).toBeTruthy();
		const label = container.querySelector<HTMLLabelElement>(`label[for="${input?.id}"]`);
		expect(label?.textContent).toBe("From");
		expect(input?.getAttribute("aria-label")).toBeNull();
		expect(input?.getAttribute("aria-labelledby")?.split(/\s+/)).toContain(label?.id);
		expect(computeAccessibleName(input as HTMLElement)).toBe("From Amount (USDC)");
		expect(computeAccessibleName(input as HTMLElement)).toContain(label?.textContent ?? "");

		act(() => {
			i18n.loadAndActivate({
				locale: "zh",
				messages: {
					[messageId("Amount ({token})")]: "数量（{token}）",
					[messageId("From")]: "从",
					[messageId("Sell")]: "卖出",
				},
			});
		});
		expect(label?.textContent).toBe("从");
		expect(computeAccessibleName(input as HTMLElement)).toBe("从 数量（USDC）");
		expect(computeAccessibleName(input as HTMLElement)).toContain("从");

		mocks.mode = "stablecoin";
		act(() => root.render(createElement(SpotSwapModal, { key: "stablecoin" })));
		const stableInput = container.querySelector<HTMLInputElement>("input");
		const stableLabel = container.querySelector<HTMLLabelElement>(`label[for="${stableInput?.id}"]`);
		expect(stableLabel?.textContent).toBe("卖出");
		expect(stableInput?.getAttribute("aria-label")).toBeNull();
		expect(stableInput?.getAttribute("aria-labelledby")?.split(/\s+/)).toContain(stableLabel?.id);
		expect(computeAccessibleName(stableInput as HTMLElement)).toBe("卖出 数量（USDC）");
		expect(computeAccessibleName(stableInput as HTMLElement)).toContain("卖出");

		act(() => {
			i18n.loadAndActivate({ locale: "en", messages: {} });
		});
		expect(stableLabel?.textContent).toBe("Sell");
		expect(computeAccessibleName(stableInput as HTMLElement)).toBe("Sell Amount (USDC)");
		expect(computeAccessibleName(stableInput as HTMLElement)).toContain("Sell");
	});
});
