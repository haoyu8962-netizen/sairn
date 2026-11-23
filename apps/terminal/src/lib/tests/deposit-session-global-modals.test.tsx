// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ComponentProps, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalModals } from "@/components/trade/components/global-modals";
import { DEPOSIT_SESSION_SETTLE_TIMEOUT_MS } from "@/config/time";
import { getDepositExecutionState } from "@/lib/hyperliquid/deposit-execution-state";
import { readCctpSponsoredAuthorizationIntent } from "@/lib/trade/cctp-deposit-tracking";
import { WALLET_SESSION_RESOLVING_MAX_MS } from "@/lib/wallet/session-resolving-clock";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import { createI18nRoot } from "./harness/react";
import {
	OTHER_OWNER,
	resetWalletSessionStage,
	SESSION_OWNER,
	setWalletSessionStage,
	type WalletSessionStage,
} from "./harness/wallet-session-stage";

// A manual external-wallet CCTP deposit whose wallet session changes after the permit signature, through the
// real GlobalModals (remount keyed by useFundsSessionKey), DepositModalHost, DepositModal, useDeposit,
// useWalletSession (driven by the stage harness) and viem's wallet client over a scripted EIP-1193 provider
// (ADR 0058). Only the SDK, network and data-hook boundaries are replaced.

const PERMIT_SIGNATURE = `0x${"0".repeat(128)}1b`;
const DEPOSIT_AMOUNT = "5";
const EXECUTION_KEY = `mainnet:manual:wallet:${SESSION_OWNER}`;

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => {};
	let reject: (error: unknown) => void = () => {};
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	// A held wallet answer that nobody awaits any more is rejected in afterEach; that is not an unhandled error.
	promise.catch(() => {});
	return { promise, resolve, reject };
}

const sdk = vi.hoisted(() => {
	const requests: Array<{ method: string; params?: unknown }> = [];
	const state = {
		answer: (method: string, _params: unknown): Promise<unknown> =>
			Promise.reject(Object.assign(new Error(`Unsupported provider method: ${method}`), { code: 4200 })),
	};
	const provider = {
		request({ method, params }: { method: string; params?: unknown }) {
			requests.push({ method, params });
			return state.answer(method, params);
		},
	};
	const wallets = new Map<string, object>();
	return {
		requests,
		state,
		provider,
		// Privy hands out the same ConnectedWallet object for the same wallet, so the deposit's provider effect
		// does not restart on every render.
		walletFor(address: string) {
			const key = address.toLowerCase();
			let wallet = wallets.get(key);
			if (!wallet) {
				wallet = {
					address,
					chainId: "eip155:42161",
					connectorType: "injected",
					walletClientType: "metamask",
					getEthereumProvider: async () => provider,
					switchChain: async () => {},
				};
				wallets.set(key, wallet);
			}
			return wallet;
		},
		info: { usdcRouting: vi.fn(), preTransferCheck: vi.fn(), legalCheck: vi.fn() },
		verifyLegalAction: vi.fn(),
		userRole: vi.fn(),
		geoRetry: vi.fn(),
		getClientForChain: vi.fn(),
		publicClient: {
			estimateContractGas: vi.fn(),
			getBalance: vi.fn(),
			getBlockNumber: vi.fn(),
			getGasPrice: vi.fn(),
			getTransaction: vi.fn(),
			getTransactionCount: vi.fn(),
			getTransactionReceipt: vi.fn(),
			readContract: vi.fn(),
		},
	};
});

const toastMocks = vi.hoisted(() => ({
	dismiss: vi.fn(),
	error: vi.fn(),
	loading: vi.fn(),
	success: vi.fn(),
	warning: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

vi.mock("@privy-io/react-auth", async () => {
	const { privyMock } = await import("./harness/wallet-session-stage");
	return {
		...privyMock,
		useWallets: () => {
			const directory = privyMock.useWallets();
			return { ready: directory.ready, wallets: directory.wallets.map((wallet) => sdk.walletFor(wallet.address)) };
		},
	};
});
vi.mock("@privy-io/react-auth/smart-wallets", () => ({
	useSmartWallets: () => ({ getClientForChain: sdk.getClientForChain }),
}));
vi.mock("wagmi", async () => ({
	...(await import("./harness/wallet-session-stage")).wagmiMock,
	useChainId: () => 42161,
	usePublicClient: () => sdk.publicClient,
}));
vi.mock("@privy-io/wagmi", async () => (await import("./harness/wallet-session-stage")).privyWagmiMock);

// The SDK boundary of hl-react: the selected owner follows the stage, every info read is scripted.
vi.mock("@sairn/hl-react", async (importOriginal) => {
	const { useHyperliquidSession } = await import("./harness/wallet-session-stage");
	return {
		...(await importOriginal<typeof import("@sairn/hl-react")>()),
		getInfoClient: () => ({ userRole: (params: unknown) => sdk.userRole(params) }),
		infoQueryOptions: (_info: unknown, method: string, params: unknown, env: string) => ({
			queryKey: ["hyperliquid", env, "info", method, params],
		}),
		useHyperliquid: () => ({ ...useHyperliquidSession(), info: sdk.info }),
		verifyLegalActionAllowed: (options: unknown) => sdk.verifyLegalAction(options),
	};
});

vi.mock("@/lib/hyperliquid", async () => {
	const { hyperliquidSessionMock, useHyperliquidSession } = await import("./harness/wallet-session-stage");
	const idleExchange = {
		error: null,
		isPending: false,
		isSuccess: false,
		mutateAsync: async () => {
			throw new Error("No exchange action is expected in a deposit");
		},
		reset: () => {},
	};
	return {
		...hyperliquidSessionMock,
		useHyperliquid: () => ({ ...useHyperliquidSession(), info: sdk.info }),
		useHyperliquidOptional: () => ({ ...useHyperliquidSession(), info: sdk.info }),
		classifyLegalStatusError: () => "unknown",
		infoQueryOptions: (_info: unknown, method: string, params: unknown, env: string) => ({
			queryKey: ["hl", env, method, params],
		}),
		useExchange: () => idleExchange,
		useInfo: () => ({
			data: undefined,
			isError: false,
			isFetching: false,
			isSuccess: false,
			refetch: async () => ({}),
		}),
		useLegalStatus: () => ({
			data: { acceptedTerms: true, userAllowed: true, canPerformActions: true },
			error: null,
			isError: false,
			isPending: false,
			refetch: () => {},
		}),
	};
});

vi.mock("@/hooks/wallet/use-email-embedded-wallet", () => ({
	useEmailEmbeddedWallet: () => ({
		emailAddress: null,
		embeddedWalletAddress: undefined,
		embeddedWalletError: null,
		ensureEmailEmbeddedWallet: async () => {},
		isCreatingEmbeddedWallet: false,
		needsEmbeddedWallet: false,
		shouldUseEmbeddedWallet: false,
	}),
}));
vi.mock("@/hooks/wallet/use-explicit-terms-acceptance", () => ({
	useExplicitTermsAcceptance: () => ({ isPending: false, mutateAsync: async () => {}, error: null, reset: () => {} }),
}));
vi.mock("@/lib/error-reporting/client", () => ({ reportClientError: () => {} }));
vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	hasAcceptedHip3Disclaimer: () => true,
	useHasAcceptedHip3Disclaimer: () => true,
}));
vi.mock("@/hooks/trade/use-hip3-disclaimer", () => ({
	useHip3DisclaimerRequirement: () => ({ isRequired: false, dex: undefined, documentationUrl: undefined }),
}));
vi.mock("@/components/trade/components/legal-acceptance-modal", async () => {
	const { createElement: h } = await import("react");
	return { LegalAcceptanceModal: () => h("div", { "data-testid": "legal-acceptance" }) };
});
vi.mock("@/components/trade/components/trading-onboarding-gate", () => ({
	TradingOnboardingGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/trade/components/position-dialog-host-gate", () => ({ PositionDialogHostGate: () => null }));
vi.mock("@/components/trade/components/position-market-close-submit-host-gate", () => ({
	PositionMarketCloseSubmitHostGate: () => null,
}));
vi.mock("@/components/trade/components/lazy-global-modals", async () => {
	const { DepositModal } = await import("@/components/trade/tradebox/deposit-modal");
	const Stub = () => null;
	return {
		CommandMenu: Stub,
		DepositModal,
		GlobalSettingsModal: Stub,
		PositionMarketCloseModal: Stub,
		SendModal: Stub,
		SpotSwapModal: Stub,
		TransferModal: Stub,
		useIdleGlobalModalPreload: () => {},
	};
});

// The deposit dialog's data hooks: a funded account on an external wallet, the CCTP route and a Circle fee of 0.2 USDC.
vi.mock("@/domain/trade/balances", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/domain/trade/balances")>();
	return {
		...actual,
		getAccountBalanceSummary: () => ({
			hasSpotFundsWhenPerpWithdrawableZero: false,
			isAvailable: true,
			usesSpotStateForPerps: false,
			spotUsdcAvailable: 0,
			withdrawable: 10,
		}),
	};
});
vi.mock("@/hooks/trade/use-account-abstraction-guard", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/hooks/trade/use-account-abstraction-guard")>()),
	useAccountAbstractionPreExecutionGuard: () => async () => {},
}));
vi.mock("@/hooks/trade/use-account-balances", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/hooks/trade/use-account-balances")>()),
	useDefaultDexBalances: () => ({
		accountAbstraction: "disabled",
		marginSummary: null,
		perpSummary: null,
		spotAvailableAfterMaintenance: null,
		spotBalances: [],
		withdrawable: "10",
		spotStateStatus: "success",
		perpStateStatus: "success",
		spotStateReceivedAt: 1,
		perpStateReceivedAt: 1,
		isDataStale: false,
		hasError: false,
	}),
}));
vi.mock("@/hooks/trade/use-cctp-withdrawal-fee", () => ({
	useCctpWithdrawalFee: () => ({
		data: "1",
		isError: false,
		isFetching: false,
		isSuccess: true,
		refetch: async () => ({}),
	}),
}));
vi.mock("@/hooks/trade/use-cctp-deposit-fee", () => {
	const feeQuote = {
		finalityThreshold: 1000,
		forwardFeeRaw: { high: 200_000n, low: 200_000n, med: 200_000n },
		minimumFeeBps: "0",
	};
	const data = { fastAllowanceRaw: 100_000_000n, feeQuote };
	return {
		useCctpDepositFee: () => ({
			calculation: { maxFeeRaw: 200_000n, netAmountRaw: 4_800_000n },
			belowMinimumRaw: null,
			data,
			hasSufficientFastAllowance: true,
			isError: false,
			isLoading: false,
			refetch: async () => ({ data, isError: false }),
		}),
	};
});
vi.mock("@/config/cctp-deposit", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/config/cctp-deposit")>()),
	isCctpExternalDepositEnabled: () => true,
	isCctpSponsoredDepositEnabled: () => true,
}));
vi.mock("@/hooks/trade/use-cctp-deposit-tracking", async (importOriginal) => {
	const tracking = {
		acknowledgeOutcome: () => {},
		data: undefined,
		isError: false,
		recoveryRecord: null,
		unacknowledgedOutcomes: [],
	};
	return {
		...(await importOriginal<typeof import("@/hooks/trade/use-cctp-deposit-tracking")>()),
		useCctpDepositTracking: () => tracking,
	};
});
vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: true,
		path: "external",
		reason: null,
		releasePathEnabled: true,
		signerReady: true,
		unavailableLabel: "Deposit unavailable",
		unavailableReason: null,
	}),
}));
vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({
		actionsBlocked: false,
		country: "GB",
		isError: false,
		isResolved: true,
		isResolving: false,
		proxy: false,
		retry: sdk.geoRetry,
		tradeRestricted: false,
	}),
}));
// The dialog's displayed route. The fresh route reads (`useFreshUsdcRouting`, `useAssertFreshDepositRoute`) stay
// real and reach `sdk.info.usdcRouting` through the hl-react boundary.
vi.mock("@/hooks/trade/use-usdc-routing", async (importOriginal) => {
	const routing = { depositRoute: "cctp", withdrawalRoute: "cctp" };
	const query = { data: routing, isError: false, isFetching: false, refetch: async () => ({ data: routing }) };
	return {
		...(await importOriginal<typeof import("@/hooks/trade/use-usdc-routing")>()),
		useUsdcRouting: () => query,
	};
});
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/lazy", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/lazy")>()),
	createLazyComponent: () => () => null,
}));
vi.mock("@/lib/lifi/bridge-execution-state", () => ({ useHasExistingBridgeExecution: () => false }));
vi.mock("@/config/privy-fiat-funding", () => ({ isPrivyFiatFundingEnabled: () => false }));
vi.mock("@/hooks/trade/use-privy-fiat-funding-offer", () => ({ usePrivyFiatFundingOffer: () => null }));
vi.mock("@/lib/trade/privy-fiat-funding-launch", () => ({ warmPrivyFiatFundingHost: () => {} }));
vi.mock("@/components/trade/tradebox/deposit/deposit-form", async () => {
	const { createElement: h } = await import("react");
	return {
		DepositForm: ({
			amount,
			isPending,
			onAmountChange,
			onSubmit,
			preflightError,
			routingPreflightError,
			usesFundingAddressFlow,
			validation,
		}: {
			amount: string;
			isPending: boolean;
			onAmountChange: (amount: string) => void;
			onSubmit: () => void;
			preflightError: string | null;
			routingPreflightError?: string | null;
			usesFundingAddressFlow: boolean;
			validation: { valid: boolean; error: string | null };
		}) =>
			h(
				"div",
				{
					"data-testid": "deposit-form",
					"data-deposit-amount": amount,
					"data-is-pending": String(isPending),
					"data-valid": String(validation.valid),
				},
				h("p", { "data-testid": "deposit-form-error" }, preflightError ?? routingPreflightError ?? validation.error),
				h("button", { onClick: () => onAmountChange("5"), type: "button" }, "Set deposit amount"),
				usesFundingAddressFlow ? null : h("button", { onClick: onSubmit, type: "button" }, "Submit deposit"),
			),
	};
});

let openDeposit: (() => void) | undefined;
let closeDeposit: (() => void) | undefined;

function DepositOpener() {
	const actions = useDepositModalActions();
	openDeposit = () => actions.open("deposit");
	closeDeposit = actions.close;
	return null;
}

function rejection(message: string, code: number) {
	return Object.assign(new Error(message), { code });
}

const PAGES: ReadonlyArray<readonly [string, ComponentProps<typeof GlobalModals>]> = [
	["a page without the legal gate", {}],
	[
		"a legal-gated trade page with onboarding and HIP-3",
		{ enableLegalGate: true, enableTradingOnboarding: true, enableHip3Disclaimer: true },
	],
];

describe.each(PAGES)(
	"a manual external-wallet deposit on %s whose session changes after the permit signature (ADR 0058)",
	(_page, props) => {
		let container: HTMLDivElement;
		let root: Root;
		let queryClient: QueryClient;
		let signature: Deferred<unknown>;
		let send: Deferred<unknown>;
		let signatureRequested: Deferred<void>;

		function show(stage: WalletSessionStage) {
			act(() => setWalletSessionStage(stage));
		}

		function requested(method: string) {
			return sdk.requests.filter((request) => request.method === method);
		}

		function form(): HTMLElement | null {
			return document.body.querySelector<HTMLElement>('[data-testid="deposit-form"]');
		}

		function dialog(): HTMLElement | null {
			return document.body.querySelector<HTMLElement>('[role="dialog"]');
		}

		function button(label: string): HTMLButtonElement {
			const match = [...document.body.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
			if (!match) throw new Error(`Missing ${label} button`);
			return match;
		}

		async function settle(rounds = 5) {
			for (let round = 0; round < rounds; round += 1) {
				await act(async () => {
					await new Promise((resolve) => setTimeout(resolve, 0));
				});
			}
		}

		async function waitUntil(check: () => boolean, label: string) {
			for (let attempt = 0; attempt < 200; attempt += 1) {
				if (check()) return;
				await act(async () => {
					await new Promise((resolve) => setTimeout(resolve, 5));
				});
			}
			throw new Error(`Timed out waiting until ${label}`);
		}

		function depositState() {
			return getDepositExecutionState(EXECUTION_KEY);
		}

		/** A dropped deposit leaves "pending"; one that wrongly went on is held at the wallet's send prompt. */
		async function waitUntilStoppedOrSent() {
			await waitUntil(
				() => depositState().status !== "pending" || requested("eth_sendTransaction").length > 0,
				"the deposit stops or asks the wallet to send",
			);
		}

		/** Opens the dialog, fills the amount, clicks Submit deposit and waits until the permit signature is requested. */
		async function startDepositUntilSignature() {
			act(() => openDeposit?.());
			await waitUntil(() => form() !== null, "the deposit form shows");
			act(() => button("Set deposit amount").click());
			await waitUntil(() => form()?.getAttribute("data-valid") === "true", "the reviewed amount is valid");
			expect(form()?.getAttribute("data-deposit-amount")).toBe(DEPOSIT_AMOUNT);
			act(() => button("Submit deposit").click());
			await act(async () => signatureRequested.promise);
			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expect(requested("eth_sendTransaction")).toHaveLength(0);
			expect(depositState().status).toBe("pending");
			await waitUntil(() => form() === null, "the pending deposit replaces the form");
			expect(dialog()?.textContent).toContain("Confirm in wallet");
		}

		function expectNothingSent() {
			expect(requested("eth_sendTransaction")).toHaveLength(0);
			expect(requested("wallet_sendTransaction")).toHaveLength(0);
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", SESSION_OWNER)).toBeNull();
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", OTHER_OWNER)).toBeNull();
		}

		function expectNoDepositFeedback() {
			expect(toastMocks.error).not.toHaveBeenCalled();
			expect(toastMocks.warning).not.toHaveBeenCalled();
			expect(document.body.textContent).not.toContain("Wallet not connected");
			expect(document.body.querySelector('[data-testid="deposit-form-error"]')?.textContent ?? "").toBe("");
		}

		beforeEach(() => {
			vi.clearAllMocks();
			window.localStorage.clear();
			window.sessionStorage.clear();
			resetWalletSessionStage("connected");
			Object.defineProperty(window, "matchMedia", {
				configurable: true,
				value: vi.fn().mockReturnValue({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }),
			});
			Object.defineProperty(window.navigator, "locks", {
				configurable: true,
				value: {
					request: async (name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) =>
						callback({ name, mode: "exclusive" } as Lock),
				},
			});
			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
					const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { method?: string }) : null;
					if (body?.method === "eth_call") {
						return new Response(JSON.stringify({ result: `0x${(10_000_000n).toString(16)}` }), { status: 200 });
					}
					if (String(input).includes("/fastBurn/USDC/allowance")) {
						return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
					}
					return new Response(
						JSON.stringify([
							{ finalityThreshold: 1000, minimumFee: 0, forwardFee: { low: 200000, med: 200000, high: 200000 } },
						]),
						{ status: 200 },
					);
				}),
			);

			sdk.requests.length = 0;
			signature = deferred();
			send = deferred();
			signatureRequested = deferred();
			sdk.state.answer = async (method) => {
				if (method === "eth_chainId") return "0xa4b1";
				if (method === "eth_accounts" || method === "eth_requestAccounts") return [SESSION_OWNER];
				if (method === "eth_signTypedData_v4") {
					signatureRequested.resolve();
					return signature.promise;
				}
				if (method === "eth_sendTransaction") return send.promise;
				throw rejection(`Unsupported provider method: ${method}`, 4200);
			};
			sdk.info.usdcRouting.mockResolvedValue({ depositRoute: "cctp", withdrawalRoute: "cctp" });
			sdk.verifyLegalAction.mockResolvedValue({ canPerformActions: true });
			sdk.userRole.mockResolvedValue({ role: "user" });
			sdk.geoRetry.mockResolvedValue({
				data: { country: "GB", proxy: false, tradeRestricted: false },
				isError: false,
			});
			sdk.publicClient.estimateContractGas.mockResolvedValue(21_000n);
			sdk.publicClient.getBalance.mockResolvedValue(1_000_000_000_000_000n);
			sdk.publicClient.getGasPrice.mockResolvedValue(1n);
			sdk.publicClient.getBlockNumber.mockResolvedValue(400_000_000n);
			sdk.publicClient.getTransactionCount.mockResolvedValue(0);
			sdk.publicClient.readContract.mockResolvedValue(0n);

			container = document.createElement("div");
			document.body.appendChild(container);
			queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
			root = createI18nRoot(container);
			act(() =>
				root.render(
					createElement(
						QueryClientProvider,
						{ client: queryClient },
						createElement(DepositOpener),
						createElement(GlobalModals, props),
					),
				),
			);
		});

		afterEach(async () => {
			signature.reject(rejection("User rejected the request.", 4001));
			send.reject(rejection("User rejected the request.", 4001));
			await settle();
			// The execution state is module-wide: a deposit still in flight here would block the next case.
			const leftInFlight = depositState().status === "pending";
			act(() => closeDeposit?.());
			act(() => root.unmount());
			queryClient.clear();
			container.remove();
			window.localStorage.clear();
			Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
			vi.unstubAllGlobals();
			expect(leftInFlight, "the deposit was still in flight when the case ended").toBe(false);
		});

		it("sends once when the session reconnects to the same owner after the signature", async () => {
			await startDepositUntilSignature();
			const pendingDialog = dialog();
			expect(pendingDialog).not.toBeNull();

			show("reconnecting");
			await act(async () => {
				signature.resolve(PERMIT_SIGNATURE);
			});
			await settle();
			expect(requested("eth_sendTransaction")).toHaveLength(0);
			expect(sdk.verifyLegalAction).not.toHaveBeenCalled();
			expect(sdk.publicClient.estimateContractGas).not.toHaveBeenCalled();
			expect(depositState().status).toBe("pending");
			expect(dialog()).toBe(pendingDialog);

			show("connected");
			await waitUntil(() => requested("eth_sendTransaction").length > 0, "the deposit asks the wallet to send");
			expect(dialog()).toBe(pendingDialog);
			expect(sdk.verifyLegalAction).toHaveBeenCalledOnce();
			expect(sdk.verifyLegalAction).toHaveBeenCalledWith(
				expect.objectContaining({ env: "Mainnet", owner: SESSION_OWNER.toLowerCase() }),
			);
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", SESSION_OWNER)).not.toBeNull();

			await act(async () => {
				send.reject(rejection("User rejected the request.", 4001));
			});
			await waitUntil(() => depositState().status !== "pending", "the deposit settles");
			await waitUntil(() => form() !== null, "the form is back");

			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expect(requested("eth_sendTransaction")).toHaveLength(1);
			expect(requested("wallet_sendTransaction")).toHaveLength(0);
			expect(toastMocks.error).toHaveBeenCalledOnce();
			expect(toastMocks.warning).not.toHaveBeenCalled();
			expect(depositState()).toMatchObject({ status: "idle", submissionOutcomeUnknown: false });
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", SESSION_OWNER)).toBeNull();
			expect(form()?.getAttribute("data-deposit-amount")).toBe(DEPOSIT_AMOUNT);
		});

		it("drops the signature quietly when the session settles on another owner", async () => {
			await startDepositUntilSignature();
			const pendingDialog = dialog();
			expect(pendingDialog).not.toBeNull();

			show("reconnecting");
			await act(async () => {
				signature.resolve(PERMIT_SIGNATURE);
			});
			await settle();
			expect(depositState().status).toBe("pending");
			expect(dialog()).toBe(pendingDialog);

			show("connected-other-owner");
			await waitUntilStoppedOrSent();
			await settle();

			expectNothingSent();
			expect(depositState()).toMatchObject({ status: "idle", error: null, submissionOutcomeUnknown: false });
			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expect(sdk.verifyLegalAction).not.toHaveBeenCalled();
			expectNoDepositFeedback();
			expect(pendingDialog?.isConnected).toBe(false);
			expect(dialog()).not.toBe(pendingDialog);
			expect(form()?.getAttribute("data-deposit-amount")).toBe("");
		});

		it("drops the signature quietly when the signed-in session loses its wallet (E2) and does not send when it comes back", async () => {
			await startDepositUntilSignature();
			const pendingDialog = dialog();

			show("wallet-missing");
			await act(async () => {
				signature.resolve(PERMIT_SIGNATURE);
			});
			await waitUntilStoppedOrSent();
			await settle();
			expectNothingSent();
			expect(depositState()).toMatchObject({ status: "idle", error: null, submissionOutcomeUnknown: false });
			expect(pendingDialog?.isConnected).toBe(false);

			show("connected");
			await waitUntil(() => form() !== null, "the dialog shows the form again");
			await settle();

			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expect(sdk.verifyLegalAction).not.toHaveBeenCalled();
			expectNothingSent();
			expectNoDepositFeedback();
			expect(depositState()).toMatchObject({ status: "idle", error: null, submissionOutcomeUnknown: false });
			expect(form()?.getAttribute("data-deposit-amount")).toBe("");
		});

		// The settle wait's own "timeout" (DEPOSIT_SESSION_SETTLE_TIMEOUT_MS, "Wallet not connected") is not reachable
		// through GlobalModals: the shared resolving clock ends the resolving state after WALLET_SESSION_RESOLVING_MAX_MS,
		// useFundsSessionKey then changes the key and the remount voids the attempt first.
		it("drops the signature quietly when the session never comes back and the resolving window ends first", async () => {
			await startDepositUntilSignature();
			const pendingDialog = dialog();

			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				show("reconnecting");
				await act(async () => {
					signature.resolve(PERMIT_SIGNATURE);
					for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
				});
				expect(depositState().status).toBe("pending");
				expect(dialog()).toBe(pendingDialog);

				await act(async () => {
					await vi.advanceTimersByTimeAsync(WALLET_SESSION_RESOLVING_MAX_MS - 1);
				});
				expect(depositState().status).toBe("pending");
				expect(dialog()).toBe(pendingDialog);

				await act(async () => {
					await vi.advanceTimersByTimeAsync(2);
				});
				expect(depositState()).toMatchObject({ status: "idle", error: null, submissionOutcomeUnknown: false });
				expect(pendingDialog?.isConnected).toBe(false);

				await act(async () => {
					await vi.advanceTimersByTimeAsync(DEPOSIT_SESSION_SETTLE_TIMEOUT_MS);
				});
				expect(depositState()).toMatchObject({ status: "idle", error: null, submissionOutcomeUnknown: false });
			} finally {
				vi.useRealTimers();
			}

			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expect(sdk.verifyLegalAction).not.toHaveBeenCalled();
			expectNothingSent();
			expect(toastMocks.error).not.toHaveBeenCalled();
			expect(toastMocks.warning).not.toHaveBeenCalled();
		});
	},
);
