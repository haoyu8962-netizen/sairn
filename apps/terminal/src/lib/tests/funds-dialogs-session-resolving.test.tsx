// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendModal } from "@/components/trade/positions/send-modal";
import { TransferModal } from "@/components/trade/positions/transfer-modal";
import { clearSendDraft } from "@/stores/use-send-draft-store";
import { createI18nRoot } from "./harness/react";
import {
	resetWalletSessionStage,
	setWalletSessionStage,
	type WalletSessionStage,
} from "./harness/wallet-session-stage";

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));

const numberFormatSetting = vi.hoisted(() => ({ locale: "en-US" }));
vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => numberFormatSetting.locale,
}));

const testState = vi.hoisted(() => ({
	pendingMethods: new Set<string>(),
	exchangeIdentity: {
		clientKey: "0x1111111111111111111111111111111111111111",
		env: "Mainnet" as "Mainnet" | "Testnet",
		exchangeLifecycle: { active: true, id: Symbol("exchange-lifecycle") },
		sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
		info: { preTransferCheck: vi.fn() },
	},
	walletSession: {
		address: "0x1111111111111111111111111111111111111111" as string | undefined,
		hasWalletAccess: true,
		sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
		walletAddress: "0x1111111111111111111111111111111111111111" as string | undefined,
		walletIntent: "embedded" as "embedded" | "external",
	},
	balances: {
		accountAbstraction: "disabled" as string | null,
		marginSummary: {
			accountValue: "1620.34",
			totalMarginUsed: "1564.34",
			totalRawUsd: "1620.34",
		},
		perpSummary: {
			accountValue: "1620.34",
			totalMarginUsed: "1564.34",
		},
		spotAvailableAfterMaintenance: [[0, "4947.18019669"]],
		spotBalances: [
			{
				coin: "USDC",
				entryNtl: "0",
				hold: "3140.833333",
				token: 0,
				total: "8105.34686269",
			},
		],
		withdrawable: "40",
		spotStateStatus: "success",
		perpStateStatus: "success",
		spotStateReceivedAt: Date.now(),
		perpStateReceivedAt: Date.now(),
		isDataStale: false,
		hasError: false,
	},
	exchangeMutations: {
		sendAsset: vi.fn(),
		spotSend: vi.fn(),
		usdClassTransfer: vi.fn(),
	},
	exchangeGuards: new Map<string, (_params: unknown, signal: AbortSignal) => Promise<void>>(),
	beforeSdk: vi.fn(),
	runGuardsOnMutation: false,
	assertAccountAbstraction: vi.fn(),
	assertFreshGeoAllowed: vi.fn(),
}));

function renderChildren(children: ReactNode) {
	return createElement(Fragment, null, children);
}

vi.mock("@sairn/ui", () => ({
	AdaptiveModal: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? createElement("section", null, children) : null,
	Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
	Checkbox: ({
		checked,
		disabled,
		label,
		onCheckedChange,
	}: {
		checked: boolean;
		disabled?: boolean;
		label: ReactNode;
		onCheckedChange: (checked: boolean) => void;
	}) =>
		createElement(
			"label",
			null,
			createElement("input", {
				type: "checkbox",
				checked,
				disabled,
				onChange: (event: { target: { checked: boolean } }) => onCheckedChange(event.target.checked),
			}),
			label,
		),
	Modal: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? renderChildren(children) : null),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalPopup: ({ children }: { children: ReactNode }) => createElement("section", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
	Select: ({
		options,
		triggerAriaLabel,
		value,
	}: {
		options: Array<{ label: string; value: string }>;
		triggerAriaLabel?: string;
		value: string;
	}) =>
		createElement(
			"select",
			{ "aria-label": triggerAriaLabel, value, onChange: () => {} },
			options.map((option) => createElement("option", { key: option.value, value: option.value }, option.label)),
		),
	TextInput: ({ error, mobileSafe: _mobileSafe, ...props }: Record<string, unknown>) =>
		createElement(
			"div",
			null,
			createElement("input", { ...props, "aria-invalid": error ? "true" : undefined }),
			error ? createElement("span", { "data-testid": "field-error" }, error as ReactNode) : null,
		),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: ({
		disabled,
		label,
		labelValue,
		onChange,
		onLabelValueClick,
		value,
	}: {
		label: string;
		labelValue: ReactNode;
		onChange: (event: { target: { value: string } }) => void;
		onLabelValueClick: () => void;
		value: string;
		disabled?: boolean;
	}) =>
		createElement(
			"div",
			null,
			createElement("span", null, label),
			createElement(
				"button",
				{ "data-testid": "available-balance", onClick: onLabelValueClick, type: "button" },
				labelValue,
			),
			createElement("input", {
				"aria-label": label,
				disabled,
				onChange,
				value,
			}),
		),
}));

vi.mock("@/hooks/trade/use-account-balances", async () => {
	const { useHyperliquidSession } = await import("./harness/wallet-session-stage");
	const noAccount = {
		accountAbstraction: null,
		spotBalances: [],
		withdrawable: "0",
		spotStateStatus: "idle",
		perpStateStatus: "idle",
		spotStateReceivedAt: undefined,
		perpStateReceivedAt: undefined,
		isDataStale: false,
		hasError: false,
	};
	return {
		isSupportedAccountAbstraction: (value: unknown) =>
			value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
		isTokenSpotBalance: (balance: object) => "token" in balance,
		useDefaultDexBalances: () =>
			useHyperliquidSession().clientKey === "disconnected" ? noAccount : testState.balances,
	};
});

vi.mock("@/hooks/trade/use-account-abstraction-guard", () => ({
	AccountAbstractionExecutionError: class AccountAbstractionExecutionError extends Error {
		constructor(readonly reason: "changed" | "unavailable") {
			super(reason);
		}
	},
	useAccountAbstractionPreExecutionGuard: () => testState.assertAccountAbstraction,
}));

const geoState = vi.hoisted(() => ({
	current: { isResolved: true, proxy: false, tradeRestricted: false, isError: false },
}));
vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => geoState.current,
}));

vi.mock(import("../../hooks/trade/use-funds-action-availability"), async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		useFundsActionAvailability: (input: Parameters<typeof actual.useFundsActionAvailability>[0]) => ({
			...actual.useFundsActionAvailability(input),
			assertFreshGeoAllowed: testState.assertFreshGeoAllowed,
		}),
	};
});

vi.mock("@privy-io/react-auth", async () => (await import("./harness/wallet-session-stage")).privyMock);
vi.mock("wagmi", async () => (await import("./harness/wallet-session-stage")).wagmiMock);
vi.mock("@privy-io/wagmi", async () => (await import("./harness/wallet-session-stage")).privyWagmiMock);

vi.mock("@/lib/hyperliquid", async () => {
	const { hyperliquidSessionMock, useHyperliquidSession } = await import("./harness/wallet-session-stage");
	return {
		...hyperliquidSessionMock,
		useHyperliquid: () => ({ ...testState.exchangeIdentity, ...useHyperliquidSession() }),
		useExchange: (
			method: keyof typeof testState.exchangeMutations,
			options?: {
				executionGuard?: (_params: unknown) => void;
				preExecutionGuard?: (_params: unknown, signal: AbortSignal) => Promise<void>;
			},
		) => {
			if (options?.preExecutionGuard) testState.exchangeGuards.set(method, options.preExecutionGuard);
			return {
				isPending: testState.pendingMethods.has(method),
				mutateAsync: (params: unknown) => {
					if (!testState.runGuardsOnMutation) return testState.exchangeMutations[method](params);
					return (async () => {
						const requestParams = { ...(params as Record<string, unknown>) };
						options?.executionGuard?.(requestParams);
						await options?.preExecutionGuard?.(requestParams, new AbortController().signal);
						await testState.beforeSdk(method, requestParams);
						options?.executionGuard?.(requestParams);
						return testState.exchangeMutations[method](requestParams);
					})();
				},
			};
		},
	};
});

vi.mock("@/lib/hyperliquid/markets/use-spot-tokens", () => ({
	useSpotTokens: () => ({
		getToken: (coin: string) => ({
			name: coin,
			displayName: coin === "UBTC" ? "BTC" : coin,
			tokenId: 0,
			transferDecimals: 6,
		}),
	}),
}));

function getAmountInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector('input[aria-label="Amount"]');
	if (!(input instanceof HTMLInputElement)) throw new Error("Amount input not found");
	return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
	const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (!valueSetter) throw new Error("Native input value setter not found");
	valueSetter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

const CONNECT_TO_TRANSFER = "Connect your wallet to transfer funds.";
const CONNECT_TO_SEND = "Connect your wallet to send funds.";
const AGENT_ONLY_REASON =
	"This phone uses a desktop-approved trading key. Deposits, withdrawals and transfers need the master wallet on desktop.";
const GEO_RESTRICTED = "Funds actions are not available in your region.";
const DESTINATION = "0x2222222222222222222222222222222222222222";

describe("funds dialogs while the wallet session resolves", () => {
	let container: HTMLDivElement;
	let root: Root;

	function show(stage: WalletSessionStage) {
		act(() => setWalletSessionStage(stage));
	}

	function getDestinationInput(): HTMLInputElement {
		const input = container.querySelector('input[aria-label="Destination address"]');
		if (!(input instanceof HTMLInputElement)) throw new Error("Destination input not found");
		return input;
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		window.sessionStorage.clear();
		resetWalletSessionStage("connected");
		geoState.current = { isResolved: true, proxy: false, tradeRestricted: false, isError: false };
		clearSendDraft();
		testState.pendingMethods.clear();
		testState.balances.spotStateReceivedAt = Date.now();
		testState.balances.perpStateReceivedAt = Date.now();
		for (const mutation of Object.values(testState.exchangeMutations)) mutation.mockReset();
		testState.exchangeIdentity.info.preTransferCheck.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	describe("Transfer", () => {
		beforeEach(() => {
			act(() => root.render(createElement(TransferModal, { onOpenChange: vi.fn(), open: true })));
			act(() => setInputValue(getAmountInput(container), "10"));
		});

		it("is ready for the exact owner", () => {
			expect(container.textContent).not.toContain(CONNECT_TO_TRANSFER);
			expect(getButton(container, "Transfer").disabled).toBe(false);
		});

		it.each(["reconnecting", "directory-initialising", "activating", "authentication-initialising"] as const)(
			"stays quiet and disabled while the session is %s, and keeps the amount",
			async (stage) => {
				show(stage);

				expect(container.textContent).not.toContain(CONNECT_TO_TRANSFER);
				expect(container.querySelector("svg")).toBeNull();
				expect(getButton(container, "Transfer").disabled).toBe(true);
				await act(async () => getButton(container, "Transfer").click());
				expect(testState.exchangeMutations.usdClassTransfer).not.toHaveBeenCalled();

				show("connected");
				expect(getAmountInput(container).value).toBe("10");
				expect(getButton(container, "Transfer").disabled).toBe(false);
			},
		);

		it.each(["signed-out", "wallet-missing", "connected-other-account"] as const)(
			"asks to connect once the session is %s",
			(stage) => {
				show(stage);

				expect(container.textContent).toContain(CONNECT_TO_TRANSFER);
				expect(getButton(container, "Transfer").disabled).toBe(true);
			},
		);

		it("gives an Agent-only session the desktop reason alone", () => {
			show("agent-only");

			expect(container.textContent).toContain(AGENT_ONLY_REASON);
			expect(container.textContent).not.toContain(CONNECT_TO_TRANSFER);
			expect(getButton(container, "Transfer").disabled).toBe(true);
		});
	});

	describe("Send", () => {
		beforeEach(() => {
			act(() =>
				root.render(
					createElement(SendModal, {
						initialAccountType: "spot",
						initialAsset: "USDC",
						onOpenChange: vi.fn(),
						open: true,
					}),
				),
			);
			act(() => setInputValue(getDestinationInput(), DESTINATION));
			act(() => setInputValue(getAmountInput(container), "10"));
		});

		it("is ready for the exact owner", () => {
			expect(container.textContent).not.toContain(CONNECT_TO_SEND);
			expect(getButton(container, "Send").disabled).toBe(false);
		});

		it.each(["reconnecting", "directory-initialising", "activating", "authentication-initialising"] as const)(
			"stays quiet and disabled while the session is %s",
			async (stage) => {
				show(stage);

				expect(container.textContent).not.toContain(CONNECT_TO_SEND);
				expect(getButton(container, "Send").disabled).toBe(true);
				await act(async () => getButton(container, "Send").click());
				expect(testState.exchangeIdentity.info.preTransferCheck).not.toHaveBeenCalled();
				expect(testState.exchangeMutations.sendAsset).not.toHaveBeenCalled();
				expect(testState.exchangeMutations.spotSend).not.toHaveBeenCalled();
			},
		);

		it.each(["signed-out", "wallet-missing", "connected-other-account"] as const)(
			"asks to connect once the session is %s",
			(stage) => {
				show(stage);

				expect(container.textContent).toContain(CONNECT_TO_SEND);
				expect(getButton(container, "Send").disabled).toBe(true);
			},
		);

		it("gives an Agent-only session the desktop reason alone", () => {
			show("agent-only");

			expect(container.textContent).toContain(AGENT_ONLY_REASON);
			expect(container.textContent).not.toContain(CONNECT_TO_SEND);
			expect(getButton(container, "Send").disabled).toBe(true);
		});

		it("gives an Agent-only session in a restricted region the region notice alone", () => {
			geoState.current = { ...geoState.current, tradeRestricted: true };
			show("agent-only");

			expect(container.textContent).toContain(GEO_RESTRICTED);
			expect(container.textContent).not.toContain(AGENT_ONLY_REASON);
			expect(container.textContent).not.toContain(CONNECT_TO_SEND);
			expect(getButton(container, "Send").disabled).toBe(true);
		});

		it("keeps the region notice of a wallet session and drops it while the session resolves", () => {
			geoState.current = { ...geoState.current, tradeRestricted: true };
			show("connected-other-owner");
			show("connected");
			expect(container.textContent).toContain(GEO_RESTRICTED);

			show("reconnecting");
			expect(container.textContent).not.toContain(GEO_RESTRICTED);
			expect(container.textContent).not.toContain(CONNECT_TO_SEND);
			expect(getButton(container, "Send").disabled).toBe(true);
		});
	});
});
