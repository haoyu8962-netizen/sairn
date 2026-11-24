// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { HttpRequestError } from "@nktkas/hyperliquid";
import { ExchangeActionDeadlineError } from "@sairn/hl-react/internal/exchange/request-scheduler";
import { act, createElement, Fragment, type ReactNode, useEffect, useSyncExternalStore } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendModal } from "@/components/trade/positions/send-modal";
import { TransferModal } from "@/components/trade/positions/transfer-modal";
import { AccountAbstractionExecutionError } from "@/hooks/trade/use-account-abstraction-guard";
import {
	getGlobalModalOpening,
	useCommandMenuActions,
	useGlobalModalType,
	useSendModalAccountType,
	useSendModalActions,
	useSendModalAsset,
	useTransferModalActions,
	useTransferModalDirection,
} from "@/stores/use-global-modal-store";
import { getSendDraft, resetSendDraft } from "@/stores/use-send-draft-store";
import { createI18nRoot } from "./harness/react";
import {
	OTHER_OWNER,
	resetWalletSessionStage,
	SESSION_OWNER,
	setWalletSessionStage,
	type WalletSessionStage,
} from "./harness/wallet-session-stage";

type SendModalActions = ReturnType<typeof useSendModalActions>;
type TransferModalActions = ReturnType<typeof useTransferModalActions>;

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
	balanceVersion: 0,
	balanceListeners: new Set<() => void>(),
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
		useDefaultDexBalances: () => {
			useSyncExternalStore(
				(listener) => {
					testState.balanceListeners.add(listener);
					return () => testState.balanceListeners.delete(listener);
				},
				() => testState.balanceVersion,
			);
			return useHyperliquidSession().clientKey === "disconnected" ? noAccount : { ...testState.balances };
		},
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
		resetSendDraft();
		testState.pendingMethods.clear();
		testState.runGuardsOnMutation = false;
		testState.beforeSdk.mockReset();
		testState.assertAccountAbstraction.mockReset();
		testState.assertFreshGeoAllowed.mockReset();
		testState.balances.accountAbstraction = "disabled";
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

	describe("a request in flight while the session resolves", () => {
		async function flush() {
			await act(async () => {
				for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
			});
		}

		it.each([
			["Transfer", "usdClassTransfer", "Transfer confirmed"],
			["Send", "spotSend", "Sent 10 USDC"],
		] as const)(
			"%s reports its outcome, closes and cannot be sent again after the session settles back",
			async (label, method, success) => {
				const onOpenChange = vi.fn();
				let resolveRequest: (value: unknown) => void = () => {};
				testState.exchangeMutations[method].mockReturnValue(
					new Promise((resolve) => {
						resolveRequest = resolve;
					}),
				);
				testState.exchangeIdentity.info.preTransferCheck.mockResolvedValue({
					fee: "0.0",
					isSanctioned: false,
					userExists: true,
					userHasSentTx: true,
				});
				act(() =>
					root.render(
						label === "Transfer"
							? createElement(TransferModal, { onOpenChange, open: true })
							: createElement(SendModal, {
									initialAccountType: "spot",
									initialAsset: "USDC",
									onOpenChange,
									open: true,
								}),
					),
				);
				if (label === "Send") act(() => setInputValue(getDestinationInput(), DESTINATION));
				act(() => setInputValue(getAmountInput(container), "10"));
				act(() => getButton(container, label).click());
				await flush();
				expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce();

				show("reconnecting");
				show("connected");
				act(() => getButton(container, label).click());
				await flush();
				expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce();

				resolveRequest({ status: "ok", response: { type: "default" } });
				await flush();
				expect(toastMocks.success.mock.calls.map((call) => call[0])).toEqual([success]);
				expect(onOpenChange).toHaveBeenCalledWith(false);
			},
		);
	});

	describe("a request in flight when the signed-in wallet leaves the directory without resolving (E2)", () => {
		async function flush() {
			await act(async () => {
				for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
			});
		}

		it.each([
			["Transfer", "usdClassTransfer"],
			["Send", "spotSend"],
		] as const)(
			"%s reports nothing and stays open when the wallet comes back on the same account, as it did before the hold",
			async (label, method) => {
				const onOpenChange = vi.fn();
				let resolveRequest: (value: unknown) => void = () => {};
				testState.exchangeMutations[method].mockReturnValue(
					new Promise((resolve) => {
						resolveRequest = resolve;
					}),
				);
				testState.exchangeIdentity.info.preTransferCheck.mockResolvedValue({
					fee: "0.0",
					isSanctioned: false,
					userExists: true,
					userHasSentTx: true,
				});
				act(() =>
					root.render(
						label === "Transfer"
							? createElement(TransferModal, { onOpenChange, open: true })
							: createElement(SendModal, {
									initialAccountType: "spot",
									initialAsset: "USDC",
									onOpenChange,
									open: true,
								}),
					),
				);
				if (label === "Send") act(() => setInputValue(getDestinationInput(), DESTINATION));
				act(() => setInputValue(getAmountInput(container), "10"));
				act(() => getButton(container, label).click());
				await flush();
				expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce();

				show("wallet-missing");
				show("connected");
				resolveRequest({ status: "ok", response: { type: "default" } });
				await flush();

				expect(toastMocks.success).not.toHaveBeenCalled();
				expect(toastMocks.error).not.toHaveBeenCalled();
				expect(toastMocks.warning).not.toHaveBeenCalled();
				expect(onOpenChange).not.toHaveBeenCalled();
			},
		);
	});

	describe("a late result once the resolving wallet reports another account", () => {
		const DIALOGS = {
			Transfer: { method: "usdClassTransfer", success: "Transfer confirmed", unknown: "Transfer status unknown" },
			Send: { method: "spotSend", success: "Sent 10 USDC", unknown: "Send status unknown" },
		} as const;
		type DialogLabel = keyof typeof DIALOGS;
		type Outcome = "success" | "ambiguous failure";

		async function flush() {
			await act(async () => {
				for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
			});
		}

		async function submitHeldRequest(label: DialogLabel, onOpenChange: (open: boolean) => void) {
			const { method } = DIALOGS[label];
			const request: { resolve: (value: unknown) => void; reject: (error: unknown) => void } = {
				resolve: () => {},
				reject: () => {},
			};
			testState.exchangeMutations[method].mockReturnValue(
				new Promise((resolve, reject) => {
					request.resolve = resolve;
					request.reject = reject;
				}),
			);
			testState.exchangeIdentity.info.preTransferCheck.mockResolvedValue({
				fee: "0.0",
				isSanctioned: false,
				userExists: true,
				userHasSentTx: true,
			});
			act(() =>
				root.render(
					label === "Transfer"
						? createElement(TransferModal, { onOpenChange, open: true })
						: createElement(SendModal, {
								initialAccountType: "spot",
								initialAsset: "USDC",
								onOpenChange,
								open: true,
							}),
				),
			);
			if (label === "Send") act(() => setInputValue(getDestinationInput(), DESTINATION));
			act(() => setInputValue(getAmountInput(container), "10"));
			act(() => getButton(container, label).click());
			await flush();
			expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce();
			return request;
		}

		function settle(
			request: { resolve: (value: unknown) => void; reject: (error: unknown) => void },
			outcome: Outcome,
		) {
			if (outcome === "success") request.resolve({ status: "ok", response: { type: "default" } });
			else request.reject(new HttpRequestError({ detail: "Request timed out" }));
		}

		it.each([
			["Transfer", "reconnecting-other-account", "success"],
			["Transfer", "reconnecting-other-account", "ambiguous failure"],
			["Transfer", "directory-initialising-other-account", "success"],
			["Transfer", "directory-initialising-other-account", "ambiguous failure"],
			["Send", "reconnecting-other-account", "success"],
			["Send", "reconnecting-other-account", "ambiguous failure"],
			["Send", "directory-initialising-other-account", "success"],
			["Send", "directory-initialising-other-account", "ambiguous failure"],
		] as const)(
			"%s reports nothing and stays open when a %s session receives the settled account's %s",
			async (label, stage, outcome) => {
				const onOpenChange = vi.fn();
				const request = await submitHeldRequest(label, onOpenChange);

				show(stage);
				settle(request, outcome);
				await flush();

				expect(toastMocks.success).not.toHaveBeenCalled();
				expect(toastMocks.warning).not.toHaveBeenCalled();
				expect(toastMocks.error).not.toHaveBeenCalled();
				expect(onOpenChange).not.toHaveBeenCalled();
			},
		);

		it.each([
			["Transfer", "success"],
			["Transfer", "ambiguous failure"],
			["Send", "success"],
			["Send", "ambiguous failure"],
		] as const)(
			"%s still reports a %s and closes while a reconnect reports the settled account",
			async (label, outcome) => {
				const onOpenChange = vi.fn();
				const request = await submitHeldRequest(label, onOpenChange);

				show("reconnecting");
				settle(request, outcome);
				await flush();

				const { success, unknown } = DIALOGS[label];
				if (outcome === "success") {
					expect(toastMocks.success.mock.calls.map((call) => call[0])).toEqual([success]);
					expect(toastMocks.warning).not.toHaveBeenCalled();
				} else {
					expect(toastMocks.warning.mock.calls.map((call) => call[0])).toEqual([unknown]);
					expect(toastMocks.success).not.toHaveBeenCalled();
				}
				expect(toastMocks.error).not.toHaveBeenCalled();
				expect(onOpenChange).toHaveBeenCalledWith(false);
			},
		);
	});

	describe("the outcome of a request whose account mode changes while it is in flight", () => {
		async function flush() {
			await act(async () => {
				for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
			});
		}

		function setAccountMode(mode: string | null) {
			act(() => {
				testState.balances.accountAbstraction = mode;
				testState.balanceVersion += 1;
				for (const listener of testState.balanceListeners) listener();
			});
		}

		function openAndSubmit(label: "Transfer" | "Send", onOpenChange: (open: boolean) => void) {
			testState.exchangeIdentity.info.preTransferCheck.mockResolvedValue({
				fee: "0.0",
				isSanctioned: false,
				userExists: true,
				userHasSentTx: true,
			});
			act(() =>
				root.render(
					label === "Transfer"
						? createElement(TransferModal, { onOpenChange, open: true })
						: createElement(SendModal, {
								initialAccountType: "spot",
								initialAsset: "USDC",
								onOpenChange,
								open: true,
							}),
				),
			);
			if (label === "Send") act(() => setInputValue(getDestinationInput(), DESTINATION));
			act(() => setInputValue(getAmountInput(container), "10"));
			act(() => getButton(container, label).click());
		}

		it.each([
			["Transfer", "unknown", "usdClassTransfer"],
			["Transfer", null, "usdClassTransfer"],
			["Send", "unknown", "spotSend"],
			["Send", null, "spotSend"],
		] as const)(
			"%s reports nothing and stays open when the mode turns %s after the request was sent (pre-existing behaviour)",
			async (label, mode, method) => {
				const onOpenChange = vi.fn();
				let resolveRequest: (value: unknown) => void = () => {};
				testState.exchangeMutations[method].mockReturnValue(
					new Promise((resolve) => {
						resolveRequest = resolve;
					}),
				);
				openAndSubmit(label, onOpenChange);
				await flush();
				expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce();

				setAccountMode(mode);
				resolveRequest({ status: "ok", response: { type: "default" } });
				await flush();

				expect(toastMocks.success).not.toHaveBeenCalled();
				expect(toastMocks.error).not.toHaveBeenCalled();
				expect(toastMocks.warning).not.toHaveBeenCalled();
				expect(onOpenChange).not.toHaveBeenCalled();
			},
		);

		it.each([
			["Transfer", "usdClassTransfer"],
			["Send", "spotSend"],
		] as const)(
			"%s reports nothing and stays open when the mode changed while it timed out (pre-existing behaviour)",
			async (label, method) => {
				const onOpenChange = vi.fn();
				let rejectRequest: (error: unknown) => void = () => {};
				testState.exchangeMutations[method].mockReturnValue(
					new Promise((_resolve, reject) => {
						rejectRequest = reject;
					}),
				);
				openAndSubmit(label, onOpenChange);
				await flush();

				setAccountMode("unknown");
				rejectRequest(new HttpRequestError({ detail: "Request timed out" }));
				await flush();

				expect(toastMocks.warning).not.toHaveBeenCalled();
				expect(toastMocks.error).not.toHaveBeenCalled();
				expect(onOpenChange).not.toHaveBeenCalled();
			},
		);

		it.each([
			["Transfer", "usdClassTransfer"],
			["Send", "spotSend"],
		] as const)(
			"%s stops quietly and keeps its draft when the mode changes before the request is sent",
			async (label, method) => {
				const onOpenChange = vi.fn();
				let releaseSdk: () => void = () => {};
				testState.runGuardsOnMutation = true;
				testState.beforeSdk.mockReturnValue(
					new Promise<void>((resolve) => {
						releaseSdk = resolve;
					}),
				);
				testState.exchangeMutations[method].mockResolvedValue({ status: "ok", response: { type: "default" } });
				openAndSubmit(label, onOpenChange);
				await flush();
				expect(testState.beforeSdk).toHaveBeenCalledOnce();

				setAccountMode("unifiedAccount");
				releaseSdk();
				await flush();

				expect(testState.exchangeMutations[method]).not.toHaveBeenCalled();
				expect(toastMocks.success).not.toHaveBeenCalled();
				expect(toastMocks.error).not.toHaveBeenCalled();
				expect(toastMocks.warning).not.toHaveBeenCalled();
				expect(onOpenChange).not.toHaveBeenCalled();
				expect(getAmountInput(container).value).toBe("10");
			},
		);
	});

	describe("a request stopped by its guards before it is sent", () => {
		async function flush() {
			await act(async () => {
				for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
			});
		}

		function setAccountMode(mode: string | null) {
			act(() => {
				testState.balances.accountAbstraction = mode;
				testState.balanceVersion += 1;
				for (const listener of testState.balanceListeners) listener();
			});
		}

		function openAndSubmitWithPendingModeRead(label: "Transfer" | "Send", onOpenChange: (open: boolean) => void) {
			const modeRead: { resolve: () => void; reject: (error: unknown) => void } = {
				resolve: () => {},
				reject: () => {},
			};
			testState.runGuardsOnMutation = true;
			testState.assertAccountAbstraction.mockReturnValueOnce(
				new Promise<void>((resolve, reject) => {
					modeRead.resolve = resolve;
					modeRead.reject = reject;
				}),
			);
			testState.exchangeIdentity.info.preTransferCheck.mockResolvedValue({
				fee: "0.0",
				isSanctioned: false,
				userExists: true,
				userHasSentTx: true,
			});
			act(() =>
				root.render(
					label === "Transfer"
						? createElement(TransferModal, { onOpenChange, open: true })
						: createElement(SendModal, {
								initialAccountType: "spot",
								initialAsset: "USDC",
								onOpenChange,
								open: true,
							}),
				),
			);
			if (label === "Send") act(() => setInputValue(getDestinationInput(), DESTINATION));
			act(() => setInputValue(getAmountInput(container), "10"));
			act(() => getButton(container, label).click());
			return modeRead;
		}

		function expectQuietStop(method: "usdClassTransfer" | "spotSend", onOpenChange: (open: boolean) => void) {
			expect(testState.exchangeMutations[method]).not.toHaveBeenCalled();
			expect(toastMocks.success).not.toHaveBeenCalled();
			expect(toastMocks.error).not.toHaveBeenCalled();
			expect(toastMocks.warning).not.toHaveBeenCalled();
			expect(onOpenChange).not.toHaveBeenCalled();
		}

		it.each([
			["Transfer", "usdClassTransfer"],
			["Send", "spotSend"],
		] as const)(
			"%s stays quiet when its fresh mode read reports the mode the dialog now shows",
			async (label, method) => {
				const onOpenChange = vi.fn();
				const modeRead = openAndSubmitWithPendingModeRead(label, onOpenChange);
				await flush();
				expect(testState.assertAccountAbstraction).toHaveBeenCalledOnce();

				setAccountMode("unifiedAccount");
				modeRead.reject(new AccountAbstractionExecutionError("changed"));
				await flush();

				expectQuietStop(method, onOpenChange);
				expect(getAmountInput(container).value).toBe("10");
			},
		);

		it.each([
			["Transfer", "usdClassTransfer"],
			["Send", "spotSend"],
		] as const)(
			"%s stays quiet when the mode turns unknown before its balance is checked again",
			async (label, method) => {
				const onOpenChange = vi.fn();
				const modeRead = openAndSubmitWithPendingModeRead(label, onOpenChange);
				await flush();

				setAccountMode(null);
				modeRead.resolve();
				await flush();

				expectQuietStop(method, onOpenChange);
				setAccountMode("disabled");
				expect(getAmountInput(container).value).toBe("10");
				expect(getButton(container, label).disabled).toBe(false);
			},
		);

		it.each([
			["Transfer", "usdClassTransfer"],
			["Send", "spotSend"],
		] as const)(
			"%s stays quiet and keeps its draft when the wallet reconnects during its guards",
			async (label, method) => {
				const onOpenChange = vi.fn();
				const modeRead = openAndSubmitWithPendingModeRead(label, onOpenChange);
				await flush();

				show("reconnecting");
				modeRead.resolve();
				await flush();

				expectQuietStop(method, onOpenChange);
				show("connected");
				expect(getAmountInput(container).value).toBe("10");
				expect(getButton(container, label).disabled).toBe(false);
			},
		);

		it.each([
			["Transfer", "usdClassTransfer"],
			["Send", "spotSend"],
		] as const)("%s still reports a mode change that the dialog has not shown", async (label, method) => {
			const onOpenChange = vi.fn();
			const modeRead = openAndSubmitWithPendingModeRead(label, onOpenChange);
			await flush();

			modeRead.reject(new AccountAbstractionExecutionError("changed"));
			await flush();

			expect(testState.exchangeMutations[method]).not.toHaveBeenCalled();
			expect(toastMocks.error).toHaveBeenCalledOnce();
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	});

	describe("a check of its own that fails after the account mode changed", () => {
		const SENDABLE_DESTINATION = { fee: "0.0", isSanctioned: false, userExists: true, userHasSentTx: true };
		const DESTINATION_FAILURES = {
			"activation-fee-changed": {
				answer: { kind: "resolve", value: { ...SENDABLE_DESTINATION, fee: "1.0" } },
				message: "The account activation fee changed before signing. Review the updated fee and try again.",
			},
			sanctioned: {
				answer: { kind: "resolve", value: { ...SENDABLE_DESTINATION, isSanctioned: true } },
				message: "Unable to send funds to this address.",
			},
			unavailable: {
				answer: { kind: "reject", value: new Error("pre-transfer check failed") },
				message: "Unable to check the destination address. Nothing was sent.",
			},
		} as const;

		async function flush() {
			await act(async () => {
				for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
			});
		}

		function setAccountMode(mode: string | null) {
			act(() => {
				testState.balances.accountAbstraction = mode;
				testState.balanceVersion += 1;
				for (const listener of testState.balanceListeners) listener();
			});
		}

		async function submitSendWithPausedFreshCheck(onOpenChange: (open: boolean) => void) {
			const freshCheck: { resolve: (value: unknown) => void; reject: (error: unknown) => void } = {
				resolve: () => {},
				reject: () => {},
			};
			testState.runGuardsOnMutation = true;
			testState.exchangeMutations.spotSend.mockResolvedValue({ status: "ok", response: { type: "default" } });
			testState.exchangeIdentity.info.preTransferCheck.mockResolvedValueOnce(SENDABLE_DESTINATION).mockReturnValueOnce(
				new Promise((resolve, reject) => {
					freshCheck.resolve = resolve;
					freshCheck.reject = reject;
				}),
			);
			act(() =>
				root.render(
					createElement(SendModal, {
						initialAccountType: "spot",
						initialAsset: "USDC",
						onOpenChange,
						open: true,
					}),
				),
			);
			act(() => setInputValue(getDestinationInput(), DESTINATION));
			act(() => setInputValue(getAmountInput(container), "10"));
			act(() => getButton(container, "Send").click());
			await flush();
			expect(testState.exchangeIdentity.info.preTransferCheck).toHaveBeenCalledTimes(2);
			return freshCheck;
		}

		function answer(
			freshCheck: { resolve: (value: unknown) => void; reject: (error: unknown) => void },
			failure: keyof typeof DESTINATION_FAILURES,
		) {
			const { answer: settled } = DESTINATION_FAILURES[failure];
			if (settled.kind === "resolve") freshCheck.resolve(settled.value);
			else freshCheck.reject(settled.value);
		}

		it.each(Object.keys(DESTINATION_FAILURES) as Array<keyof typeof DESTINATION_FAILURES>)(
			"Send stays quiet and keeps its draft when its fresh destination check reports %s after a mode change",
			async (failure) => {
				const onOpenChange = vi.fn();
				const freshCheck = await submitSendWithPausedFreshCheck(onOpenChange);

				setAccountMode("unifiedAccount");
				answer(freshCheck, failure);
				await flush();

				expect(testState.exchangeMutations.spotSend).not.toHaveBeenCalled();
				expect(toastMocks.success).not.toHaveBeenCalled();
				expect(toastMocks.error).not.toHaveBeenCalled();
				expect(toastMocks.warning).not.toHaveBeenCalled();
				expect(onOpenChange).not.toHaveBeenCalled();
				expect(getAmountInput(container).value).toBe("10");
				expect(getDestinationInput().value).toBe(DESTINATION);
			},
		);

		it.each(Object.keys(DESTINATION_FAILURES) as Array<keyof typeof DESTINATION_FAILURES>)(
			"Send still reports a fresh destination check that fails with %s when nothing changed",
			async (failure) => {
				const onOpenChange = vi.fn();
				const freshCheck = await submitSendWithPausedFreshCheck(onOpenChange);

				answer(freshCheck, failure);
				await flush();

				expect(testState.exchangeMutations.spotSend).not.toHaveBeenCalled();
				expect(toastMocks.error.mock.calls.map((call) => call[0])).toEqual([DESTINATION_FAILURES[failure].message]);
				expect(onOpenChange).toHaveBeenCalledWith(false);
			},
		);

		async function submitTransferWithPausedGeoCheck(onOpenChange: (open: boolean) => void) {
			const geoCheck: { reject: (error: unknown) => void } = { reject: () => {} };
			testState.runGuardsOnMutation = true;
			testState.exchangeMutations.usdClassTransfer.mockResolvedValue({ status: "ok", response: { type: "default" } });
			testState.assertFreshGeoAllowed.mockReturnValueOnce(
				new Promise<void>((_resolve, reject) => {
					geoCheck.reject = reject;
				}),
			);
			act(() => root.render(createElement(TransferModal, { onOpenChange, open: true })));
			act(() => setInputValue(getAmountInput(container), "10"));
			act(() => getButton(container, "Transfer").click());
			await flush();
			expect(testState.assertFreshGeoAllowed).toHaveBeenCalledOnce();
			return geoCheck;
		}

		it("Transfer stays quiet and keeps its draft when an unclassified check failure follows a mode change", async () => {
			const onOpenChange = vi.fn();
			const geoCheck = await submitTransferWithPausedGeoCheck(onOpenChange);

			setAccountMode("unifiedAccount");
			geoCheck.reject(new Error("geo lookup failed"));
			await flush();

			expect(testState.exchangeMutations.usdClassTransfer).not.toHaveBeenCalled();
			expect(toastMocks.success).not.toHaveBeenCalled();
			expect(toastMocks.error).not.toHaveBeenCalled();
			expect(toastMocks.warning).not.toHaveBeenCalled();
			expect(onOpenChange).not.toHaveBeenCalled();
			expect(getAmountInput(container).value).toBe("10");
		});

		it("Transfer still reports an unclassified check failure when nothing changed", async () => {
			const onOpenChange = vi.fn();
			const geoCheck = await submitTransferWithPausedGeoCheck(onOpenChange);

			geoCheck.reject(new Error("geo lookup failed"));
			await flush();

			expect(testState.exchangeMutations.usdClassTransfer).not.toHaveBeenCalled();
			expect(toastMocks.error.mock.calls.map((call) => call[0])).toEqual(["Transfer failed"]);
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	});

	describe("a Send whose destination check answers after the session changed", () => {
		async function flush() {
			await act(async () => {
				for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
			});
		}

		it.each([
			["settles back on the same owner", ["reconnecting", "connected"]],
			["is still resolving", ["reconnecting"]],
		] as const)("sends nothing when the session %s", async (_end, stages) => {
			let answerCheck: (value: unknown) => void = () => {};
			testState.exchangeIdentity.info.preTransferCheck.mockReturnValue(
				new Promise((resolve) => {
					answerCheck = resolve;
				}),
			);
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
			act(() => getButton(container, "Send").click());
			await flush();
			expect(testState.exchangeIdentity.info.preTransferCheck).toHaveBeenCalledOnce();

			for (const stage of stages) show(stage);
			if (stages.at(-1) === "connected") expect(getButton(container, "Send").disabled).toBe(false);
			answerCheck({ fee: "0.0", isSanctioned: false, userExists: true, userHasSentTx: true });
			await flush();

			expect(testState.exchangeMutations.spotSend).not.toHaveBeenCalled();
			expect(testState.exchangeMutations.sendAsset).not.toHaveBeenCalled();
			expect(toastMocks.error).not.toHaveBeenCalled();
			expect(getAmountInput(container).value).toBe("10");
		});

		it.each([
			["Transfer", "usdClassTransfer", true],
			["Transfer", "usdClassTransfer", false],
			["Send", "spotSend", true],
			["Send", "spotSend", false],
		] as const)(
			"%s keeps its dialog when the scheduler drops the request before it starts (reconnect in between: %s)",
			async (label, method, reconnects) => {
				const onOpenChange = vi.fn();
				let drop: (error: unknown) => void = () => {};
				testState.exchangeMutations[method].mockReturnValueOnce(
					new Promise((_resolve, reject) => {
						drop = reject;
					}),
				);
				testState.exchangeIdentity.info.preTransferCheck.mockResolvedValue({
					fee: "0.0",
					isSanctioned: false,
					userExists: true,
					userHasSentTx: true,
				});
				act(() =>
					root.render(
						label === "Transfer"
							? createElement(TransferModal, { onOpenChange, open: true })
							: createElement(SendModal, {
									initialAccountType: "spot",
									initialAsset: "USDC",
									onOpenChange,
									open: true,
								}),
					),
				);
				if (label === "Send") act(() => setInputValue(getDestinationInput(), DESTINATION));
				act(() => setInputValue(getAmountInput(container), "10"));
				act(() => getButton(container, label).click());
				await flush();
				if (reconnects) {
					show("reconnecting");
					show("connected");
				}
				drop(Object.assign(new Error("dropped before start"), { name: "ExchangeRequestInvalidatedError" }));
				await flush();

				if (reconnects) {
					expect(toastMocks.error).not.toHaveBeenCalled();
					expect(onOpenChange).not.toHaveBeenCalled();
					expect(getAmountInput(container).value).toBe("10");
					act(() => getButton(container, label).click());
					await flush();
					expect(testState.exchangeMutations[method]).toHaveBeenCalledTimes(2);
				} else {
					expect(toastMocks.error).toHaveBeenCalledOnce();
					expect(onOpenChange).toHaveBeenCalledWith(false);
				}
			},
		);

		it.each([
			["Transfer", true, "usdClassTransfer"],
			["Transfer", false, "usdClassTransfer"],
			["Send", true, "spotSend"],
			["Send", false, "spotSend"],
		] as const)(
			"%s keeps its dialog only when the request misses its start deadline across a reconnect (reconnect in between: %s)",
			async (label, reconnects, method) => {
				const onOpenChange = vi.fn();
				let expire: (error: unknown) => void = () => {};
				testState.exchangeMutations[method].mockReturnValueOnce(
					new Promise((_resolve, reject) => {
						expire = reject;
					}),
				);
				testState.exchangeIdentity.info.preTransferCheck.mockResolvedValue({
					fee: "0.0",
					isSanctioned: false,
					userExists: true,
					userHasSentTx: true,
				});
				act(() =>
					root.render(
						label === "Transfer"
							? createElement(TransferModal, { onOpenChange, open: true })
							: createElement(SendModal, {
									initialAccountType: "spot",
									initialAsset: "USDC",
									onOpenChange,
									open: true,
								}),
					),
				);
				if (label === "Send") act(() => setInputValue(getDestinationInput(), DESTINATION));
				act(() => setInputValue(getAmountInput(container), "10"));
				act(() => getButton(container, label).click());
				await flush();
				if (reconnects) {
					show("reconnecting");
					show("connected");
				}
				expire(new ExchangeActionDeadlineError());
				await flush();

				if (reconnects) {
					expect(toastMocks.error).not.toHaveBeenCalled();
					expect(toastMocks.warning).not.toHaveBeenCalled();
					expect(onOpenChange).not.toHaveBeenCalled();
					expect(getAmountInput(container).value).toBe("10");
					if (label === "Send") expect(getDestinationInput().value).toBe(DESTINATION);
				} else {
					expect(toastMocks.error).toHaveBeenCalledOnce();
					expect(onOpenChange).toHaveBeenCalledWith(false);
				}
			},
		);

		it("keeps another account's retry draft when a late result of the first account arrives", async () => {
			let settleFirst: (value: unknown) => void = () => {};
			testState.exchangeIdentity.info.preTransferCheck.mockResolvedValue({
				fee: "0.0",
				isSanctioned: false,
				userExists: true,
				userHasSentTx: true,
			});
			testState.exchangeMutations.spotSend
				.mockReturnValueOnce(
					new Promise((resolve) => {
						settleFirst = resolve;
					}),
				)
				.mockRejectedValueOnce(new Error("Insufficient balance"));
			function renderFor(owner: string) {
				act(() =>
					root.render(
						createElement(SendModal, {
							key: owner,
							initialAccountType: "spot",
							initialAsset: "USDC",
							onOpenChange: vi.fn(),
							open: true,
						}),
					),
				);
				act(() => setInputValue(getDestinationInput(), DESTINATION));
				act(() => setInputValue(getAmountInput(container), "10"));
			}

			renderFor(SESSION_OWNER);
			act(() => getButton(container, "Send").click());
			await flush();
			expect(testState.exchangeMutations.spotSend).toHaveBeenCalledOnce();

			show("connected-other-owner");
			renderFor(OTHER_OWNER);
			act(() => getButton(container, "Send").click());
			await flush();
			expect(testState.exchangeMutations.spotSend).toHaveBeenCalledTimes(2);
			expect(getSendDraft(`Mainnet:${OTHER_OWNER}`)).toMatchObject({ amount: "10", destination: DESTINATION });

			settleFirst({ status: "ok", response: { type: "default" } });
			await flush();
			expect(getSendDraft(`Mainnet:${OTHER_OWNER}`)).toMatchObject({ amount: "10", destination: DESTINATION });
		});

		it.each([
			["a definitive rejection", true],
			["a success", false],
		] as const)(
			"keeps another account's retry draft restorable when the first account's request settles with %s while it resolves",
			async (_outcome, rejects) => {
				const settle: { resolve: (value: unknown) => void; reject: (error: unknown) => void } = {
					resolve: () => {},
					reject: () => {},
				};
				testState.exchangeIdentity.info.preTransferCheck.mockResolvedValue({
					fee: "0.0",
					isSanctioned: false,
					userExists: true,
					userHasSentTx: true,
				});
				testState.exchangeMutations.spotSend
					.mockRejectedValueOnce(new Error("Insufficient balance"))
					.mockReturnValueOnce(
						new Promise((resolve, reject) => {
							settle.resolve = resolve;
							settle.reject = reject;
						}),
					);
				function renderFor(owner: string, amount?: string) {
					act(() =>
						root.render(
							createElement(SendModal, {
								key: owner,
								initialAccountType: "spot",
								initialAsset: "USDC",
								onOpenChange: vi.fn(),
								open: true,
							}),
						),
					);
					if (amount === undefined) return;
					act(() => setInputValue(getDestinationInput(), DESTINATION));
					act(() => setInputValue(getAmountInput(container), amount));
				}

				show("connected-other-owner");
				renderFor(OTHER_OWNER, "10");
				act(() => getButton(container, "Send").click());
				await flush();
				expect(getSendDraft(`Mainnet:${OTHER_OWNER}`)).toMatchObject({ amount: "10", destination: DESTINATION });

				show("connected");
				renderFor(SESSION_OWNER, "12");
				act(() => getButton(container, "Send").click());
				await flush();
				expect(testState.exchangeMutations.spotSend).toHaveBeenCalledTimes(2);

				show("reconnecting");
				if (rejects) settle.reject(new Error("Insufficient balance"));
				else settle.resolve({ status: "ok", response: { type: "default" } });
				await flush();

				if (rejects) {
					expect(toastMocks.error).toHaveBeenCalledTimes(2);
					expect(getSendDraft(`Mainnet:${SESSION_OWNER}`)).toMatchObject({ amount: "12", destination: DESTINATION });
				} else {
					expect(toastMocks.success).toHaveBeenCalledWith("Sent 12 USDC");
					expect(getSendDraft(`Mainnet:${SESSION_OWNER}`)).toBeNull();
				}
				expect(getSendDraft(`Mainnet:${OTHER_OWNER}`)).toMatchObject({ amount: "10", destination: DESTINATION });

				show("connected-other-owner");
				renderFor(OTHER_OWNER);
				expect(getDestinationInput().value).toBe(DESTINATION);
				expect(getAmountInput(container).value).toBe("10");
			},
		);
	});

	describe("a request in flight when the same dialog type is opened again through the global-modal store", () => {
		const opened: { send: SendModalActions | null; transfer: TransferModalActions | null } = {
			send: null,
			transfer: null,
		};
		const DIALOGS = {
			Send: { method: "spotSend", type: "send", success: "Sent 10 USDC" },
			Transfer: { method: "usdClassTransfer", type: "internalTransfer", success: "Transfer confirmed" },
		} as const;

		function StoreSendModal() {
			const actions = useSendModalActions();
			const open = useGlobalModalType() === "send";
			useEffect(() => {
				opened.send = actions;
			}, [actions]);
			return createElement(SendModal, {
				open,
				onOpenChange: (next: boolean) => {
					if (!next) actions.close();
				},
				initialAsset: useSendModalAsset(),
				initialAccountType: useSendModalAccountType(),
			});
		}

		function StoreTransferModal() {
			const actions = useTransferModalActions();
			const open = useGlobalModalType() === "internalTransfer";
			useEffect(() => {
				opened.transfer = actions;
			}, [actions]);
			return createElement(TransferModal, {
				open,
				onOpenChange: (next: boolean) => {
					if (!next) actions.close();
				},
				initialDirection: useTransferModalDirection(),
			});
		}

		function openDialog(label: keyof typeof DIALOGS) {
			act(() => {
				if (label === "Send") opened.send?.open("USDC", "spot");
				else opened.transfer?.open("toPerp");
			});
		}

		async function flush() {
			await act(async () => {
				for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
			});
		}

		afterEach(() => {
			act(() => {
				opened.send?.close();
				opened.transfer?.close();
			});
		});

		it.each([
			["Send", true],
			["Send", false],
			["Transfer", true],
			["Transfer", false],
		] as const)(
			"%s notifies the old result and closes the dialog, also when it was opened again (opened again: %s)",
			async (label, opensAgain) => {
				const { method, type, success } = DIALOGS[label];
				let resolveRequest: (value: unknown) => void = () => {};
				testState.exchangeMutations[method].mockReturnValueOnce(
					new Promise((resolve) => {
						resolveRequest = resolve;
					}),
				);
				testState.exchangeIdentity.info.preTransferCheck.mockResolvedValue({
					fee: "0.0",
					isSanctioned: false,
					userExists: true,
					userHasSentTx: true,
				});
				act(() => root.render(createElement(label === "Send" ? StoreSendModal : StoreTransferModal)));
				openDialog(label);
				if (label === "Send") act(() => setInputValue(getDestinationInput(), DESTINATION));
				act(() => setInputValue(getAmountInput(container), "10"));
				act(() => getButton(container, label).click());
				await flush();
				expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce();
				const sentFrom = getGlobalModalOpening();
				expect(sentFrom).toMatch(new RegExp(`^${type}:`));

				if (opensAgain) {
					openDialog(label);
					expect(getGlobalModalOpening()).not.toBe(sentFrom);
					act(() => setInputValue(getAmountInput(container), "25"));
				}

				resolveRequest({ status: "ok", response: { type: "default" } });
				await flush();

				expect(toastMocks.success.mock.calls.map((call) => call[0])).toEqual([success]);
				expect(getGlobalModalOpening()).toBeNull();
				expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce();
			},
		);

		it.each(["Send", "Transfer"] as const)(
			"%s rendered outside the global dialogs still closes after its result while another global dialog opened",
			async (label) => {
				const { method, success } = DIALOGS[label];
				let resolveRequest: (value: unknown) => void = () => {};
				testState.exchangeMutations[method].mockReturnValueOnce(
					new Promise((resolve) => {
						resolveRequest = resolve;
					}),
				);
				testState.exchangeIdentity.info.preTransferCheck.mockResolvedValue({
					fee: "0.0",
					isSanctioned: false,
					userExists: true,
					userHasSentTx: true,
				});
				const onOpenChange = vi.fn();
				const commandMenu: { open?: () => void; close?: () => void } = {};
				function CommandMenuOpener() {
					const actions = useCommandMenuActions();
					useEffect(() => {
						commandMenu.open = actions.open;
						commandMenu.close = actions.close;
					}, [actions]);
					return null;
				}
				act(() =>
					root.render(
						createElement(
							"div",
							null,
							createElement(CommandMenuOpener),
							label === "Send"
								? createElement(SendModal, {
										open: true,
										onOpenChange,
										initialAsset: "USDC",
										initialAccountType: "spot",
									})
								: createElement(TransferModal, { open: true, onOpenChange, initialDirection: "toPerp" }),
						),
					),
				);
				if (label === "Send") act(() => setInputValue(getDestinationInput(), DESTINATION));
				act(() => setInputValue(getAmountInput(container), "10"));
				act(() => getButton(container, label).click());
				await flush();
				expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce();

				act(() => commandMenu.open?.());
				expect(getGlobalModalOpening()).toMatch(/^commandMenu:/);
				resolveRequest({ status: "ok", response: { type: "default" } });
				await flush();

				expect(toastMocks.success.mock.calls.map((call) => call[0])).toEqual([success]);
				expect(onOpenChange).toHaveBeenCalledWith(false);
				act(() => commandMenu.close?.());
			},
		);
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
