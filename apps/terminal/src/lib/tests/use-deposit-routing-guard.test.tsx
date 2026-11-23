// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { getFundsActionLockName } from "@sairn/hl-react/internal/exchange/funds-action-lock";
import {
	ExchangeActionDeadlineError,
	startExchangeActionDeadline,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
	decodeFunctionData,
	encodeAbiParameters,
	encodeEventTopics,
	type Hash,
	type Hex,
	type TransactionReceipt,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddedDepositAutoBridge } from "@/components/trade/tradebox/embedded-deposit-auto-bridge";
import { CCTP_DEPOSIT_NETWORKS } from "@/config/cctp-deposit";
import { DEPOSIT_LOCKED_REQUEST_TIMEOUT_MS } from "@/config/time";
import { useCctpDepositTracking } from "@/hooks/trade/use-cctp-deposit-tracking";
import { formatTransferError } from "@/lib/errors/format";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import { getDepositExecutionState } from "@/lib/hyperliquid/deposit-execution-state";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";
import {
	type DepositReview,
	type DepositSessionCheck,
	type DepositSessionSettlement,
	type DepositSessionWaitResult,
	type UseDepositResult,
	useDeposit,
} from "@/lib/hyperliquid/use-deposit";
import {
	addressToBytes32,
	CCTP_EXTENSION_ABI,
	CCTP_EXTENSION_V2_ABI,
	USDC_EIP3009_AUTHORIZATION_ABI,
} from "@/lib/trade/cctp-deposit";
import {
	getCctpSponsoredAuthorizationIntentStorageKey,
	readCctpDepositTrackingRecords,
	readCctpSponsoredAuthorizationIntent,
	saveCctpDepositTrackingRecord,
} from "@/lib/trade/cctp-deposit-tracking";

const WALLET_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const SECOND_WALLET_ADDRESS = "0x2222222222222222222222222222222222222222" as const;
const PERMIT_SIGNATURE = `0x${"0".repeat(128)}1b` as const;
const SOURCE_HASH = `0x${"1".repeat(64)}` as Hash;
const reportClientError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/error-reporting/client", () => ({ reportClientError }));

function createSponsoredCctpReceipt(
	authNonce: Hex,
	eventName: "SponsoredDepositForBurn" | "SponsoredDepositForBurnSkipped" = "SponsoredDepositForBurn",
	isTestnet = false,
): TransactionReceipt {
	const config = isTestnet ? CCTP_DEPOSIT_NETWORKS.testnet : CCTP_DEPOSIT_NETWORKS.mainnet;
	return {
		status: "success",
		logs: [
			{
				address: config.cctpExtensionV2,
				topics: encodeEventTopics({
					abi: CCTP_EXTENSION_V2_ABI,
					eventName,
					args: { authNonce, depositor: WALLET_ADDRESS },
				}),
				data:
					eventName === "SponsoredDepositForBurn"
						? encodeAbiParameters(
								[{ type: "bytes32" }, { type: "uint32" }, { type: "uint256" }],
								[addressToBytes32(config.cctpForwarder), config.destinationDomain, 5_000_000n],
							)
						: "0x",
			},
		],
	} as unknown as TransactionReceipt;
}

function createSuccessfulCctpReceipt(): TransactionReceipt {
	const config = CCTP_DEPOSIT_NETWORKS.mainnet;
	return {
		status: "success",
		logs: [
			{
				address: config.cctpExtension,
				topics: encodeEventTopics({ abi: CCTP_EXTENSION_ABI, eventName: "BatchDepositForBurn" }),
				data: encodeAbiParameters(
					[{ type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint32" }],
					[1n, 5_000_000n, WALLET_ADDRESS, addressToBytes32(config.cctpForwarder), config.destinationDomain],
				),
			},
		],
	} as unknown as TransactionReceipt;
}

function createAuthorizationUsedLog(authNonce: Hex) {
	return {
		address: CCTP_DEPOSIT_NETWORKS.mainnet.usdc,
		topics: encodeEventTopics({
			abi: USDC_EIP3009_AUTHORIZATION_ABI,
			eventName: "AuthorizationUsed",
			args: { authorizer: WALLET_ADDRESS, nonce: authNonce },
		}),
		data: "0x",
	};
}

function stubSuccessfulCctpCapacity(
	balanceRaw = 5_000_000n,
	balanceBeforeSubmissionRaw = balanceRaw,
	getAllowance = () => 1_000_000,
) {
	let balanceRequestCount = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { method?: string }) : null;
			if (body?.method === "eth_call") {
				const currentBalanceRaw = balanceRequestCount === 0 ? balanceRaw : balanceBeforeSubmissionRaw;
				balanceRequestCount += 1;
				return new Response(JSON.stringify({ result: `0x${currentBalanceRaw.toString(16)}` }), { status: 200 });
			}
			if (body?.method === "eth_getTransactionReceipt") {
				return new Response(JSON.stringify({ result: null }), { status: 200 });
			}
			if (String(input).includes("/fastBurn/USDC/allowance")) {
				return new Response(JSON.stringify({ allowance: getAllowance() }), { status: 200 });
			}
			return new Response(
				JSON.stringify([
					{
						finalityThreshold: 1000,
						minimumFee: 0,
						forwardFee: { low: 200000, med: 200000, high: 200000 },
					},
				]),
				{ status: 200 },
			);
		}),
	);
}

const testState = vi.hoisted(() => {
	const providerRequest = vi.fn();
	return {
		createWalletClient: vi.fn(),
		custom: vi.fn<(...args: unknown[]) => unknown>(() => ({})),
		fetchRouting: vi.fn(),
		geoRefetch: vi.fn(),
		getClientForChain: vi.fn(),
		getUserRole: vi.fn(),
		isTestnet: false,
		lockRequest: vi.fn(),
		permitSign: vi.fn(),
		providerRequest,
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
		routingError: null as Error | null,
		routingResponse: { depositRoute: "bridge", withdrawalRoute: "cctp" } as unknown,
		selectedOwner: "0x1111111111111111111111111111111111111111",
		sponsoredEnabled: true,
		smartSendTransaction: vi.fn(),
		wallet: {
			address: "0x1111111111111111111111111111111111111111",
			chainId: "eip155:42161",
			connectorType: "embedded",
			getEthereumProvider: async () => ({ request: providerRequest }),
			switchChain: vi.fn(),
			walletClientType: "metamask",
		},
		walletWriteContract: vi.fn(),
		verifyLegalAction: vi.fn(),
	};
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@sairn/hl-react", () => ({
	getInfoClient: (isTestnet: boolean) => ({
		userRole: (params: unknown, signal?: AbortSignal) => testState.getUserRole(isTestnet, params, signal),
	}),
	infoQueryOptions: (_info: unknown, method: string, params: unknown, env: string) => ({
		queryKey: ["hyperliquid", env, "info", method, params],
	}),
	useHyperliquid: () => ({
		clientKey: testState.selectedOwner,
		env: testState.isTestnet ? "Testnet" : "Mainnet",
		info: { legalCheck: vi.fn(), usdcRouting: testState.fetchRouting },
		sessionMode: "wallet",
	}),
	useInfo: vi.fn(() => ({ data: testState.routingResponse, isError: false, isFetching: false })),
	useLegalStatus: () => ({ data: { userAllowed: true, canPerformActions: true, acceptedTerms: true } }),
	verifyLegalActionAllowed: (options: unknown) => testState.verifyLegalAction(options),
}));

vi.mock("@privy-io/react-auth", () => ({
	useWallets: () => ({ ready: true, wallets: [testState.wallet] }),
}));

vi.mock("@privy-io/react-auth/smart-wallets", () => ({
	useSmartWallets: () => ({ getClientForChain: testState.getClientForChain }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		walletAddress: WALLET_ADDRESS,
		embeddedWalletAddress: WALLET_ADDRESS,
		walletIntent: "embedded",
		user: { email: { address: "user@example.com" } },
	}),
}));

vi.mock("@/hooks/wallet/use-email-embedded-wallet", () => ({
	useEmailEmbeddedWallet: () => ({
		emailAddress: "user@example.com",
		embeddedWalletAddress: WALLET_ADDRESS,
		shouldUseEmbeddedWallet: true,
		needsEmbeddedWallet: false,
		isCreatingEmbeddedWallet: false,
		embeddedWalletError: null,
	}),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ retry: testState.geoRefetch }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => testState.isTestnet,
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalOpen: () => false,
}));

vi.mock("@/config/cctp-deposit", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/config/cctp-deposit")>();
	return {
		...original,
		isCctpExternalDepositEnabled: () => true,
		isCctpSponsoredDepositEnabled: () => testState.sponsoredEnabled,
	};
});

vi.mock("wagmi", () => ({
	useChainId: () => (testState.isTestnet ? 421614 : 42161),
	usePublicClient: () => testState.publicClient,
}));

vi.mock("viem", async (importOriginal) => {
	const original = await importOriginal<typeof import("viem")>();
	return {
		...original,
		createWalletClient: testState.createWalletClient,
		custom: (...args: unknown[]) => testState.custom(...args),
	};
});

describe("useDeposit fresh USDC route guard", () => {
	let capturedDeposit: UseDepositResult | null;
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(() => {
		reportClientError.mockReset();
		vi.clearAllMocks();
		window.localStorage.clear();
		testState.isTestnet = false;
		testState.lockRequest.mockImplementation(
			async (name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown | PromiseLike<unknown>) =>
				callback({ name, mode: "exclusive" } as Lock),
		);
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: { request: testState.lockRequest },
		});
		capturedDeposit = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		});
		root = createRoot(container);
		testState.routingError = null;
		testState.routingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
		testState.selectedOwner = WALLET_ADDRESS;
		testState.sponsoredEnabled = true;
		testState.wallet.address = WALLET_ADDRESS;
		testState.wallet.connectorType = "embedded";
		testState.wallet.chainId = "eip155:42161";
		testState.wallet.walletClientType = "metamask";
		testState.fetchRouting.mockImplementation(async () => {
			if (testState.routingError) throw testState.routingError;
			return testState.routingResponse;
		});
		testState.providerRequest.mockImplementation(async ({ method }: { method: string }) => {
			if (method === "eth_chainId") return testState.isTestnet ? "0x66eee" : "0xa4b1";
			if (method === "eth_accounts" || method === "eth_requestAccounts") return [WALLET_ADDRESS];
			throw new Error(`Unexpected provider method: ${method}`);
		});
		testState.publicClient.estimateContractGas.mockResolvedValue(21_000n);
		testState.publicClient.getBalance.mockResolvedValue(1_000_000_000_000_000n);
		testState.publicClient.getGasPrice.mockResolvedValue(1n);
		testState.publicClient.getBlockNumber.mockResolvedValue(400_000_000n);
		testState.publicClient.getTransactionCount.mockResolvedValue(0);
		testState.publicClient.readContract.mockResolvedValue(0n);
		testState.getUserRole.mockResolvedValue({ role: "user" });
		testState.geoRefetch.mockResolvedValue({
			data: { country: "GB", proxy: false, tradeRestricted: false },
			isError: false,
		});
		testState.permitSign.mockResolvedValue(PERMIT_SIGNATURE);
		testState.smartSendTransaction.mockRejectedValue(new Error("smart transaction boundary reached"));
		testState.walletWriteContract.mockRejectedValue(new Error("wallet transaction boundary reached"));
		testState.verifyLegalAction.mockResolvedValue({ canPerformActions: true });
		testState.createWalletClient.mockReturnValue({
			signTypedData: testState.permitSign,
			writeContract: testState.walletWriteContract,
		});
		testState.custom.mockImplementation(() => ({}));
		testState.getClientForChain.mockImplementation(async ({ id }: { id: number }) => ({
			chain: { id },
			paymaster: {},
			sendTransaction: testState.smartSendTransaction,
		}));
	});

	afterEach(() => {
		vi.useRealTimers();
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		window.localStorage.clear();
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});
		vi.unstubAllGlobals();
	});

	function Probe({
		balanceEnabled = false,
		balancePollIntervalMs,
		executionScope = "manual",
		mode,
		route = "bridge",
		sponsoredReadinessEnabled = false,
		walletAddress = WALLET_ADDRESS,
	}: {
		balanceEnabled?: boolean;
		balancePollIntervalMs?: number;
		executionScope?: "automatic" | "manual";
		mode: "smart" | "wallet";
		route?: "bridge" | "cctp";
		sponsoredReadinessEnabled?: boolean;
		walletAddress?: `0x${string}`;
	}) {
		capturedDeposit = useDeposit({
			balanceEnabled,
			balancePollIntervalMs,
			executionScope,
			mode,
			depositRoute: route,
			expectedCctpMaxFeeRaw: route === "cctp" ? 200_000n : undefined,
			sponsoredReadinessEnabled,
			walletAddress,
		});
		return null;
	}

	function renderMode(
		mode: "smart" | "wallet",
		route: "bridge" | "cctp" = "bridge",
		executionScope: "automatic" | "manual" = "manual",
	) {
		act(() => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(Probe, { executionScope, mode, route }),
				),
			);
		});
		if (!capturedDeposit) throw new Error("Deposit hook was not captured");
		return capturedDeposit;
	}

	async function renderSponsoredReadiness() {
		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(Probe, { mode: "smart", route: "cctp", sponsoredReadinessEnabled: true }),
				),
			);
		});
		for (let attempt = 0; attempt < 5 && capturedDeposit?.sponsoredCctpReadiness.status === "loading"; attempt += 1) {
			await act(async () => {
				await Promise.resolve();
			});
		}
		if (!capturedDeposit) throw new Error("Deposit hook was not captured");
		return capturedDeposit;
	}

	async function submit(
		mode: "smart" | "wallet",
		route: "bridge" | "cctp" = "bridge",
		review?: DepositReview | null,
		executionScope: "automatic" | "manual" = "manual",
	) {
		const depositHook = renderMode(mode, route, executionScope);
		const submittedReview =
			review === undefined && mode === "smart" && route === "cctp" && !testState.isTestnet
				? { expectedBalanceRaw: 5_000_000n, expectedCctpMaxFeeRaw: 200_000n }
				: (review ?? undefined);
		await act(async () => {
			await depositHook.deposit("5", submittedReview);
		});
	}

	it("preflights the target-chain Smart Wallet without signing or submitting", async () => {
		const depositHook = await renderSponsoredReadiness();

		expect(testState.getClientForChain).toHaveBeenCalledOnce();
		expect(testState.getClientForChain).toHaveBeenCalledWith({ id: 42161 });
		expect(depositHook.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
	});

	it.each([
		{
			failure: "build-gate-disabled" as const,
			prepare: () => {
				testState.sponsoredEnabled = false;
			},
			expectedClientCalls: 0,
		},
		{
			failure: "smart-client-unavailable" as const,
			prepare: () => {
				testState.getClientForChain.mockResolvedValue(undefined);
			},
			expectedClientCalls: 1,
		},
		{
			failure: "wrong-chain" as const,
			prepare: () => {
				testState.getClientForChain.mockResolvedValue({ chain: { id: 421614 }, paymaster: {} });
			},
			expectedClientCalls: 1,
		},
		{
			failure: "paymaster-unavailable" as const,
			prepare: () => {
				testState.getClientForChain.mockResolvedValue({ chain: { id: 42161 }, paymaster: undefined });
			},
			expectedClientCalls: 1,
		},
	])(
		"reports $failure before exposing sponsored funding readiness",
		async ({ expectedClientCalls, failure, prepare }) => {
			prepare();

			const depositHook = await renderSponsoredReadiness();

			expect(testState.getClientForChain).toHaveBeenCalledTimes(expectedClientCalls);
			expect(depositHook.sponsoredCctpReadiness).toMatchObject({ status: "error", failure });
			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		},
	);

	it("ignores an older Smart Wallet readiness result after retry", async () => {
		let resolveFirst: ((client: { chain: { id: number }; paymaster: object }) => void) | undefined;
		testState.getClientForChain
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirst = resolve;
					}),
			)
			.mockResolvedValue({ chain: { id: 42161 }, paymaster: {} });

		const firstRender = await renderSponsoredReadiness();
		expect(firstRender.sponsoredCctpReadiness.status).toBe("loading");

		await act(async () => {
			firstRender.sponsoredCctpReadiness.retry();
			await Promise.resolve();
		});
		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });

		await act(async () => {
			resolveFirst?.({ chain: { id: 421614 }, paymaster: {} });
			await Promise.resolve();
		});
		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });
		expect(testState.getClientForChain).toHaveBeenCalledTimes(2);
	});

	it("keeps the current readiness when StrictMode's discarded request resolves late", async () => {
		let resolveDiscarded: ((client: { chain: { id: number }; paymaster: object }) => void) | undefined;
		testState.getClientForChain
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveDiscarded = resolve;
					}),
			)
			.mockResolvedValue({ chain: { id: 42161 }, paymaster: {} });

		await act(async () => {
			root.render(
				createElement(
					StrictMode,
					null,
					createElement(
						QueryClientProvider,
						{ client: queryClient },
						createElement(Probe, { mode: "smart", route: "cctp", sponsoredReadinessEnabled: true }),
					),
				),
			);
			await Promise.resolve();
		});

		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });
		expect(testState.getClientForChain).toHaveBeenCalledTimes(2);

		await act(async () => {
			resolveDiscarded?.({ chain: { id: 421614 }, paymaster: {} });
			await Promise.resolve();
		});
		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });
	});

	it("withholds readiness immediately when the embedded wallet identity changes", async () => {
		let resolvePreviousIdentity: ((client: { chain: { id: number }; paymaster: object }) => void) | undefined;
		testState.getClientForChain
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolvePreviousIdentity = resolve;
					}),
			)
			.mockResolvedValue({ chain: { id: 42161 }, paymaster: {} });

		const firstRender = await renderSponsoredReadiness();
		expect(firstRender.sponsoredCctpReadiness.status).toBe("loading");

		testState.wallet.address = SECOND_WALLET_ADDRESS;
		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(Probe, {
						mode: "smart",
						route: "cctp",
						sponsoredReadinessEnabled: true,
						walletAddress: SECOND_WALLET_ADDRESS,
					}),
				),
			);
			await Promise.resolve();
		});
		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });

		await act(async () => {
			resolvePreviousIdentity?.({ chain: { id: 421614 }, paymaster: {} });
			await Promise.resolve();
		});
		expect(capturedDeposit?.sponsoredCctpReadiness).toMatchObject({ status: "ready", failure: null });
		expect(testState.getClientForChain).toHaveBeenCalledTimes(2);
	});

	it.each([
		{
			name: "CCTP is required",
			response: { depositRoute: "cctp", withdrawalRoute: "cctp" },
			error: null,
		},
		{
			name: "the fresh route request fails",
			response: null,
			error: new Error("routing unavailable"),
		},
		{
			name: "the fresh route response is malformed",
			response: { depositRoute: "bridge", withdrawalRoute: "unexpected" },
			error: null,
		},
	])("never signs or broadcasts when $name", async ({ error, response }) => {
		testState.routingError = error;
		testState.routingResponse = response;

		await submit("smart");
		await submit("wallet");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
	});

	it("stops the retired Bridge2 smart-wallet path before signing or submission", async () => {
		await submit("smart");

		expect(testState.fetchRouting).toHaveBeenCalledTimes(1);
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Legacy Bridge2 deposits are no longer accepted");
	});

	it("stops the retired Bridge2 browser-wallet path before signing or submission", async () => {
		await submit("wallet");

		expect(testState.fetchRouting).toHaveBeenCalledTimes(1);
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Legacy Bridge2 deposits are no longer accepted");
	});

	it.each(["smart", "wallet"] as const)(
		"fails closed before %s CCTP signing when regional availability cannot be verified",
		async (mode) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			testState.geoRefetch.mockResolvedValue({ data: undefined, isError: true });

			await submit(mode, "cctp");

			expect(testState.geoRefetch).toHaveBeenCalledOnce();
			expect(testState.getUserRole).not.toHaveBeenCalled();
			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error?.message).toContain("Unable to verify regional availability");
		},
	);

	it.each(["smart", "wallet"] as const)("fails closed before %s CCTP signing in a restricted region", async (mode) => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.geoRefetch.mockResolvedValue({
			data: { country: "US", proxy: false, tradeRestricted: true },
			isError: false,
		});

		await submit(mode, "cctp");

		expect(testState.geoRefetch).toHaveBeenCalledOnce();
		expect(testState.getUserRole).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Deposits are not available in your region");
	});

	it.each(["smart", "wallet"] as const)(
		"reports an unavailable Circle fee quote before %s CCTP signing with a translatable reason",
		async (mode) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("unavailable", { status: 503 })),
			);

			await submit(mode, "cctp");

			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error).toBeInstanceOf(LocalizedActionError);
			expect(capturedDeposit?.error?.message).toBe(
				"Unable to verify the current Circle CCTP fee and Fast Transfer capacity.",
			);
		},
	);

	it("uses the verified Circle CCTP path for an external wallet and never enters Bridge2", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
				}
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: 200000, med: 200000, high: 200000 },
						},
					]),
					{ status: 200 },
				);
			}),
		);

		await submit("wallet", "cctp");

		expect(testState.permitSign).toHaveBeenCalledTimes(1);
		expect(testState.walletWriteContract).toHaveBeenCalledWith(
			expect.objectContaining({
				address: "0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE",
				functionName: "batchDepositForBurnWithAuth",
			}),
		);
		expect(testState.lockRequest).toHaveBeenCalledWith(
			getFundsActionLockName("Mainnet", WALLET_ADDRESS),
			expect.objectContaining({ mode: "exclusive", signal: expect.any(AbortSignal) }),
			expect.any(Function),
		);
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
	});

	it.each(["smart", "wallet"] as const)(
		"forces a fresh selected-owner legal check before the %s CCTP funds write",
		async (mode) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.verifyLegalAction.mockRejectedValue(
				new Error("Hyperliquid access could not be verified before this action"),
			);

			await submit(mode, "cctp");

			expect(testState.verifyLegalAction).toHaveBeenCalledWith(
				expect.objectContaining({
					env: "Mainnet",
					forceFresh: true,
					owner: WALLET_ADDRESS,
				}),
			);
			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error?.message).toBe("Hyperliquid access could not be verified before this action");
		},
	);

	it.each(["smart", "wallet"] as const)(
		"rechecks the exact %s CCTP source account after the legal request",
		async (mode) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let legalRequestCompleted = false;
			testState.verifyLegalAction.mockImplementation(async () => {
				legalRequestCompleted = true;
				return { canPerformActions: true };
			});
			testState.providerRequest.mockImplementation(async ({ method }: { method: string }) => {
				if (method === "eth_chainId") return "0xa4b1";
				if (method === "eth_accounts" || method === "eth_requestAccounts") {
					return [legalRequestCompleted ? SECOND_WALLET_ADDRESS : WALLET_ADDRESS];
				}
				throw new Error(`Unexpected provider method: ${method}`);
			});

			await submit(mode, "cctp");

			expect(testState.verifyLegalAction).toHaveBeenCalledOnce();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error?.message).toContain("Selected wallet does not match");
		},
	);

	describe("wallet network", () => {
		const EXECUTION_KEY = `mainnet:manual:wallet:${WALLET_ADDRESS.toLowerCase()}`;

		function networkSwitchPending() {
			return getDepositExecutionState(EXECUTION_KEY).networkSwitchPending;
		}

		function providerOn(
			chainIds: () => unknown,
			options: { onSwitch?: (params: unknown) => Promise<unknown> | unknown } = {},
		) {
			const listeners = new Set<(chainId: unknown) => void>();
			const requests: Array<{ method: string; params?: unknown }> = [];
			testState.providerRequest.mockImplementation(async ({ method, params }: { method: string; params?: unknown }) => {
				if (method === "eth_chainId") return chainIds();
				if (method === "eth_accounts" || method === "eth_requestAccounts") return [WALLET_ADDRESS];
				if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
					requests.push({ method, params });
					return method === "wallet_switchEthereumChain" ? await options.onSwitch?.(params) : null;
				}
				throw new Error(`Unexpected provider method: ${method}`);
			});
			const provider = {
				request: testState.providerRequest,
				on: (_event: string, listener: (chainId: unknown) => void) => listeners.add(listener),
				removeListener: (_event: string, listener: (chainId: unknown) => void) => listeners.delete(listener),
			};
			testState.wallet.getEthereumProvider = async () => provider;
			return {
				listeners,
				requests,
				switchRequests: () => requests.filter((request) => request.method === "wallet_switchEthereumChain"),
				emitChainChanged: (chainId: unknown) => {
					for (const listener of listeners) listener(chainId);
				},
			};
		}

		async function flushUntil(condition: () => boolean) {
			for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) await Promise.resolve();
			expect(condition()).toBe(true);
		}

		afterEach(() => {
			testState.wallet.getEthereumProvider = async () => ({ request: testState.providerRequest });
			testState.wallet.switchChain = vi.fn();
		});

		it("accepts a WalletConnect provider that reports the Arbitrum chain id as a number", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			const { listeners, requests } = providerOn(() => 42161);

			await submit("wallet", "cctp");

			expect(requests).toHaveLength(0);
			expect(testState.wallet.switchChain).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
		});

		it("asks the wallet itself to switch when Privy already believes it is on Arbitrum", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let chainId: unknown = 56;
			let pendingDuringSwitch: boolean | undefined;
			const { listeners, requests, emitChainChanged } = providerOn(() => chainId, {
				onSwitch: () => {
					pendingDuringSwitch = networkSwitchPending();
					setTimeout(() => {
						chainId = "0xa4b1";
						emitChainChanged("0xa4b1");
					}, 0);
					return null;
				},
			});

			await submit("wallet", "cctp");

			expect(testState.wallet.switchChain).not.toHaveBeenCalled();
			expect(requests).toEqual([{ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa4b1" }] }]);
			expect(pendingDuringSwitch).toBe(true);
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
		});

		it("adds Arbitrum and switches again when the wallet does not know the chain", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let chainId: unknown = 56;
			let switchAttempts = 0;
			const { requests } = providerOn(() => chainId, {
				onSwitch: () => {
					switchAttempts += 1;
					if (switchAttempts === 1) throw Object.assign(new Error("Unrecognized chain ID"), { code: 4902 });
					chainId = 42161;
					return null;
				},
			});

			await submit("wallet", "cctp");

			expect(requests.map((request) => request.method)).toEqual([
				"wallet_switchEthereumChain",
				"wallet_addEthereumChain",
				"wallet_switchEthereumChain",
			]);
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
		});

		it("continues on the chainChanged event before the next poll is due", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let chainId: unknown = 56;
			const { listeners, switchRequests, emitChainChanged } = providerOn(() => chainId);
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await flushUntil(() => switchRequests().length === 1 && listeners.size === 1);
				chainId = 42161;
				emitChainChanged("0xa4b1");
				await request;
			});

			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(listeners.size).toBe(0);
		});

		it("switches through the wallet's own provider exactly once and waits for it to report Arbitrum", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			let chainId: unknown = "0x38";
			let pendingDuringSwitch: boolean | undefined;
			let pendingDuringSigning: boolean | undefined;
			const { listeners, switchRequests } = providerOn(() => chainId, {
				onSwitch: () => {
					pendingDuringSwitch = networkSwitchPending();
					setTimeout(() => {
						chainId = 42161;
					}, 9_000);
					return null;
				},
			});
			testState.permitSign.mockImplementation(async () => {
				pendingDuringSigning = networkSwitchPending();
				return PERMIT_SIGNATURE;
			});
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await vi.advanceTimersByTimeAsync(9_500);
				await request;
			});

			expect(testState.wallet.switchChain).not.toHaveBeenCalled();
			expect(switchRequests()).toEqual([{ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa4b1" }] }]);
			expect(pendingDuringSwitch).toBe(true);
			expect(pendingDuringSigning).toBe(false);
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
		});

		it("reports a wallet that never moves to Arbitrum without a second switch request", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			const { listeners, switchRequests } = providerOn(() => "0x38");
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await vi.advanceTimersByTimeAsync(9_900);
				expect(testState.walletWriteContract).not.toHaveBeenCalled();
				expect(networkSwitchPending()).toBe(true);
				await vi.advanceTimersByTimeAsync(200);
				await request;
			});

			expect(testState.wallet.switchChain).not.toHaveBeenCalled();
			expect(switchRequests()).toHaveLength(1);
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
			expect(capturedDeposit?.error?.message).toContain("Wallet is not connected to");
		});

		it("gives up on a chain query that never answers once the settle window closes", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let switched = false;
			const { listeners } = providerOn(() => (switched ? new Promise(() => {}) : 56), {
				onSwitch: () => {
					switched = true;
					return null;
				},
			});
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await vi.advanceTimersByTimeAsync(10_100);
				await request;
			});

			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
			expect(capturedDeposit?.error?.message).toContain("Wallet is not connected to");
		});

		function deferred<T>() {
			let resolve!: (value: T) => void;
			let reject!: (reason: unknown) => void;
			const promise = new Promise<T>((res, rej) => {
				resolve = res;
				reject = rej;
			});
			return { promise, resolve, reject };
		}

		it("exposes the network switch through the hook while the wallet is asked to switch", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			let chainId: unknown = 56;
			const switchAnswer = deferred<void>();
			const { switchRequests } = providerOn(() => chainId, { onSwitch: () => switchAnswer.promise });
			const depositHook = renderMode("wallet", "cctp");
			expect(depositHook.networkSwitchPending).toBe(false);

			let request: Promise<void> | undefined;
			await act(async () => {
				request = depositHook.deposit("5");
				await flushUntil(() => switchRequests().length === 1);
			});
			expect(capturedDeposit?.networkSwitchPending).toBe(true);

			await act(async () => {
				chainId = 42161;
				switchAnswer.resolve();
				await request;
			});
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
		});

		it("ignores chain answers that arrive after the settle window closed", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let switched = false;
			const lateAnswers: Array<ReturnType<typeof deferred<unknown>>> = [];
			let queries = 0;
			const { listeners, emitChainChanged } = providerOn(
				() => {
					if (!switched) return 56;
					queries += 1;
					const answer = deferred<unknown>();
					lateAnswers.push(answer);
					return answer.promise;
				},
				{
					onSwitch: () => {
						switched = true;
						return null;
					},
				},
			);
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await vi.advanceTimersByTimeAsync(10_100);
				await request;
			});
			const queriesAtDeadline = queries;
			expect(queriesAtDeadline).toBe(1);
			expect(capturedDeposit?.error?.message).toContain("Wallet is not connected to");
			const errorAtDeadline = capturedDeposit?.error;

			await act(async () => {
				lateAnswers[0]?.resolve(56);
				emitChainChanged("0xa4b1");
				await vi.advanceTimersByTimeAsync(2_000);
			});

			expect(queries).toBe(queriesAtDeadline);
			expect(listeners.size).toBe(0);
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error).toBe(errorAtDeadline);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
		});

		it("stops waiting and cleans up when a chain query fails during the observation", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let switched = false;
			let queries = 0;
			const failure = deferred<unknown>();
			const { listeners } = providerOn(
				() => {
					if (!switched) return 56;
					queries += 1;
					return failure.promise;
				},
				{
					onSwitch: () => {
						switched = true;
						return null;
					},
				},
			);
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await flushUntil(() => queries === 1 && listeners.size === 1);
				failure.reject(new Error("provider closed"));
				await request;
			});

			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
			expect(capturedDeposit?.error).not.toBeNull();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();

			await act(async () => {
				await vi.advanceTimersByTimeAsync(11_000);
			});
			expect(queries).toBe(1);
		});

		it("does not query again after the chainChanged event ended the wait", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let switched = false;
			let chainId: unknown = 56;
			let queriesAfterSwitch = 0;
			const { listeners, emitChainChanged } = providerOn(
				() => {
					if (switched) queriesAfterSwitch += 1;
					return chainId;
				},
				{
					onSwitch: () => {
						switched = true;
						return null;
					},
				},
			);
			const depositHook = renderMode("wallet", "cctp");
			const scheduled: Array<{ id: unknown; delay: unknown }> = [];
			const fakeSetTimeout = globalThis.setTimeout;
			const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
				handler: Parameters<typeof setTimeout>[0],
				delay?: number,
				...args: unknown[]
			) => {
				const id = fakeSetTimeout(handler, delay, ...args);
				scheduled.push({ id, delay });
				return id;
			}) as typeof setTimeout);
			const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

			await act(async () => {
				const request = depositHook.deposit("5");
				await flushUntil(() => queriesAfterSwitch === 1 && listeners.size === 1);
				await vi.advanceTimersByTimeAsync(100);
				chainId = 42161;
				emitChainChanged("42161");
				await request;
			});
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			const deadlineTimer = scheduled.find((timer) => timer.delay === 10_000);
			const pollTimer = scheduled.find((timer) => timer.delay === 250);
			expect(deadlineTimer).toBeDefined();
			expect(pollTimer).toBeDefined();
			expect(clearTimeoutSpy).toHaveBeenCalledWith(deadlineTimer?.id);
			expect(clearTimeoutSpy).toHaveBeenCalledWith(pollTimer?.id);
			setTimeoutSpy.mockRestore();
			clearTimeoutSpy.mockRestore();
			const queriesAtEnd = queriesAfterSwitch;

			await act(async () => {
				await vi.advanceTimersByTimeAsync(11_000);
			});
			expect(queriesAfterSwitch).toBe(queriesAtEnd);
			expect(listeners.size).toBe(0);
		});

		it("keeps waiting when the wallet reports a chain other than Arbitrum", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let switched = false;
			let chainId: unknown = 56;
			const { listeners, emitChainChanged } = providerOn(() => chainId, {
				onSwitch: () => {
					switched = true;
					return null;
				},
			});
			const depositHook = renderMode("wallet", "cctp");

			let request: Promise<void> | undefined;
			await act(async () => {
				request = depositHook.deposit("5");
				await flushUntil(() => switched && listeners.size === 1);
				emitChainChanged("0x1");
				await vi.advanceTimersByTimeAsync(250);
			});
			expect(listeners.size).toBe(1);
			expect(capturedDeposit?.networkSwitchPending).toBe(true);
			expect(testState.permitSign).not.toHaveBeenCalled();

			await act(async () => {
				chainId = 42161;
				emitChainChanged("0xa4b1");
				await request;
			});
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
		});

		it("lets Rabby settle before asking it to add a chain it reported unknown, as Privy does", async () => {
			vi.useFakeTimers();
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			testState.wallet.walletClientType = "rabby_wallet";
			let chainId: unknown = 56;
			let switchAttempts = 0;
			const { requests } = providerOn(() => chainId, {
				onSwitch: () => {
					switchAttempts += 1;
					if (switchAttempts === 1) throw new Error("Unrecognized chain ID 0xa4b1");
					chainId = 42161;
					return null;
				},
			});
			const depositHook = renderMode("wallet", "cctp");

			await act(async () => {
				const request = depositHook.deposit("5");
				await flushUntil(() => switchAttempts === 1);
				await vi.advanceTimersByTimeAsync(299);
				expect(requests.map((entry) => entry.method)).toEqual(["wallet_switchEthereumChain"]);
				await vi.advanceTimersByTimeAsync(1);
				await request;
			});

			expect(testState.wallet.switchChain).not.toHaveBeenCalled();
			expect(requests.map((entry) => entry.method)).toEqual([
				"wallet_switchEthereumChain",
				"wallet_addEthereumChain",
				"wallet_switchEthereumChain",
			]);
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
		});

		it.each([
			{
				wallet: "Coinbase",
				answer: new Error("Unrecognized chain ID. Try adding the chain using addEthereumChain first."),
			},
			{ wallet: "a wallet that only names the code", answer: new Error("Error 4902: chain not added") },
		])("adds Arbitrum when $wallet reports the chain unknown", async ({ answer }) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let chainId: unknown = 56;
			let switchAttempts = 0;
			const { requests } = providerOn(() => chainId, {
				onSwitch: () => {
					switchAttempts += 1;
					if (switchAttempts === 1) throw answer;
					chainId = 42161;
					return null;
				},
			});

			await submit("wallet", "cctp");

			expect(requests.map((entry) => entry.method)).toEqual([
				"wallet_switchEthereumChain",
				"wallet_addEthereumChain",
				"wallet_switchEthereumChain",
			]);
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
		});

		it("does not add the chain when the wallet rejected the switch", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			const { requests, listeners } = providerOn(() => 56, {
				onSwitch: () => {
					throw Object.assign(new Error("User rejected the request."), { code: 4001 });
				},
			});

			await submit("wallet", "cctp");

			expect(testState.wallet.switchChain).not.toHaveBeenCalled();
			expect(requests.map((entry) => entry.method)).toEqual(["wallet_switchEthereumChain"]);
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(listeners.size).toBe(0);
			expect(capturedDeposit?.networkSwitchPending).toBe(false);
			expect(capturedDeposit?.error?.message).toBe("Arbitrum network switch was rejected.");
		});

		it("does not sign the authorization when the wallet leaves Arbitrum before signing", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let chainId: unknown = 42161;
			let routingChecks = 0;
			providerOn(() => chainId);
			testState.fetchRouting.mockImplementation(async () => {
				routingChecks += 1;
				if (routingChecks === 2) chainId = 56;
				return testState.routingResponse;
			});

			await submit("wallet", "cctp");

			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error?.message).toContain("Wallet is not connected to");
		});

		it("does not broadcast when the wallet leaves Arbitrum after signing", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let chainId: unknown = "0xa4b1";
			providerOn(() => chainId);
			testState.verifyLegalAction.mockImplementation(async () => {
				chainId = 56;
				return { canPerformActions: true };
			});

			await submit("wallet", "cctp");

			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error?.message).toContain("Wallet is not connected to");
		});
	});

	it("fails closed before CCTP signing or broadcast when cross-tab Web Locks are unavailable", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});

		await submit("wallet", "cctp");

		expect(testState.getUserRole).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.name).toBe("FundsActionLockUnavailableError");
	});

	it("fails closed without signing or broadcasting when CCTP lock acquisition times out", async () => {
		vi.useFakeTimers();
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.lockRequest.mockImplementation(
			(_name: string, options: LockOptions) =>
				new Promise((_resolve, reject) => {
					options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
				}),
		);
		const depositHook = renderMode("wallet", "cctp");
		await act(async () => {
			const request = depositHook.deposit("5");
			for (let attempt = 0; attempt < 20 && testState.lockRequest.mock.calls.length === 0; attempt += 1) {
				await Promise.resolve();
			}
			expect(testState.lockRequest).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(10_001);
			await request;
		});

		expect(testState.getUserRole).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.name).toBe("FundsActionLockTimeoutError");
	});

	it("blocks a queued tab from signing or broadcasting while an earlier CCTP deposit is pending", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		saveCctpDepositTrackingRecord({
			env: "Mainnet",
			owner: WALLET_ADDRESS,
			sourceHash: SOURCE_HASH,
			amount: "5",
		});

		await submit("wallet", "cctp");

		expect(testState.getUserRole).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Another Circle CCTP deposit is still pending");
	});

	describe("external wallet submission without a transaction hash", () => {
		function providerError(code: number, message: string) {
			return Object.assign(new Error(message), { code });
		}

		beforeEach(() => {
			testState.custom.mockImplementation((provider: unknown) => ({ provider }));
			testState.createWalletClient.mockImplementation(
				({ transport }: { transport: { provider: { request: (args: unknown) => Promise<unknown> } } }) => ({
					signTypedData: testState.permitSign,
					writeContract: (args: unknown) =>
						transport.provider.request({ method: "eth_sendTransaction", params: [args] }),
				}),
			);
			testState.providerRequest.mockImplementation(
				async ({ method, params }: { method: string; params?: unknown[] }) => {
					if (method === "eth_chainId") return "0xa4b1";
					if (method === "eth_accounts" || method === "eth_requestAccounts") return [WALLET_ADDRESS];
					if (method === "eth_sendTransaction") return testState.walletWriteContract(params?.[0]);
					throw new Error(`Unexpected provider method: ${method}`);
				},
			);
		});

		async function submitAgainAfterReset() {
			act(() => capturedDeposit?.reset());
			act(() => root.unmount());
			root = createRoot(container);
			await submit("wallet", "cctp");
		}

		it("blocks a second signature after the wallet disconnects without returning a hash, also after a reload", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.walletWriteContract.mockRejectedValue(providerError(4900, "Provider disconnected"));

			await submit("wallet", "cctp");

			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(true);

			await submitAgainAfterReset();

			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(capturedDeposit?.error?.message).toContain("A previous deposit authorization is still active");
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toMatchObject({
				amount: "5",
				owner: WALLET_ADDRESS,
				status: "submission-unresolved",
			});
		});

		it("keeps the block when a disconnection carries a rejection-like message", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.walletWriteContract.mockRejectedValue(
				providerError(4900, "Request rejected: the wallet session was disconnected"),
			);

			await submit("wallet", "cctp");

			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(true);
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).not.toBeNull();
		});

		it("lets the account deposit again after the wallet rejected the transaction before broadcasting", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.walletWriteContract.mockRejectedValue(providerError(4001, "User rejected the request."));

			await submit("wallet", "cctp");

			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(false);
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();

			await submitAgainAfterReset();

			expect(testState.permitSign).toHaveBeenCalledTimes(2);
			expect(testState.walletWriteContract).toHaveBeenCalledTimes(2);
		});

		it("releases the block once the earlier authorization has expired", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.walletWriteContract.mockRejectedValue(providerError(4900, "Provider disconnected"));

			await submit("wallet", "cctp");
			const intent = readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS);
			expect(intent).not.toBeNull();

			vi.setSystemTime(((intent?.validBefore ?? 0) - 1) * 1000);
			await submitAgainAfterReset();
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();

			vi.setSystemTime((intent?.validBefore ?? 0) * 1000);
			await submitAgainAfterReset();
			expect(testState.permitSign).toHaveBeenCalledTimes(2);
			expect(testState.walletWriteContract).toHaveBeenCalledTimes(2);
		});

		it.each([
			["keeps", false],
			["clears", true],
		] as const)(
			"%s the authorization block after a success receipt that proves its use: %s",
			async (_label, withProof) => {
				testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
				stubSuccessfulCctpCapacity();
				testState.walletWriteContract.mockResolvedValue(SOURCE_HASH);
				testState.publicClient.getTransactionReceipt.mockImplementation(async () => {
					const receipt = createSuccessfulCctpReceipt();
					const authNonce = (testState.walletWriteContract.mock.calls[0]?.[0] as { args: [{ authNonce: Hex }] }).args[0]
						.authNonce;
					return withProof
						? ({ ...receipt, logs: [...receipt.logs, createAuthorizationUsedLog(authNonce)] } as TransactionReceipt)
						: receipt;
				});

				await submit("wallet", "cctp");

				expect(capturedDeposit?.status).toBe("success");
				const call = testState.walletWriteContract.mock.calls[0]?.[0] as {
					args: [{ authNonce: Hex; authValidBefore: bigint }];
				};
				expect(readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)).toEqual([
					expect.objectContaining({
						authNonce: call.args[0].authNonce,
						mode: "direct",
						sourceBlock: 400_000_000,
						sourceHash: SOURCE_HASH,
						validBefore: Number(call.args[0].authValidBefore),
					}),
				]);
				expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS) === null).toBe(withProof);
			},
		);

		it("blocks a queued tab while another tab's external wallet submission is unresolved", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let releaseWallet: (error: Error) => void = () => undefined;
			testState.walletWriteContract.mockImplementationOnce(
				() =>
					new Promise((_resolve, reject) => {
						releaseWallet = reject;
					}),
			);
			const firstTab = renderMode("wallet", "cctp");
			let firstRequest: Promise<void> = Promise.resolve();
			await act(async () => {
				firstRequest = firstTab.deposit("5");
				for (let attempt = 0; attempt < 50 && testState.walletWriteContract.mock.calls.length === 0; attempt += 1) {
					await Promise.resolve();
				}
			});
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).not.toBeNull();

			await act(async () => {
				releaseWallet(providerError(4900, "Provider disconnected"));
				await firstRequest;
			});
			await submitAgainAfterReset();

			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
		});
	});

	it("fails closed before CCTP signing when recovery storage cannot pass a write/readback probe", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		const persistSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("storage disabled", "SecurityError");
		});

		await submit("wallet", "cctp");

		expect(testState.getUserRole).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.name).toBe("CctpDepositTrackingPersistenceError");
		persistSpy.mockRestore();
	});

	it.each([
		{
			code: "source-transaction-reverted" as const,
			name: "the source transaction reverted",
			receipt: { logs: [], status: "reverted" } as unknown as TransactionReceipt,
		},
		{
			code: "source-receipt-mismatch" as const,
			name: "the confirmed source receipt does not contain the requested CCTP burn",
			receipt: { logs: [], status: "success" } as unknown as TransactionReceipt,
		},
	])("removes recovery state when $name so reopening does not restore it", async ({ code, receipt }) => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
				}
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: 200000, med: 200000, high: 200000 },
						},
					]),
					{ status: 200 },
				);
			}),
		);
		testState.walletWriteContract.mockResolvedValue(SOURCE_HASH);
		testState.publicClient.getTransactionReceipt.mockResolvedValue(receipt);

		await submit("wallet", "cctp");

		expect(capturedDeposit?.error).toBeInstanceOf(DefinitiveDepositSourceFailureError);
		expect(capturedDeposit?.error).toMatchObject({ code });

		let recoveredSourceHash: Hash | null = SOURCE_HASH;
		function ReopenTrackingProbe() {
			recoveredSourceHash =
				useCctpDepositTracking({
					enabled: true,
					env: "Mainnet",
					owner: WALLET_ADDRESS,
				}).recoveryRecord?.sourceHash ?? null;
			return null;
		}
		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(ReopenTrackingProbe)));
		});
		expect(recoveredSourceHash).toBeNull();
	});

	it.each(["05", "5.", "005.00"])("normalizes %s before persisting CCTP recovery state", async (amount) => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				if (String(input).includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
				}
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: 200000, med: 200000, high: 200000 },
						},
					]),
					{ status: 200 },
				);
			}),
		);
		testState.walletWriteContract.mockResolvedValue(SOURCE_HASH);
		testState.publicClient.getTransactionReceipt.mockResolvedValue(createSuccessfulCctpReceipt());

		const depositHook = renderMode("wallet", "cctp");
		await act(async () => {
			await depositHook.deposit(amount);
		});

		let recoveredAmount: string | null = null;
		function ReopenTrackingProbe() {
			recoveredAmount =
				useCctpDepositTracking({ enabled: true, env: "Mainnet", owner: WALLET_ADDRESS }).recoveryRecord?.amount ?? null;
			return null;
		}
		await act(async () => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(ReopenTrackingProbe)));
		});
		expect(recoveredAmount).toBe("5");
	});

	it("keeps a confirmed deposit successful while exposing unavailable browser recovery", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				if (String(input).includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
				}
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: 200000, med: 200000, high: 200000 },
						},
					]),
					{ status: 200 },
				);
			}),
		);
		testState.walletWriteContract.mockResolvedValue(SOURCE_HASH);
		testState.publicClient.getTransactionReceipt.mockResolvedValue(createSuccessfulCctpReceipt());
		let successfulProbeWrites = 0;
		const originalSetItem = Storage.prototype.setItem;
		const persistSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
			if (key.startsWith("sairn:cctp-deposit-tracking-probe:v1:")) {
				successfulProbeWrites += 1;
				return originalSetItem.call(this, key, value);
			}
			if (key.startsWith("sairn:cctp-sponsored-authorization-intent:v1:")) {
				return originalSetItem.call(this, key, value);
			}
			throw new DOMException("quota exceeded", "QuotaExceededError");
		});

		try {
			await submit("wallet", "cctp");
		} finally {
			persistSpy.mockRestore();
		}

		expect(capturedDeposit).toMatchObject({ status: "success", cctpRecoveryUnavailable: true });
		expect(successfulProbeWrites).toBe(1);
	});

	it("does not broadcast an external wallet deposit whose unresolved authorization cannot be saved", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		const originalSetItem = Storage.prototype.setItem;
		const persistSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
			if (key.startsWith("sairn:cctp-sponsored-authorization-intent:v1:")) {
				throw new DOMException("quota exceeded", "QuotaExceededError");
			}
			return originalSetItem.call(this, key, value);
		});

		try {
			await submit("wallet", "cctp");
		} finally {
			persistSpy.mockRestore();
		}

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit).toMatchObject({ status: "error", submissionOutcomeUnknown: false });
	});

	it.each(["wallet", "smart"] as const)(
		"stops %s broadcast when only fresh Fast Transfer capacity falls after signing",
		async (mode) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			let allowance = 5;
			const getAllowance = vi.fn(() => allowance);
			stubSuccessfulCctpCapacity(5_000_000n, 5_000_000n, getAllowance);
			testState.permitSign.mockImplementationOnce(async () => {
				allowance = 4.999999;
				return PERMIT_SIGNATURE;
			});
			const writes = vi.spyOn(Storage.prototype, "setItem");
			await submit(mode, "cctp");
			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(getAllowance.mock.results.map((result) => result.value)).toEqual([5, 4.999999]);
			expect(capturedDeposit?.error?.message).toContain("Fast Transfer capacity");
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(writes.mock.calls.map(([key]) => key)).not.toContain(
				getCctpSponsoredAuthorizationIntentStorageKey("Mainnet", WALLET_ADDRESS),
			);
			writes.mockRestore();
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
		},
	);

	it("does not request a CCTP signature when Fast Transfer allowance is insufficient", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1 }), { status: 200 });
				}
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: 200000, med: 200000, high: 200000 },
						},
					]),
					{ status: 200 },
				);
			}),
		);

		await submit("wallet", "cctp");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
	});

	it("rejects an Agent/API wallet as a CCTP recipient before signing", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.getUserRole.mockResolvedValue({ role: "agent", data: { user: WALLET_ADDRESS } });

		await submit("wallet", "cctp");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Agent/API wallet addresses cannot receive CCTP deposits");
	});

	it("rejects a Testnet Agent/API wallet even when the address is a Mainnet user", async () => {
		testState.isTestnet = true;
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.getUserRole.mockImplementation(async (isTestnet: boolean) =>
			isTestnet ? { role: "agent", data: { user: WALLET_ADDRESS } } : { role: "user" },
		);

		await submit("wallet", "cctp");

		expect(testState.getUserRole).toHaveBeenCalledWith(false, { user: WALLET_ADDRESS }, undefined);
		expect(testState.getUserRole).toHaveBeenCalledWith(true, { user: WALLET_ADDRESS }, undefined);
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Agent/API wallet addresses cannot receive CCTP deposits");
	});

	it.each([{ role: "missing" }, { role: "user" }])(
		"allows a Testnet $role recipient when the address is a Mainnet user",
		async (testnetRole) => {
			testState.isTestnet = true;
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			testState.getUserRole.mockImplementation(async (isTestnet: boolean) =>
				isTestnet ? testnetRole : { role: "user" },
			);
			stubSuccessfulCctpCapacity();

			await submit("wallet", "cctp");

			expect(testState.getUserRole).toHaveBeenCalledWith(false, { user: WALLET_ADDRESS }, undefined);
			expect(testState.getUserRole).toHaveBeenCalledWith(true, { user: WALLET_ADDRESS }, undefined);
			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
		},
	);

	it.each([
		{ mainnetRole: { role: "unexpected" }, name: "Mainnet", testnetRole: { role: "user" } },
		{ mainnetRole: { role: "user" }, name: "Testnet", testnetRole: { role: "unexpected" } },
	])("fails closed when the $name userRole response is malformed", async ({ mainnetRole, testnetRole }) => {
		testState.isTestnet = true;
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.getUserRole.mockImplementation(async (isTestnet: boolean) => (isTestnet ? testnetRole : mainnetRole));

		await submit("wallet", "cctp");

		expect(testState.getUserRole).toHaveBeenCalledTimes(2);
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Hyperliquid returned an invalid user role");
	});

	it("submits embedded CCTP through the sponsored V2 contract and validates its exact event", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.smartSendTransaction.mockImplementation(async ({ data }: { data: Hex }) => {
			const decoded = decodeFunctionData({ abi: CCTP_EXTENSION_V2_ABI, data });
			if (decoded.functionName !== "batchSponsorDepositForBurn") throw new Error("Unexpected sponsored function");
			const authNonce = decoded.args[0][0].authNonce;
			testState.publicClient.getTransactionReceipt.mockResolvedValue(createSponsoredCctpReceipt(authNonce));
			return SOURCE_HASH;
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledWith(
			expect.objectContaining({
				account: WALLET_ADDRESS,
				message: expect.objectContaining({
					from: WALLET_ADDRESS,
					to: CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtensionV2,
				}),
			}),
		);
		expect(testState.smartSendTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ to: CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtensionV2 }),
			{ uiOptions: { showWalletUIs: false } },
		);
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit).toMatchObject({ status: "success", hash: SOURCE_HASH });
		const trackingRecord = readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)[0];
		expect(trackingRecord).toMatchObject({
			mode: "sponsored",
			owner: WALLET_ADDRESS,
			sourceHash: SOURCE_HASH,
		});
		expect(trackingRecord.mode === "sponsored" ? trackingRecord.authNonce : null).toBe(
			decodeFunctionData({
				abi: CCTP_EXTENSION_V2_ABI,
				data: testState.smartSendTransaction.mock.calls[0][0].data,
			}).args[0][0].authNonce.toLowerCase(),
		);
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
	});

	it("submits a reviewed full-balance sponsored deposit only when the locked balance still matches", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();

		await submit("smart", "cctp", {
			expectedBalanceRaw: 5_000_000n,
			expectedCctpMaxFeeRaw: 200_000n,
		});

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
	});

	it("allows an automatic mainnet sponsored deposit without a manual review", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();

		await submit("smart", "cctp", null, "automatic");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
	});

	it("verifies the owner's legal status before an automatic authorization is signed", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.verifyLegalAction.mockRejectedValue(
			new Error("Hyperliquid access could not be verified before this action"),
		);

		await submit("smart", "cctp", null, "automatic");

		expect(testState.verifyLegalAction).toHaveBeenCalledWith(
			expect.objectContaining({ env: "Mainnet", forceFresh: true, owner: WALLET_ADDRESS }),
		);
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toBe("Hyperliquid access could not be verified before this action");
	});

	it("rechecks the exact owner after an automatic signature before recording or broadcasting it", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		let signed = false;
		testState.verifyLegalAction.mockImplementation(async () => {
			if (signed) throw new Error("Legal access changed");
			return { canPerformActions: true };
		});
		testState.permitSign.mockImplementationOnce(async () => {
			signed = true;
			return PERMIT_SIGNATURE;
		});
		const writes = vi.spyOn(Storage.prototype, "setItem");
		await submit("smart", "cctp", null, "automatic");
		expect(testState.verifyLegalAction).toHaveBeenCalledTimes(2);
		for (const [options] of testState.verifyLegalAction.mock.calls) {
			expect(options).toMatchObject({ env: "Mainnet", forceFresh: true, owner: WALLET_ADDRESS });
		}
		expect(testState.verifyLegalAction.mock.invocationCallOrder[0]).toBeLessThan(
			testState.permitSign.mock.invocationCallOrder[0],
		);
		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(capturedDeposit?.error?.message).toBe("Legal access changed");
		expect(writes.mock.calls.map(([key]) => key)).not.toContain(
			getCctpSponsoredAuthorizationIntentStorageKey("Mainnet", WALLET_ADDRESS),
		);
		writes.mockRestore();
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
	});

	it("does not sign an automatic authorization when the selected owner is not the wallet that would sign", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.selectedOwner = SECOND_WALLET_ADDRESS;

		await submit("smart", "cctp", null, "automatic");

		expect(testState.verifyLegalAction).not.toHaveBeenCalled();
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
	});

	it("aborts an automatic mainnet sponsored deposit before signing when the locked balance differs", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity(6_000_000n);

		await submit("smart", "cctp", null, "automatic");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("amount is not verified");
	});

	it("does not broadcast an automatic mainnet deposit when the balance changes after signing", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity(5_000_000n, 6_000_000n);

		await submit("smart", "cctp", null, "automatic");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("amount is not verified");
	});

	it("automatically submits a mainnet wallet balance through the real deposit hook without a modal or click", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.smartSendTransaction.mockImplementation(async ({ data }: { data: Hex }) => {
			const decoded = decodeFunctionData({ abi: CCTP_EXTENSION_V2_ABI, data });
			expect(decoded.functionName).toBe("batchSponsorDepositForBurn");
			expect(decoded.args[0][0]).toMatchObject({ from: WALLET_ADDRESS, amount: 5_000_000n });
			testState.publicClient.getTransactionReceipt.mockResolvedValue(
				createSponsoredCctpReceipt(decoded.args[0][0].authNonce),
			);
			return SOURCE_HASH;
		});

		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(I18nProvider, { i18n }, createElement(EmbeddedDepositAutoBridge)),
				),
			);
		});
		await vi.waitFor(() => {
			expect(readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)).toEqual([
				expect.objectContaining({ mode: "sponsored", amount: "5", owner: WALLET_ADDRESS, sourceHash: SOURCE_HASH }),
			]);
		});
		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ to: CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtensionV2 }),
			{ uiOptions: { showWalletUIs: false } },
		);
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(testState.geoRefetch).toHaveBeenCalled();
		expect(testState.verifyLegalAction).toHaveBeenCalled();
		expect(container.querySelector("button")).toBeNull();
		await act(async () => root.unmount());
		root = createRoot(container);
		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(I18nProvider, { i18n }, createElement(EmbeddedDepositAutoBridge)),
				),
			);
		});
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
	});

	it.each(["smart", "wallet"] as const)(
		"releases the funds lock and signs nothing when the %s regional check never answers, also once it answers late",
		async (mode) => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			let answerLate!: () => void;
			testState.geoRefetch.mockImplementation(
				() =>
					new Promise((resolve) => {
						answerLate = () =>
							resolve({ data: { country: "GB", proxy: false, tradeRestricted: false }, isError: false });
					}),
			);
			let lockHeld = false;
			testState.lockRequest.mockImplementation(
				async (
					name: string,
					_options: LockOptions,
					callback: (lock: Lock | null) => unknown | PromiseLike<unknown>,
				) => {
					lockHeld = true;
					try {
						return await callback({ name, mode: "exclusive" } as Lock);
					} finally {
						lockHeld = false;
					}
				},
			);
			const depositHook = renderMode(mode, "cctp", "automatic");

			await act(async () => {
				const request = depositHook.deposit("5");
				for (let attempt = 0; attempt < 50 && testState.geoRefetch.mock.calls.length === 0; attempt += 1) {
					await vi.advanceTimersByTimeAsync(0);
				}
				expect(testState.geoRefetch).toHaveBeenCalledOnce();
				expect(lockHeld).toBe(true);
				await vi.advanceTimersByTimeAsync(DEPOSIT_LOCKED_REQUEST_TIMEOUT_MS);
				await request;
			});

			expect(lockHeld).toBe(false);
			expect(capturedDeposit?.error?.message).toContain("Unable to verify regional availability");
			await act(async () => {
				answerLate();
				await vi.advanceTimersByTimeAsync(1_000);
			});
			expect(testState.getUserRole).not.toHaveBeenCalled();
			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
		},
	);

	describe("click deadline of a manual deposit", () => {
		const SPONSORED_EXECUTION_KEY = `mainnet:manual:smart:${WALLET_ADDRESS.toLowerCase()}`;
		// Each check inside the funds lock has its own bound, so a delay past the click deadline is
		// split between the regional check and the recipient lookup that follows it.
		const LOCKED_CHECK_DELAY_MS = 10_000;

		async function submitWithDelayedRegionalCheck({
			delayMs,
			executionScope = "manual",
			mode,
			withDeadline,
		}: {
			delayMs: number;
			executionScope?: "automatic" | "manual";
			mode: "smart" | "wallet";
			withDeadline: boolean;
		}) {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			const regionalDelayMs = Math.min(delayMs, LOCKED_CHECK_DELAY_MS);
			testState.geoRefetch.mockImplementation(
				() =>
					new Promise((resolve) => {
						setTimeout(
							() => resolve({ data: { country: "GB", proxy: false, tradeRestricted: false }, isError: false }),
							regionalDelayMs,
						);
					}),
			);
			testState.getUserRole.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve({ role: "user" }), delayMs - regionalDelayMs)),
			);
			const depositHook = renderMode(mode, "cctp", executionScope);
			const review: DepositReview | undefined =
				executionScope === "automatic"
					? undefined
					: {
							expectedBalanceRaw: mode === "smart" ? 5_000_000n : undefined,
							expectedCctpMaxFeeRaw: 200_000n,
							deadline: withDeadline ? startExchangeActionDeadline() : undefined,
						};
			const regionalChecksBefore = testState.geoRefetch.mock.calls.length;
			const signaturesBefore = testState.permitSign.mock.calls.length;
			await act(async () => {
				const request = depositHook.deposit("5", review);
				for (
					let attempt = 0;
					attempt < 50 && testState.geoRefetch.mock.calls.length === regionalChecksBefore;
					attempt += 1
				) {
					await vi.advanceTimersByTimeAsync(0);
				}
				expect(testState.geoRefetch).toHaveBeenCalledTimes(regionalChecksBefore + 1);
				expect(testState.permitSign).toHaveBeenCalledTimes(signaturesBefore);
				let settled = false;
				const markSettled = () => {
					settled = true;
				};
				void request.then(markSettled, markSettled);
				await vi.advanceTimersByTimeAsync(delayMs);
				for (let attempt = 0; attempt < 50 && !settled; attempt += 1) await vi.advanceTimersByTimeAsync(100);
				await request;
			});
		}

		it("does not sign or submit an embedded deposit whose regional check returned after the deadline", async () => {
			await submitWithDelayedRegionalCheck({ delayMs: 16_000, mode: "smart", withDeadline: true });

			expect(testState.getClientForChain).toHaveBeenCalledWith({ id: 42161 });
			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expect(capturedDeposit?.error).toBeInstanceOf(ExchangeActionDeadlineError);
			expect(capturedDeposit).toMatchObject({
				status: "error",
				hash: undefined,
				submissionOutcomeUnknown: false,
				cctpRecoveryUnavailable: false,
			});
			expect(getDepositExecutionState(SPONSORED_EXECUTION_KEY).status).toBe("error");
			expect(readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)).toEqual([]);
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
			expect(reportClientError).not.toHaveBeenCalled();
			expect(
				formatTransferError(capturedDeposit?.error ?? null, (descriptor) => i18n._(descriptor), "Deposit failed"),
			).toBe("The checks before this request took too long. Nothing was signed or sent. Try again.");
		});

		it("lets the same embedded account deposit again after a deadline refusal", async () => {
			await submitWithDelayedRegionalCheck({ delayMs: 16_000, mode: "smart", withDeadline: true });
			expect(testState.permitSign).not.toHaveBeenCalled();

			await submitWithDelayedRegionalCheck({ delayMs: 1_000, mode: "smart", withDeadline: true });

			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
		});

		it("signs and submits an embedded deposit whose regional check returned inside the deadline", async () => {
			await submitWithDelayedRegionalCheck({ delayMs: 14_000, mode: "smart", withDeadline: true });

			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
			expect(capturedDeposit?.error).not.toBeInstanceOf(ExchangeActionDeadlineError);
		});

		it("does not hold an external wallet to the deadline, because the wallet asks again before signing", async () => {
			await submitWithDelayedRegionalCheck({ delayMs: 16_000, mode: "wallet", withDeadline: true });

			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(capturedDeposit?.error).not.toBeInstanceOf(ExchangeActionDeadlineError);
		});

		it("does not hold an automatic deposit, which passes no deadline, to any time limit", async () => {
			await submitWithDelayedRegionalCheck({
				delayMs: 16_000,
				executionScope: "automatic",
				mode: "smart",
				withDeadline: false,
			});

			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
			expect(capturedDeposit?.error).not.toBeInstanceOf(ExchangeActionDeadlineError);
		});

		it("does not hold a manual embedded deposit without a deadline to any time limit", async () => {
			await submitWithDelayedRegionalCheck({ delayMs: 16_000, mode: "smart", withDeadline: false });

			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
		});
	});

	it.each([
		{ name: "no review", review: null },
		{ name: "only a reviewed balance", review: { expectedBalanceRaw: 5_000_000n } },
		{ name: "only a reviewed fee", review: { expectedCctpMaxFeeRaw: 200_000n } },
	])("rejects a mainnet sponsored deposit with $name", async ({ review }) => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };

		await submit("smart", "cctp", review);

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("confirmation is required");
	});

	it("rejects a mainnet sponsored amount that differs from the reviewed full balance", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };

		await submit("smart", "cctp", {
			expectedBalanceRaw: 6_000_000n,
			expectedCctpMaxFeeRaw: 200_000n,
		});

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("amount is not verified");
	});

	it("requires renewed review when the locked sponsored-wallet balance changed", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity(6_000_000n);

		await submit("smart", "cctp", {
			expectedBalanceRaw: 5_000_000n,
			expectedCctpMaxFeeRaw: 200_000n,
		});

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("amount is not verified");
	});

	it("does not broadcast when the reviewed balance changes after authorization signing", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity(5_000_000n, 6_000_000n);

		await submit("smart", "cctp", {
			expectedBalanceRaw: 5_000_000n,
			expectedCctpMaxFeeRaw: 200_000n,
		});

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("amount is not verified");
	});

	it("uses the call-time reviewed CCTP fee instead of the hook fallback", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();

		await submit("smart", "cctp", {
			expectedBalanceRaw: 5_000_000n,
			expectedCctpMaxFeeRaw: 300_000n,
		});

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("fees changed");
	});

	it("uses the Sepolia V2 contract and Smart Wallet client for sponsored testnet deposits", async () => {
		testState.isTestnet = true;
		testState.wallet.chainId = "eip155:421614";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.smartSendTransaction.mockImplementation(async ({ data }: { data: Hex }) => {
			const decoded = decodeFunctionData({ abi: CCTP_EXTENSION_V2_ABI, data });
			if (decoded.functionName !== "batchSponsorDepositForBurn") throw new Error("Unexpected sponsored function");
			testState.publicClient.getTransactionReceipt.mockResolvedValue(
				createSponsoredCctpReceipt(decoded.args[0][0].authNonce, "SponsoredDepositForBurn", true),
			);
			return SOURCE_HASH;
		});

		await submit("smart", "cctp");

		expect(testState.getClientForChain).toHaveBeenCalledWith({ id: 421614 });
		expect(testState.smartSendTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ to: CCTP_DEPOSIT_NETWORKS.testnet.cctpExtensionV2 }),
			{ uiOptions: { showWalletUIs: false } },
		);
		expect(capturedDeposit).toMatchObject({ status: "success", hash: SOURCE_HASH });
	});

	it("fails closed when sponsored CCTP is disabled", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.sponsoredEnabled = false;

		await submit("smart", "cctp");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("not enabled");
	});

	it("fails closed before signing when the Smart Wallet client is on the wrong chain", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.getClientForChain.mockResolvedValue({
			chain: { id: 421614 },
			paymaster: {},
			sendTransaction: testState.smartSendTransaction,
		});

		await submit("smart", "cctp");

		expect(testState.getClientForChain).toHaveBeenCalledWith({ id: 42161 });
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Smart wallet client not ready");
	});

	it("fails closed before signing when the target-chain Smart Wallet client is unavailable", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.getClientForChain.mockResolvedValue(undefined);

		await submit("smart", "cctp");

		expect(testState.getClientForChain).toHaveBeenCalledWith({ id: 42161 });
		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Smart wallet client not ready");
	});

	it("stops before recording or broadcasting if the signed client loses its paymaster", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		const client = {
			chain: { id: 42161 },
			paymaster: {} as object | undefined,
			sendTransaction: testState.smartSendTransaction,
		};
		testState.getClientForChain.mockResolvedValue(client);
		testState.permitSign.mockImplementationOnce(async () => {
			client.paymaster = undefined;
			return PERMIT_SIGNATURE;
		});
		const writes = vi.spyOn(Storage.prototype, "setItem");
		await submit("smart", "cctp");
		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(capturedDeposit?.error?.message).toBe("Smart wallet client not ready");
		expect(writes.mock.calls.map(([key]) => key)).not.toContain(
			getCctpSponsoredAuthorizationIntentStorageKey("Mainnet", WALLET_ADDRESS),
		);
		writes.mockRestore();
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
	});

	it("fails closed before signing when Smart Wallet gas sponsorship is not configured", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.getClientForChain.mockResolvedValue({
			chain: { id: 42161 },
			paymaster: undefined,
			sendTransaction: testState.smartSendTransaction,
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("not enabled");
	});

	it("rejects a same-address external connector for a sponsored embedded deposit", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.wallet.connectorType = "injected";

		await submit("smart", "cctp");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Wallet client not ready");
	});

	it("surfaces a Paymaster rejection without falling back to Bridge2", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.smartSendTransaction.mockImplementation(() => {
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).not.toBeNull();
			return Promise.reject(new Error("Paymaster policy rejected sponsored call"));
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
		expect(testState.walletWriteContract).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("Paymaster policy rejected");
		expect(capturedDeposit?.submissionOutcomeUnknown).toBe(true);
		expect(readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)).toHaveLength(0);
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toMatchObject({
			amount: "5",
			status: "submission-unresolved",
		});
		expect(reportClientError).toHaveBeenCalledExactlyOnceWith(capturedDeposit?.error, {
			kind: "deposit_submission",
			depositStage: "before_source_hash",
		});
		act(() => capturedDeposit?.reset());
		expect(capturedDeposit?.error).toBeNull();
		expect(reportClientError).toHaveBeenCalledOnce();

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
		expect(capturedDeposit?.error?.message).toContain("authorization is still active");
		expect(reportClientError).toHaveBeenCalledOnce();
	});

	it("settles an unknown submission even if diagnostic reporting fails", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		const submissionError = new Error("Bundler response was interrupted");
		testState.smartSendTransaction.mockRejectedValue(submissionError);
		reportClientError.mockImplementation(() => {
			throw new Error("Reporting unavailable");
		});

		await submit("smart", "cctp");

		expect(capturedDeposit?.status).toBe("error");
		expect(capturedDeposit?.error).toBe(submissionError);
		expect(capturedDeposit?.submissionOutcomeUnknown).toBe(true);
		act(() => capturedDeposit?.reset());
		expect(capturedDeposit?.status).toBe("idle");
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).not.toBeNull();
	});

	it("fails closed before signing when unresolved sponsored authorization storage is invalid", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		const key = `sairn:cctp-sponsored-authorization-intent:v1:mainnet:${WALLET_ADDRESS}`;
		window.localStorage.setItem(key, "not-json");

		await submit("smart", "cctp");

		expect(testState.permitSign).not.toHaveBeenCalled();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("cannot be trusted");
		expect(window.localStorage.getItem(key)).toBe("not-json");
	});

	it("does not submit a sponsored authorization when the route changes after signing", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.permitSign.mockImplementation(async () => {
			testState.routingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
			return PERMIT_SIGNATURE;
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
	});

	it("does not submit a sponsored authorization when the Circle fee changes after signing", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		let feeRequestCount = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { method?: string }) : null;
				if (body?.method === "eth_call") {
					return new Response(JSON.stringify({ result: "0x4c4b40" }), { status: 200 });
				}
				if (String(input).includes("/fastBurn/USDC/allowance")) {
					return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
				}
				feeRequestCount += 1;
				const forwardFee = feeRequestCount === 1 ? 200_000 : 300_000;
				return new Response(
					JSON.stringify([
						{
							finalityThreshold: 1000,
							minimumFee: 0,
							forwardFee: { low: forwardFee, med: forwardFee, high: forwardFee },
						},
					]),
					{ status: 200 },
				);
			}),
		);

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).not.toHaveBeenCalled();
		expect(capturedDeposit?.error?.message).toContain("fees changed");
	});

	it.each([
		{ name: "before signing", feeFetchesBeforeRise: 0, signs: 0 },
		{ name: "after signing", feeFetchesBeforeRise: 1, signs: 1 },
	])(
		"reports a fee change when a fresh quote puts the amount below the Circle minimum $name",
		async ({ feeFetchesBeforeRise, signs }) => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			let feeRequestCount = 0;
			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
					const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { method?: string }) : null;
					if (body?.method === "eth_call") {
						return new Response(JSON.stringify({ result: "0x4c4b40" }), { status: 200 });
					}
					if (String(input).includes("/fastBurn/USDC/allowance")) {
						return new Response(JSON.stringify({ allowance: 1_000_000 }), { status: 200 });
					}
					feeRequestCount += 1;
					const forwardFee = feeRequestCount <= feeFetchesBeforeRise ? 200_000 : 3_000_000;
					return new Response(
						JSON.stringify([
							{
								finalityThreshold: 1000,
								minimumFee: 0,
								forwardFee: { low: forwardFee, med: forwardFee, high: forwardFee },
							},
						]),
						{ status: 200 },
					);
				}),
			);

			await submit("smart", "cctp");

			expect(testState.permitSign).toHaveBeenCalledTimes(signs);
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(capturedDeposit?.error).toBeInstanceOf(LocalizedActionError);
			expect(capturedDeposit?.error?.message).toContain("fees changed");
		},
	);

	it("treats the V2 skipped event as a definitive source failure", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.smartSendTransaction.mockImplementation(async ({ data }: { data: Hex }) => {
			const decoded = decodeFunctionData({ abi: CCTP_EXTENSION_V2_ABI, data });
			if (decoded.functionName !== "batchSponsorDepositForBurn") throw new Error("Unexpected sponsored function");
			const authNonce = decoded.args[0][0].authNonce;
			testState.publicClient.getTransactionReceipt.mockResolvedValue(
				createSponsoredCctpReceipt(authNonce, "SponsoredDepositForBurnSkipped"),
			);
			return SOURCE_HASH;
		});

		await submit("smart", "cctp");

		expect(capturedDeposit?.error).toBeInstanceOf(DefinitiveDepositSourceFailureError);
		expect(capturedDeposit?.error?.message).toContain("skipped");
		expect(readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)).toHaveLength(0);
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toMatchObject({
			amount: "5",
			status: "submission-unresolved",
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
		expect(capturedDeposit?.error?.message).toContain("authorization is still active");
	});

	it("keeps a sponsored authorization tombstone when the AA source transaction reverts", async () => {
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		stubSuccessfulCctpCapacity();
		testState.smartSendTransaction.mockImplementation(async () => {
			testState.publicClient.getTransactionReceipt.mockResolvedValue({
				logs: [],
				status: "reverted",
			} as unknown as TransactionReceipt);
			return SOURCE_HASH;
		});

		await submit("smart", "cctp");

		expect(capturedDeposit?.error).toBeInstanceOf(DefinitiveDepositSourceFailureError);
		expect(readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)).toHaveLength(0);
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toMatchObject({
			amount: "5",
			status: "submission-unresolved",
		});

		await submit("smart", "cctp");

		expect(testState.permitSign).toHaveBeenCalledOnce();
		expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
	});
	it("keeps the shown balance while a poll refreshes it in the background", async () => {
		const balanceRequests: Array<(raw: bigint) => void> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { method?: string }) : null;
				if (body?.method !== "eth_call") throw new Error("Unexpected request");
				const raw = await new Promise<bigint>((resolve) => balanceRequests.push(resolve));
				return new Response(JSON.stringify({ result: `0x${raw.toString(16)}` }), { status: 200 });
			}),
		);

		act(() => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(Probe, { balanceEnabled: true, balancePollIntervalMs: 50, mode: "smart" }),
				),
			);
		});
		await vi.waitFor(() => expect(balanceRequests).toHaveLength(1));
		expect(capturedDeposit?.balanceStatus).toBe("loading");
		expect(capturedDeposit?.maxDepositRaw).toBeUndefined();

		await act(async () => balanceRequests[0]?.(5_000_000n));
		expect(capturedDeposit?.balanceStatus).toBe("success");
		expect(capturedDeposit?.maxDepositRaw).toBe(5_000_000n);

		await vi.waitFor(() => expect(balanceRequests.length).toBeGreaterThanOrEqual(2));
		expect(capturedDeposit?.balanceStatus).toBe("success");
		expect(capturedDeposit?.maxDepositRaw).toBe(5_000_000n);
		expect(capturedDeposit?.balance).toBe("5");

		const newest = balanceRequests.length;
		await act(async () => balanceRequests[newest - 1]?.(7_000_000n));
		expect(capturedDeposit?.balanceStatus).toBe("success");
		expect(capturedDeposit?.maxDepositRaw).toBe(7_000_000n);
	});

	interface SessionState {
		/** Before the wait: no reconnect since the click. */
		current: boolean;
		/** One-way: the attempt was voided. */
		replaced: boolean;
		/** Settled on the click's identity; follows `current` when not set. */
		settled?: boolean;
		/** Commits that saw the session away from the click's identity. */
		interruptions?: number;
		/** Answers a wait that cannot settle at once; without it the wait times out. */
		waitForSettlement?: () => Promise<DepositSessionWaitResult>;
		/** The limit of every wait the deposit started. */
		waitLimits?: number[];
	}

	/** The session leaves the click's identity at a commit (a reconnect starts or the wallet drops out). */
	function interrupt(state: SessionState) {
		state.current = false;
		state.settled = false;
		state.interruptions = (state.interruptions ?? 0) + 1;
	}

	function session(state: SessionState): DepositSessionCheck {
		const check: DepositSessionCheck = {
			isCurrent: () => state.current && !state.replaced,
			isSettledOnSubmitted: () => !state.replaced && (state.settled ?? state.current),
			isVoided: () => state.replaced,
			readInterruptions: () => state.interruptions ?? 0,
			waitUntilSettled: async (timeoutMs) => {
				state.waitLimits = [...(state.waitLimits ?? []), timeoutMs];
				const interruptions = state.interruptions ?? 0;
				if (state.replaced) return { settlement: "replaced", interruptions };
				if (check.isSettledOnSubmitted()) return { settlement: "same", interruptions };
				return state.waitForSettlement ? state.waitForSettlement() : { settlement: "timeout", interruptions };
			},
		};
		return check;
	}

	/** A wait for the session that the test ends by changing the session and answering. */
	function heldSettlement(state: SessionState) {
		let answer!: (result: DepositSessionWaitResult) => void;
		let reached!: () => void;
		const waiting = new Promise<void>((resolve) => {
			reached = resolve;
		});
		state.waitForSettlement = () =>
			new Promise<DepositSessionWaitResult>((resolve) => {
				answer = resolve;
				reached();
			});
		return {
			waiting,
			settle: (settlement: DepositSessionSettlement) => answer({ settlement, interruptions: state.interruptions ?? 0 }),
		};
	}

	/** A permit signature the wallet returns only when the test releases it. */
	function heldSignature() {
		let release!: () => void;
		let reached!: () => void;
		const reachedPromise = new Promise<void>((resolve) => {
			reached = resolve;
		});
		return {
			reached: reachedPromise,
			held: () =>
				new Promise<typeof PERMIT_SIGNATURE>((resolve) => {
					release = () => resolve(PERMIT_SIGNATURE);
					reached();
				}),
			release: () => release(),
		};
	}

	function trackEnd(submission: Promise<void>) {
		const ended = { value: false };
		void submission.then(() => {
			ended.value = true;
		});
		return ended;
	}

	function expectNotSentBecauseTheSessionDidNotSettle() {
		expect(capturedDeposit?.status).toBe("error");
		expect(capturedDeposit?.error).toBeInstanceOf(LocalizedActionError);
		expect(capturedDeposit?.error?.message).toBe("Wallet not connected");
		expect(capturedDeposit?.submissionOutcomeUnknown).toBe(false);
		expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
		expect(readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)).toEqual([]);
	}

	function startSubmission(mode: "smart" | "wallet", review: DepositReview) {
		const depositHook = renderMode(mode, "cctp");
		let submission!: Promise<void>;
		act(() => {
			submission = depositHook.deposit("5", review);
		});
		return submission;
	}

	function rerenderSubmission(mode: "smart" | "wallet") {
		act(() => {
			root.render(
				createElement(QueryClientProvider, { client: queryClient }, createElement(Probe, { mode, route: "cctp" })),
			);
		});
	}

	describe("session of a manual deposit (ADR 0058)", () => {
		function expectQuietlyNotSent() {
			expect(capturedDeposit?.status).toBe("idle");
			expect(capturedDeposit?.error).toBeNull();
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
		}

		const SPONSORED_REVIEW = { expectedBalanceRaw: 5_000_000n, expectedCctpMaxFeeRaw: 200_000n };

		it("asks the wallet nothing when the session is no longer the one the click came from", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();

			await submit("wallet", "cctp", { session: session({ current: false, replaced: false }) });

			expect(testState.providerRequest).not.toHaveBeenCalledWith(
				expect.objectContaining({ method: "eth_requestAccounts" }),
			);
			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expectQuietlyNotSent();
		});

		it("does not ask the wallet to switch networks once the session became unresolved", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			const state = { current: true, replaced: false };
			let depositStarted = false;
			testState.fetchRouting.mockImplementation(async () => {
				depositStarted = true;
				return testState.routingResponse;
			});
			testState.providerRequest.mockImplementation(async ({ method }: { method: string }) => {
				if (method === "eth_chainId") {
					if (depositStarted) state.current = false;
					return "0x38";
				}
				if (method === "eth_accounts" || method === "eth_requestAccounts") return [WALLET_ADDRESS];
				throw new Error(`Unexpected provider method: ${method}`);
			});

			await submit("wallet", "cctp", { session: session(state) });

			expect(testState.wallet.switchChain).not.toHaveBeenCalled();
			expect(testState.providerRequest).not.toHaveBeenCalledWith(
				expect.objectContaining({ method: "wallet_switchEthereumChain" }),
			);
			expect(testState.permitSign).not.toHaveBeenCalled();
			expectQuietlyNotSent();
		});

		it("does not ask the wallet to add the chain once the session became unresolved during the first switch", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			testState.wallet.chainId = "eip155:56";
			const state = { current: true, replaced: false };
			testState.providerRequest.mockImplementation(async ({ method }: { method: string }) => {
				if (method === "eth_chainId") return "0x38";
				if (method === "eth_accounts" || method === "eth_requestAccounts") return [WALLET_ADDRESS];
				if (method === "wallet_switchEthereumChain") {
					state.current = false;
					throw Object.assign(new Error("Unrecognized chain ID"), { code: 4902 });
				}
				if (method === "wallet_addEthereumChain") return null;
				throw new Error(`Unexpected provider method: ${method}`);
			});

			await submit("wallet", "cctp", { session: session(state) });

			expect(testState.wallet.switchChain).not.toHaveBeenCalled();
			expect(testState.providerRequest).toHaveBeenCalledWith(
				expect.objectContaining({ method: "wallet_switchEthereumChain" }),
			);
			expect(testState.providerRequest).not.toHaveBeenCalledWith(
				expect.objectContaining({ method: "wallet_addEthereumChain" }),
			);
			expect(
				testState.providerRequest.mock.calls.filter(([request]) => request.method === "wallet_switchEthereumChain"),
			).toHaveLength(1);
			expect(testState.permitSign).not.toHaveBeenCalled();
			expectQuietlyNotSent();
		});

		it("does not ask for the signature when the session became unresolved after the last check", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			const state = { current: true, replaced: false };
			let routingChecks = 0;
			testState.fetchRouting.mockImplementation(async () => {
				routingChecks += 1;
				if (routingChecks === 2) state.current = false;
				return testState.routingResponse;
			});

			await submit("wallet", "cctp", { session: session(state) });

			expect(routingChecks).toBeGreaterThanOrEqual(2);
			expect(testState.permitSign).not.toHaveBeenCalled();
			expect(testState.walletWriteContract).not.toHaveBeenCalled();
			expectQuietlyNotSent();
		});

		it.each(["wallet", "smart"] as const)(
			"waits once, with the independent 30-second limit, when a %s deposit's session is still settled",
			async (mode) => {
				testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
				stubSuccessfulCctpCapacity();
				const state: SessionState = { current: true, replaced: false };

				await submit(mode, "cctp", { ...(mode === "smart" ? SPONSORED_REVIEW : {}), session: session(state) });

				expect(state.waitLimits).toEqual([30_000]);
				expect(testState.verifyLegalAction).toHaveBeenCalledOnce();
				if (mode === "smart") expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
				else expect(testState.walletWriteContract).toHaveBeenCalledOnce();
			},
		);

		it.each(["wallet", "smart"] as const)(
			"does not send a %s deposit and says so when the session does not settle after the signature",
			async (mode) => {
				testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
				stubSuccessfulCctpCapacity();
				const state: SessionState = { current: true, replaced: false };
				testState.permitSign.mockImplementation(async () => {
					interrupt(state);
					return PERMIT_SIGNATURE;
				});

				await submit(mode, "cctp", { ...(mode === "smart" ? SPONSORED_REVIEW : {}), session: session(state) });

				expect(state.waitLimits).toEqual([30_000]);
				expect(testState.permitSign).toHaveBeenCalledOnce();
				expect(testState.verifyLegalAction).not.toHaveBeenCalled();
				expect(testState.walletWriteContract).not.toHaveBeenCalled();
				expect(testState.smartSendTransaction).not.toHaveBeenCalled();
				expectNotSentBecauseTheSessionDidNotSettle();
			},
		);

		it("runs no fresh check while it waits and broadcasts a sponsored deposit once its session is back on the same account", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			const state: SessionState = { current: true, replaced: false };
			const settlement = heldSettlement(state);
			let routingChecksAtSignature = 0;
			let userRoleReadsAtSignature = 0;
			testState.permitSign.mockImplementation(async () => {
				routingChecksAtSignature = testState.fetchRouting.mock.calls.length;
				userRoleReadsAtSignature = testState.getUserRole.mock.calls.length;
				interrupt(state);
				return PERMIT_SIGNATURE;
			});

			const submission = startSubmission("smart", { ...SPONSORED_REVIEW, session: session(state) });
			await act(async () => settlement.waiting);
			expect(testState.fetchRouting).toHaveBeenCalledTimes(routingChecksAtSignature);
			expect(testState.getUserRole).toHaveBeenCalledTimes(userRoleReadsAtSignature);
			expect(testState.getClientForChain).toHaveBeenCalledOnce();
			expect(testState.verifyLegalAction).not.toHaveBeenCalled();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();

			state.settled = true;
			await act(async () => {
				settlement.settle("same");
				await submission;
			});

			expect(state.waitLimits).toEqual([30_000]);
			expect(testState.fetchRouting.mock.calls.length).toBeGreaterThan(routingChecksAtSignature);
			expect(testState.getClientForChain).toHaveBeenCalledTimes(2);
			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.verifyLegalAction).toHaveBeenCalledOnce();
			expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
		});

		it.each([
			{ step: "the route recheck", back: false },
			{ step: "the route recheck", back: true },
			{ step: "the legal recheck", back: false },
			{ step: "the legal recheck", back: true },
		])(
			"stops a sponsored deposit quietly when its session is interrupted during $step after the wait (back: $back)",
			async ({ step, back }) => {
				testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
				stubSuccessfulCctpCapacity();
				const state: SessionState = { current: true, replaced: false };
				let signed = false;
				let interrupted = false;
				function interruptOnce() {
					if (!signed || interrupted) return;
					interrupted = true;
					interrupt(state);
					if (back) state.settled = true;
				}
				testState.permitSign.mockImplementation(async () => {
					signed = true;
					return PERMIT_SIGNATURE;
				});
				testState.fetchRouting.mockImplementation(async () => {
					if (step === "the route recheck") interruptOnce();
					return testState.routingResponse;
				});
				testState.verifyLegalAction.mockImplementation(async () => {
					if (step === "the legal recheck") interruptOnce();
					return { canPerformActions: true };
				});

				await submit("smart", "cctp", { ...SPONSORED_REVIEW, session: session(state) });

				expect(interrupted).toBe(true);
				expect(state.waitLimits).toEqual([30_000]);
				expect(testState.smartSendTransaction).not.toHaveBeenCalled();
				expectQuietlyNotSent();
			},
		);

		it.each([
			{ session: "back on the same account", voided: false },
			{ session: "replaced", voided: true },
		])(
			"reports a fresh check that fails after an interruption unless the attempt was voided ($session)",
			async ({ voided }) => {
				testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
				stubSuccessfulCctpCapacity();
				const state: SessionState = { current: true, replaced: false };
				testState.verifyLegalAction.mockImplementation(async () => {
					interrupt(state);
					if (voided) state.replaced = true;
					else state.settled = true;
					throw new LocalizedActionError({ id: "legal", message: "Deposits are not available in your region." });
				});

				await submit("smart", "cctp", { ...SPONSORED_REVIEW, session: session(state) });

				expect(testState.smartSendTransaction).not.toHaveBeenCalled();
				if (voided) {
					expectQuietlyNotSent();
				} else {
					expect(capturedDeposit?.status).toBe("error");
					expect(capturedDeposit?.error?.message).toBe("Deposits are not available in your region.");
					expect(capturedDeposit?.submissionOutcomeUnknown).toBe(false);
					expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
				}
			},
		);

		it.each(["wallet", "smart"] as const)(
			"stops a %s deposit quietly when the session is interrupted between the end of the wait and the deposit resuming",
			async (mode) => {
				testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
				stubSuccessfulCctpCapacity();
				const state: SessionState = { current: true, replaced: false };
				const settlement = heldSettlement(state);
				testState.permitSign.mockImplementation(async () => {
					interrupt(state);
					return PERMIT_SIGNATURE;
				});

				const submission = startSubmission(mode, {
					...(mode === "smart" ? SPONSORED_REVIEW : {}),
					session: session(state),
				});
				await act(async () => settlement.waiting);
				state.settled = true;
				await act(async () => {
					settlement.settle("same");
					interrupt(state);
					state.settled = true;
					await submission;
				});

				expect(testState.walletWriteContract).not.toHaveBeenCalled();
				expect(testState.smartSendTransaction).not.toHaveBeenCalled();
				expect(testState.verifyLegalAction).not.toHaveBeenCalled();
				expectQuietlyNotSent();
			},
		);

		it("drops a sponsored signature when the session comes back on another account", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			const state: SessionState = { current: true, replaced: false };
			const settlement = heldSettlement(state);
			testState.permitSign.mockImplementation(async () => {
				interrupt(state);
				return PERMIT_SIGNATURE;
			});

			const submission = startSubmission("smart", { ...SPONSORED_REVIEW, session: session(state) });
			await act(async () => settlement.waiting);
			state.replaced = true;
			await act(async () => {
				settlement.settle("replaced");
				await submission;
			});

			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.verifyLegalAction).not.toHaveBeenCalled();
			expect(testState.smartSendTransaction).not.toHaveBeenCalled();
			expectQuietlyNotSent();
		});

		it("checks the legal status of a sponsored deposit only after the interrupted session came back", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			const state: SessionState = { current: true, replaced: false };
			const settlement = heldSettlement(state);
			const signature = heldSignature();
			testState.permitSign.mockImplementation(() => {
				interrupt(state);
				return signature.held();
			});

			const submission = startSubmission("smart", { ...SPONSORED_REVIEW, session: session(state) });
			const ended = trackEnd(submission);
			await act(async () => signature.reached);
			testState.selectedOwner = "disconnected";
			rerenderSubmission("smart");
			await act(async () => {
				signature.release();
				await Promise.race([settlement.waiting, submission]);
			});
			expect(ended.value).toBe(false);
			expect(testState.verifyLegalAction).not.toHaveBeenCalled();

			testState.selectedOwner = WALLET_ADDRESS;
			rerenderSubmission("smart");
			state.settled = true;
			await act(async () => {
				settlement.settle("same");
				await submission;
			});

			expect(testState.verifyLegalAction).toHaveBeenCalledOnce();
			expect(testState.smartSendTransaction).toHaveBeenCalledOnce();
		});

		it.each(["wallet", "smart"] as const)(
			"drops a %s signature once the session settled on another account",
			async (mode) => {
				testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
				stubSuccessfulCctpCapacity();
				const state = { current: true, replaced: false };
				testState.permitSign.mockImplementation(async () => {
					state.current = false;
					state.replaced = true;
					return PERMIT_SIGNATURE;
				});

				await submit(mode, "cctp", { ...(mode === "smart" ? SPONSORED_REVIEW : {}), session: session(state) });

				expect(testState.permitSign).toHaveBeenCalledOnce();
				expect(testState.walletWriteContract).not.toHaveBeenCalled();
				expect(testState.smartSendTransaction).not.toHaveBeenCalled();
				expectQuietlyNotSent();
			},
		);

		it("ignores the session of an automatic deposit, which has no click to belong to", async () => {
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();

			await submit("wallet", "cctp", { session: session({ current: false, replaced: true }) }, "automatic");

			expect(testState.permitSign).toHaveBeenCalledOnce();
			expect(testState.walletWriteContract).toHaveBeenCalledOnce();
		});
	});

	describe("session of a manual external deposit through the real viem wallet client (ADR 0058)", () => {
		const requests: Array<{ method: string; params?: unknown }> = [];
		let onRequest: (method: string) => void = () => {};
		let signTypedData: () => Promise<unknown> = async () => PERMIT_SIGNATURE;
		let sendTransaction: () => Promise<unknown> = async () => {
			throw Object.assign(new Error("User rejected the request."), { code: 4001 });
		};
		let walletSendTransaction: () => Promise<unknown> = async () => {
			throw Object.assign(new Error("Unsupported provider method: wallet_sendTransaction"), { code: 4200 });
		};

		beforeEach(async () => {
			const actual = await vi.importActual<typeof import("viem")>("viem");
			testState.createWalletClient.mockImplementation(actual.createWalletClient);
			testState.custom.mockImplementation((...args: unknown[]) =>
				actual.custom(...(args as Parameters<typeof actual.custom>)),
			);
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			stubSuccessfulCctpCapacity();
			requests.length = 0;
			onRequest = () => {};
			signTypedData = async () => PERMIT_SIGNATURE;
			sendTransaction = async () => {
				throw Object.assign(new Error("User rejected the request."), { code: 4001 });
			};
			walletSendTransaction = async () => {
				throw Object.assign(new Error("Unsupported provider method: wallet_sendTransaction"), { code: 4200 });
			};
			testState.providerRequest.mockImplementation(async ({ method, params }: { method: string; params?: unknown }) => {
				requests.push({ method, params });
				onRequest(method);
				if (method === "eth_chainId") return "0xa4b1";
				if (method === "eth_accounts" || method === "eth_requestAccounts") return [WALLET_ADDRESS];
				if (method === "eth_signTypedData_v4") return signTypedData();
				if (method === "eth_sendTransaction") return sendTransaction();
				if (method === "wallet_sendTransaction") return walletSendTransaction();
				throw Object.assign(new Error(`Unsupported provider method: ${method}`), { code: 4200 });
			});
		});

		function requested(method: string) {
			return requests.filter((request) => request.method === method);
		}

		function intentSaved() {
			return readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS) !== null;
		}

		function expectQuietlyNotSent() {
			expect(requested("eth_sendTransaction")).toHaveLength(0);
			expect(requested("wallet_sendTransaction")).toHaveLength(0);
			expect(capturedDeposit?.status).toBe("idle");
			expect(capturedDeposit?.error).toBeNull();
			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(false);
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
		}

		it("does not prompt the wallet to send when the session drops while viem reads the chain at the send step", async () => {
			const state: SessionState = { current: true, replaced: false };
			onRequest = (method) => {
				if (method === "eth_chainId" && intentSaved()) interrupt(state);
			};

			await submit("wallet", "cctp", { session: session(state) });

			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expect(state.current).toBe(false);
			expectQuietlyNotSent();
		});

		it("sends once the session recovered on the same account before the send step", async () => {
			const state: SessionState = { current: true, replaced: false };
			onRequest = (method) => {
				if (method === "eth_signTypedData_v4") {
					state.current = false;
					state.settled = true;
				}
			};

			await submit("wallet", "cctp", { session: session(state) });

			const [sent] = requested("eth_sendTransaction");
			expect(sent?.params).toEqual([
				expect.objectContaining({
					from: WALLET_ADDRESS,
					to: CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtension,
				}),
			]);
			expect(requested("eth_sendTransaction")).toHaveLength(1);
			expect(capturedDeposit?.status).toBe("error");
			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(false);
		});

		it("stops quietly and releases the authorization when the session is replaced after it was saved", async () => {
			const state: SessionState = { current: true, replaced: false };
			onRequest = (method) => {
				if (method === "eth_chainId" && intentSaved()) {
					state.current = false;
					state.replaced = true;
				}
			};

			await submit("wallet", "cctp", { session: session(state) });

			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expect(state.replaced).toBe(true);
			expectQuietlyNotSent();
		});

		it("stops quietly when the wallet refused the send and the fallback is then blocked", async () => {
			const state: SessionState = { current: true, replaced: false };
			sendTransaction = async () => {
				state.current = false;
				state.replaced = true;
				throw Object.assign(new Error("The method eth_sendTransaction does not exist."), { code: -32601 });
			};

			await submit("wallet", "cctp", { session: session(state) });

			expect(requested("eth_sendTransaction")).toHaveLength(1);
			expect(requested("wallet_sendTransaction")).toHaveLength(0);
			expect(capturedDeposit?.status).toBe("idle");
			expect(capturedDeposit?.error).toBeNull();
			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(false);
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
		});

		it("keeps the outcome unknown when the wallet answered the send unclearly and the fallback is then blocked", async () => {
			const state: SessionState = { current: true, replaced: false };
			sendTransaction = async () => {
				state.current = false;
				state.replaced = true;
				throw Object.assign(new Error("Internal error"), { code: -32000 });
			};

			await submit("wallet", "cctp", { session: session(state) });

			expect(requested("eth_sendTransaction")).toHaveLength(1);
			expect(requested("wallet_sendTransaction")).toHaveLength(0);
			expect(capturedDeposit?.status).toBe("error");
			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(true);
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).not.toBeNull();
		});

		it.each([
			{
				answer: "a refusal wrapped around an unclear wallet error",
				cause: { code: -32603, message: "Internal error" },
				quiet: false,
			},
			{
				answer: "a refusal whose causes carry only refusals",
				cause: Object.assign(new Error("An unknown RPC error occurred."), {
					code: -1,
					cause: { code: 4001, message: "User rejected the request." },
				}),
				quiet: true,
			},
		])("reads every code of $answer before releasing a blocked fallback", async ({ cause, quiet }) => {
			const state: SessionState = { current: true, replaced: false };
			sendTransaction = async () => {
				state.current = false;
				state.replaced = true;
				throw Object.assign(new Error("The method eth_sendTransaction does not exist."), { code: -32601, cause });
			};

			await submit("wallet", "cctp", { session: session(state) });

			expect(requested("eth_sendTransaction")).toHaveLength(1);
			expect(requested("wallet_sendTransaction")).toHaveLength(0);
			expect(capturedDeposit?.status).toBe(quiet ? "idle" : "error");
			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(!quiet);
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS) === null).toBe(quiet);
		});

		it.each([
			{
				fallback: "refuses",
				answer: () => Promise.reject(Object.assign(new Error("User rejected the request."), { code: 4001 })),
			},
			{ fallback: "would broadcast a second transaction", answer: async () => `0x${"2".repeat(64)}` },
		])(
			"does not send again after an unclear send, and keeps the authorization and the unknown outcome (the fallback $fallback)",
			async ({ answer }) => {
				sendTransaction = async () => {
					throw Object.assign(new Error("Internal error"), { code: -32000 });
				};
				walletSendTransaction = answer;

				await submit("wallet", "cctp", { session: session({ current: true, replaced: false }) });

				expect(requested("eth_sendTransaction")).toHaveLength(1);
				expect(requested("wallet_sendTransaction")).toHaveLength(0);
				expect(capturedDeposit?.status).toBe("error");
				expect(capturedDeposit?.hash).toBeUndefined();
				expect(capturedDeposit?.submissionOutcomeUnknown).toBe(true);
				expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).not.toBeNull();
				expect(readCctpDepositTrackingRecords("Mainnet", WALLET_ADDRESS)).toEqual([]);
			},
		);

		it("reports an ordinary failure and releases the authorization when nothing reached the wallet's send", async () => {
			onRequest = (method) => {
				if (method === "eth_chainId" && intentSaved()) throw new Error("Request failed");
			};

			await submit("wallet", "cctp", { session: session({ current: true, replaced: false }) });

			expect(requested("eth_sendTransaction")).toHaveLength(0);
			expect(requested("wallet_sendTransaction")).toHaveLength(0);
			expect(capturedDeposit?.status).toBe("error");
			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(false);
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).toBeNull();
		});

		it("stops quietly when a voided attempt's chain read fails inside writeContract before anything was sent", async () => {
			const state: SessionState = { current: true, replaced: false };
			onRequest = (method) => {
				if (method === "eth_chainId" && intentSaved()) {
					state.current = false;
					state.replaced = true;
					throw new Error("Request failed");
				}
			};

			await submit("wallet", "cctp", { session: session(state) });

			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expectQuietlyNotSent();
		});

		it("reports a stop before sending whose authorization could not be released", async () => {
			const state: SessionState = { current: true, replaced: false };
			onRequest = (method) => {
				if (method === "eth_chainId" && intentSaved()) {
					state.current = false;
					state.replaced = true;
				}
			};
			const intentKey = getCctpSponsoredAuthorizationIntentStorageKey("Mainnet", WALLET_ADDRESS);
			const originalRemoveItem = Storage.prototype.removeItem;
			const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
				if (key === intentKey) throw new Error("storage unavailable");
				originalRemoveItem.call(this, key);
			});

			try {
				await submit("wallet", "cctp", { session: session(state) });
			} finally {
				removeItem.mockRestore();
			}

			expect(requested("eth_sendTransaction")).toHaveLength(0);
			expect(capturedDeposit?.status).toBe("error");
			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(true);
			expect(readCctpSponsoredAuthorizationIntent("Mainnet", WALLET_ADDRESS)).not.toBeNull();
		});

		it("waits after the signature, runs no fresh check meanwhile, and sends once the session is back on the same account", async () => {
			const state: SessionState = { current: true, replaced: false };
			const settlement = heldSettlement(state);
			onRequest = (method) => {
				if (method === "eth_signTypedData_v4") interrupt(state);
			};

			const submission = startSubmission("wallet", { session: session(state) });
			await act(async () => settlement.waiting);
			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expect(requested("eth_sendTransaction")).toHaveLength(0);
			expect(testState.publicClient.estimateContractGas).not.toHaveBeenCalled();
			expect(testState.publicClient.getBalance).not.toHaveBeenCalled();
			expect(testState.verifyLegalAction).not.toHaveBeenCalled();
			expect(intentSaved()).toBe(false);

			state.settled = true;
			await act(async () => {
				settlement.settle("same");
				await submission;
			});

			expect(state.waitLimits).toEqual([30_000]);
			expect(testState.publicClient.estimateContractGas).toHaveBeenCalledOnce();
			expect(testState.verifyLegalAction).toHaveBeenCalledOnce();
			expect(requested("eth_sendTransaction")).toHaveLength(1);
			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expect(capturedDeposit?.status).toBe("error");
			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(false);
		});

		it("stops quietly after the signature when the session comes back on another account", async () => {
			const state: SessionState = { current: true, replaced: false };
			const settlement = heldSettlement(state);
			onRequest = (method) => {
				if (method === "eth_signTypedData_v4") interrupt(state);
			};

			const submission = startSubmission("wallet", { session: session(state) });
			await act(async () => settlement.waiting);
			state.replaced = true;
			await act(async () => {
				settlement.settle("replaced");
				await submission;
			});

			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expect(testState.verifyLegalAction).not.toHaveBeenCalled();
			expectQuietlyNotSent();
		});

		it("does not send after the signature when the session wait times out", async () => {
			const state: SessionState = { current: true, replaced: false };
			const settlement = heldSettlement(state);
			onRequest = (method) => {
				if (method === "eth_signTypedData_v4") interrupt(state);
			};

			const submission = startSubmission("wallet", { session: session(state) });
			await act(async () => settlement.waiting);
			await act(async () => {
				settlement.settle("timeout");
				await submission;
			});

			expect(requested("eth_signTypedData_v4")).toHaveLength(1);
			expect(requested("eth_sendTransaction")).toHaveLength(0);
			expect(requested("wallet_sendTransaction")).toHaveLength(0);
			expect(testState.verifyLegalAction).not.toHaveBeenCalled();
			expectNotSentBecauseTheSessionDidNotSettle();
		});

		it.each([
			{ step: "the gas checks", back: false },
			{ step: "the gas checks", back: true },
			{ step: "the legal recheck", back: false },
			{ step: "the legal recheck", back: true },
		])(
			"stops quietly when the session is interrupted again during $step after the wait (back: $back)",
			async ({ step, back }) => {
				const state: SessionState = { current: true, replaced: false };
				function interruptAgain() {
					interrupt(state);
					if (back) state.settled = true;
				}
				testState.publicClient.getBlockNumber.mockImplementation(async () => {
					if (step === "the gas checks") interruptAgain();
					return 400_000_000n;
				});
				testState.verifyLegalAction.mockImplementation(async () => {
					if (step === "the legal recheck") interruptAgain();
					return { canPerformActions: true };
				});

				await submit("wallet", "cctp", { session: session(state) });

				expect(state.waitLimits).toEqual([30_000]);
				expect(requested("eth_signTypedData_v4")).toHaveLength(1);
				expectQuietlyNotSent();
			},
		);

		it("checks the legal status only after the interrupted session came back", async () => {
			const state: SessionState = { current: true, replaced: false };
			const settlement = heldSettlement(state);
			const signature = heldSignature();
			signTypedData = () => {
				interrupt(state);
				return signature.held();
			};

			const submission = startSubmission("wallet", { session: session(state) });
			const ended = trackEnd(submission);
			await act(async () => signature.reached);
			testState.selectedOwner = "disconnected";
			rerenderSubmission("wallet");
			await act(async () => {
				signature.release();
				await Promise.race([settlement.waiting, submission]);
			});
			expect(ended.value).toBe(false);
			expect(testState.verifyLegalAction).not.toHaveBeenCalled();

			testState.selectedOwner = WALLET_ADDRESS;
			rerenderSubmission("wallet");
			state.settled = true;
			await act(async () => {
				settlement.settle("same");
				await submission;
			});

			expect(testState.verifyLegalAction).toHaveBeenCalledOnce();
			expect(requested("eth_sendTransaction")).toHaveLength(1);
			expect(capturedDeposit?.submissionOutcomeUnknown).toBe(false);
		});
	});
});
