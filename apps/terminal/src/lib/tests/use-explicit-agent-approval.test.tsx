// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { createExchangeClient } from "@sairn/hl-react/clients";
import { ExchangeActionDeadlineError } from "@sairn/hl-react/internal/exchange/request-scheduler";
import * as session from "@sairn/hl-react/signing/agent-registration-session";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExplicitAgentApproval } from "@/hooks/wallet/use-explicit-agent-approval";
import { formatTransferError } from "@/lib/errors/format";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";

const OWNER = "0x1111111111111111111111111111111111111111";
const AGENT = "0x2222222222222222222222222222222222222222";
const OTHER_OWNER = "0x3333333333333333333333333333333333333333";
const SESSION_CHANGED = "The active wallet or network changed. Review the account and try again.";
const GEO_QUERY_KEY = ["geo", null];
const REGION_RESTRICTED = "Trading is not available in your region";
const REGION_UNVERIFIED = "Unable to verify regional availability. Trading is temporarily unavailable.";

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

interface TestTransport {
	request: (endpoint: "info" | "exchange", payload: unknown, signal?: AbortSignal) => Promise<unknown>;
}

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

function createDeferred<T>(): Deferred<T> {
	let resolve = (_value: T) => {};
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}

const testState = vi.hoisted(() => ({
	clientApproveAgent: vi.fn(),
	captureRegistrationLease: vi.fn(),
	createExchangeClient: vi.fn(),
	createExternalAgentSigner: vi.fn(),
	createPrivyAgentSigner: vi.fn(),
	beforeSubmit: undefined as (() => Promise<void>) | undefined,
	connectedWalletAddress: "0x1111111111111111111111111111111111111111",
	connectionChainId: 42161 as number,
	embeddedWalletAddress: "0x1111111111111111111111111111111111111111",
	enforceLegalActions: false,
	env: "Mainnet" as "Mainnet" | "Testnet",
	exchangeLifecycle: { id: Symbol.for("test-provider"), active: true },
	hasWalletAccess: true,
	hasSameWalletAddress: true,
	isRegistrationLeaseCurrent: vi.fn(),
	signTypedData: vi.fn(),
	startRegistrationExecution: vi.fn(),
	startRegistrationSubmission: vi.fn(),
	transportRequest: vi.fn(),
	verifyLegalActionAllowed: vi.fn(),
	walletAddress: "0x1111111111111111111111111111111111111111",
	walletClient: {
		account: { address: "0x1111111111111111111111111111111111111111" },
	} as { account: { address: string } } | undefined,
	walletIntent: "embedded" as "embedded" | "external" | "ambiguous" | "unavailable",
}));

vi.mock("@/lib/geo/get-geo", () => ({
	getGeo: vi.fn().mockRejectedValue(new Error("Geo restriction check unavailable")),
}));

vi.mock("@privy-io/react-auth", () => ({
	useSignTypedData: () => ({ signTypedData: testState.signTypedData }),
}));

vi.mock("wagmi", () => ({
	useConnection: () => ({ chainId: testState.connectionChainId }),
	useWalletClient: (parameters?: { chainId?: number }) => ({
		data: parameters?.chainId === testState.connectionChainId ? testState.walletClient : undefined,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	captureAgentRegistrationExecutionLease: testState.captureRegistrationLease,
	createExchangeClient: testState.createExchangeClient,
	HttpTransport: class {
		readonly isTestnet: boolean;
		constructor(options: { isTestnet: boolean }) {
			this.isTestnet = options.isTestnet;
		}
		request = testState.transportRequest;
	},
	isAgentRegistrationExecutionLeaseCurrent: testState.isRegistrationLeaseCurrent,
	startAgentRegistrationExecution: testState.startRegistrationExecution,
	startAgentRegistrationSubmission: testState.startRegistrationSubmission,
	verifyLegalActionAllowed: testState.verifyLegalActionAllowed,
	useHyperliquid: () => ({
		enforceLegalActions: testState.enforceLegalActions,
		env: testState.env,
		exchangeLifecycle: testState.exchangeLifecycle,
		info: { legalCheck: vi.fn() },
	}),
}));

vi.mock("@/lib/wallet/privy-agent-signer", () => ({
	createPrivyAgentSigner: testState.createPrivyAgentSigner,
}));

vi.mock("@/lib/wallet/external-agent-signer", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/wallet/external-agent-signer")>()),
	createExternalAgentSigner: testState.createExternalAgentSigner,
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	hasSameWalletAddress: (left: string | undefined, right: string | undefined) =>
		testState.hasSameWalletAddress && !!left && !!right && left.toLowerCase() === right.toLowerCase(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		connectedWalletAddress: testState.connectedWalletAddress,
		embeddedWalletAddress: testState.embeddedWalletAddress,
		hasWalletAccess: testState.hasWalletAccess,
		walletAddress: testState.walletAddress,
		walletIntent: testState.walletIntent,
	}),
}));

describe("useExplicitAgentApproval", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let approval: ExplicitAgentApproval | undefined;
	let Probe: (() => null) | undefined;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient();
		queryClient.setQueryData(GEO_QUERY_KEY, { country: "GB", proxy: false, tradeRestricted: false });
		approval = undefined;
		Probe = undefined;
		testState.beforeSubmit = undefined;
		testState.connectedWalletAddress = OWNER;
		testState.embeddedWalletAddress = OWNER;
		testState.env = "Mainnet";
		testState.exchangeLifecycle.active = true;
		testState.hasWalletAccess = true;
		testState.walletAddress = OWNER;
		testState.walletClient = { account: { address: OWNER } };
		testState.walletIntent = "embedded";
		testState.clientApproveAgent.mockReset();
		testState.clientApproveAgent.mockResolvedValue({ status: "ok", response: { type: "default" } });
		testState.captureRegistrationLease.mockReset();
		testState.captureRegistrationLease.mockReturnValue({
			agentPublicKey: AGENT,
			epoch: { env: "Mainnet", owner: OWNER, epoch: "11111111-1111-4111-8111-111111111111" },
		});
		testState.createExchangeClient.mockReset();
		testState.createExchangeClient.mockReturnValue({ approveAgent: testState.clientApproveAgent });
		testState.createExternalAgentSigner.mockReset();
		testState.createExternalAgentSigner.mockImplementation((options: { beforeSubmit: () => Promise<void> }) => {
			testState.beforeSubmit = options.beforeSubmit;
			return { getAddresses: vi.fn(), getChainId: vi.fn(), signTypedData: vi.fn() };
		});
		testState.createPrivyAgentSigner.mockReset();
		testState.createPrivyAgentSigner.mockImplementation((options: { beforeSubmit: () => Promise<void> }) => {
			testState.beforeSubmit = options.beforeSubmit;
			return { address: OWNER };
		});
		testState.enforceLegalActions = false;
		testState.hasSameWalletAddress = true;
		testState.isRegistrationLeaseCurrent.mockReset();
		testState.isRegistrationLeaseCurrent.mockResolvedValue(true);
		testState.startRegistrationExecution.mockReset();
		testState.startRegistrationExecution.mockImplementation(
			async (_lease: unknown, canStart: () => boolean, execute: () => Promise<unknown>) =>
				canStart() ? { status: "started", execution: execute() } : { status: "invalidated" },
		);
		testState.startRegistrationSubmission.mockReset();
		testState.startRegistrationSubmission.mockImplementation(
			async (_lease: unknown, canStart: () => boolean, execute: () => Promise<unknown>) =>
				canStart() ? { status: "started", execution: execute() } : { status: "invalidated" },
		);
		testState.transportRequest.mockReset();
		testState.transportRequest.mockResolvedValue({ status: "ok", response: { type: "default" } });
		testState.verifyLegalActionAllowed.mockReset();
		testState.verifyLegalActionAllowed.mockResolvedValue({});
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		vi.clearAllMocks();
	});

	async function renderApprovalHook() {
		const { useExplicitAgentApproval } = await import("@/hooks/wallet/use-explicit-agent-approval");
		if (!Probe) {
			Probe = () => {
				approval = useExplicitAgentApproval();
				return null;
			};
		}
		const CurrentProbe = Probe;
		act(() => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(CurrentProbe))));
		if (!approval) throw new Error("Approval hook did not render");
		return approval;
	}

	function setRegion(region: "allowed" | "restricted" | "proxy" | "unavailable") {
		if (region === "unavailable") {
			queryClient
				.getQueryCache()
				.find({ queryKey: GEO_QUERY_KEY })
				?.setState({ status: "error", error: new Error("Geo restriction check unavailable") });
			return;
		}
		queryClient.setQueryData(GEO_QUERY_KEY, {
			country: region === "allowed" ? "GB" : "US",
			proxy: region === "proxy",
			tradeRestricted: region !== "allowed",
		});
	}

	function mockSubmittingClient() {
		testState.createExchangeClient.mockImplementation(
			(_signer: unknown, _isTestnet: boolean, _cacheKey: undefined, transport: TestTransport) => ({
				approveAgent: async () => {
					if (!testState.beforeSubmit) throw new Error("Missing pre-submit guard");
					await testState.beforeSubmit();
					return transport.request("exchange", { action: "approveAgent" });
				},
			}),
		);
	}

	describe("trading region", () => {
		it.each([
			{ region: "restricted", wallet: "embedded", message: REGION_RESTRICTED },
			{ region: "proxy", wallet: "external", message: REGION_RESTRICTED },
			{ region: "unavailable", wallet: "embedded", message: REGION_UNVERIFIED },
			{ region: "unavailable", wallet: "external", message: REGION_UNVERIFIED },
		] as const)(
			"refuses a named Agent grant before any signer when the region is $region ($wallet wallet)",
			async ({ region, wallet, message }) => {
				testState.walletIntent = wallet;
				testState.enforceLegalActions = true;
				setRegion(region);
				const hook = await renderApprovalHook();

				await act(async () => {
					await expect(hook.mutateAsync({ agentAddress: AGENT, agentName: "Bot" })).rejects.toThrow(message);
				});

				expect(testState.verifyLegalActionAllowed).not.toHaveBeenCalled();
				expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
				expect(testState.createExternalAgentSigner).not.toHaveBeenCalled();
				expect(testState.createExchangeClient).not.toHaveBeenCalled();
				expect(testState.transportRequest).not.toHaveBeenCalled();
			},
		);

		it("refuses a named Agent grant when the region turns restricted during the legal check", async () => {
			testState.enforceLegalActions = true;
			testState.verifyLegalActionAllowed.mockImplementationOnce(async () => {
				setRegion("restricted");
				return {};
			});
			const hook = await renderApprovalHook();

			await act(async () => {
				await expect(hook.mutateAsync({ agentAddress: AGENT, agentName: "Bot" })).rejects.toThrow(REGION_RESTRICTED);
			});

			expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
			expect(testState.createExchangeClient).not.toHaveBeenCalled();
		});

		it.each(["embedded", "external"] as const)(
			"does not send a signed named Agent grant when the region becomes unverified after the %s wallet signs",
			async (wallet) => {
				testState.walletIntent = wallet;
				mockSubmittingClient();
				testState.isRegistrationLeaseCurrent.mockImplementationOnce(async () => {
					setRegion("unavailable");
					return true;
				});
				const hook = await renderApprovalHook();

				await act(async () => {
					await expect(hook.mutateAsync({ agentAddress: AGENT, agentName: "Bot" })).rejects.toThrow(REGION_UNVERIFIED);
				});

				expect(testState.transportRequest).not.toHaveBeenCalled();
			},
		);

		it("reports the region, not a session change, when it turns restricted while the send waits for the lock", async () => {
			mockSubmittingClient();
			let calls = 0;
			testState.startRegistrationExecution.mockImplementation(
				async (_lease: unknown, canStart: () => boolean, execute: () => Promise<unknown>) => {
					calls += 1;
					if (calls === 2) setRegion("restricted");
					return canStart() ? { status: "started", execution: execute() } : { status: "invalidated" };
				},
			);
			const hook = await renderApprovalHook();

			await act(async () => {
				await expect(hook.mutateAsync({ agentAddress: AGENT, agentName: "Bot" })).rejects.toThrow(REGION_RESTRICTED);
			});

			expect(calls).toBe(2);
			expect(testState.transportRequest).not.toHaveBeenCalled();
		});

		it("unwraps a region refusal that the SDK wrapped around the signer error", async () => {
			testState.createExchangeClient.mockImplementation(() => ({
				approveAgent: async () => {
					setRegion("restricted");
					try {
						if (!testState.beforeSubmit) throw new Error("Missing pre-submit guard");
						await testState.beforeSubmit();
					} catch (cause) {
						throw new Error("Failed to sign the typed data using the wallet", { cause });
					}
					return { status: "ok" };
				},
			}));
			const hook = await renderApprovalHook();

			await act(async () => {
				await expect(hook.mutateAsync({ agentAddress: AGENT, agentName: "Bot" })).rejects.toThrow(REGION_RESTRICTED);
			});
		});

		it.each(["restricted", "unavailable"] as const)(
			"keeps the unnamed trading-connection Agent available when the region is %s",
			async (region) => {
				setRegion(region);
				const hook = await renderApprovalHook();

				await act(async () => {
					await hook.mutateAsync({ agentAddress: AGENT }, { registrationPublicKey: AGENT });
				});

				expect(testState.clientApproveAgent).toHaveBeenCalledOnce();
			},
		);

		it.each(["restricted", "unavailable"] as const)(
			"keeps removing a named Agent (zero address) available when the region is %s",
			async (region) => {
				testState.enforceLegalActions = true;
				setRegion(region);
				const hook = await renderApprovalHook();

				await act(async () => {
					await hook.mutateAsync({ agentAddress: "0x0000000000000000000000000000000000000000", agentName: "Bot" });
				});

				expect(testState.verifyLegalActionAllowed).toHaveBeenCalledOnce();
				expect(testState.clientApproveAgent).toHaveBeenCalledOnce();
			},
		);
	});

	it("passes an unnamed default-Agent approval through without inventing a name", async () => {
		const hook = await renderApprovalHook();

		await act(async () => {
			await hook.mutateAsync({ agentAddress: AGENT }, { registrationPublicKey: AGENT });
		});

		expect(testState.clientApproveAgent).toHaveBeenCalledOnce();
		const [params] = testState.clientApproveAgent.mock.calls[0] ?? [];
		expect(params).toEqual({ agentAddress: AGENT });
		expect(params).not.toHaveProperty("agentName");
	});

	it("passes AbortSignal to the direct embedded-wallet SDK request", async () => {
		const hook = await renderApprovalHook();
		const controller = new AbortController();
		const params = { agentAddress: AGENT, agentName: "Mobile" };

		await act(async () => {
			await hook.mutateAsync(params, { signal: controller.signal });
		});

		expect(testState.captureRegistrationLease).toHaveBeenCalledWith("Mainnet", OWNER, undefined);
		expect(testState.clientApproveAgent).toHaveBeenCalledWith(params, { signal: controller.signal });
	});

	it("shows the embedded-wallet confirmation by default", async () => {
		const hook = await renderApprovalHook();

		await act(async () => {
			await hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
		});

		expect(testState.createPrivyAgentSigner).toHaveBeenCalledWith(
			expect.objectContaining({ applicationReview: undefined }),
		);
	});

	it("forwards an explicitly confirmed application review to the embedded signer", async () => {
		const hook = await renderApprovalHook();

		await act(async () => {
			await hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" }, { applicationReview: "confirmed" });
		});

		expect(testState.createPrivyAgentSigner).toHaveBeenCalledWith(
			expect.objectContaining({ applicationReview: "confirmed" }),
		);
	});

	it("translates the embedded-wallet confirmation in the language active at approval time", async () => {
		const hook = await renderApprovalHook();
		i18n.loadAndActivate({
			locale: "zh",
			messages: {
				[messageId("Approve mobile trading access")]: "授权移动交易权限",
				[messageId("Review and approve this Hyperliquid Agent permission.")]: "请核对并授权此 Hyperliquid Agent 权限。",
				[messageId("Approve access")]: "授权",
			},
		});

		try {
			await act(async () => {
				await hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			});
		} finally {
			i18n.loadAndActivate({ locale: "en", messages: {} });
		}

		expect(testState.createPrivyAgentSigner).toHaveBeenCalledWith(
			expect.objectContaining({
				reviewCopy: {
					title: "授权移动交易权限",
					description: "请核对并授权此 Hyperliquid Agent 权限。",
					buttonText: "授权",
				},
			}),
		);
	});

	it("checks legal access before the direct embedded-wallet SDK request", async () => {
		testState.enforceLegalActions = true;
		const hook = await renderApprovalHook();
		const params = { agentAddress: AGENT, agentName: "Mobile" };

		await act(async () => {
			await hook.mutateAsync(params);
		});

		expect(testState.verifyLegalActionAllowed).toHaveBeenCalledWith(
			expect.objectContaining({ env: "Mainnet", owner: OWNER }),
		);
		expect(testState.verifyLegalActionAllowed.mock.invocationCallOrder[0]).toBeLessThan(
			testState.clientApproveAgent.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
		);
	});

	it("does not dispatch direct approval when legal access cannot be verified", async () => {
		testState.enforceLegalActions = true;
		testState.verifyLegalActionAllowed.mockRejectedValue(new Error("legal status unavailable"));
		const hook = await renderApprovalHook();

		await act(async () => {
			await expect(hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" })).rejects.toThrow(
				"legal status unavailable",
			);
		});

		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("binds lease capture to the exact pending Agent and fails closed if another tab replaced it", async () => {
		testState.captureRegistrationLease.mockReturnValue(null);
		const hook = await renderApprovalHook();
		const params = { agentAddress: AGENT, agentName: "Mobile" };

		await act(async () => {
			await expect(hook.mutateAsync(params, { registrationPublicKey: AGENT })).rejects.toThrow(SESSION_CHANGED);
		});

		expect(testState.captureRegistrationLease).toHaveBeenCalledWith("Mainnet", OWNER, {
			agentPublicKey: AGENT,
		});
		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("checks the lease after the real SDK obtains the embedded owner's signature", async () => {
		const account = privateKeyToAccount(generatePrivateKey());
		testState.walletAddress = testState.connectedWalletAddress = testState.embeddedWalletAddress = account.address;
		testState.walletClient = { account: { address: account.address } };
		const signer = await vi.importActual<typeof import("@/lib/wallet/privy-agent-signer")>(
			"@/lib/wallet/privy-agent-signer",
		);
		testState.createPrivyAgentSigner.mockImplementation(signer.createPrivyAgentSigner);
		testState.createExchangeClient.mockImplementation(createExchangeClient);
		testState.captureRegistrationLease.mockImplementation(session.captureAgentRegistrationExecutionLease);
		testState.startRegistrationExecution.mockImplementation(session.startAgentRegistrationExecution);
		testState.isRegistrationLeaseCurrent.mockImplementation(session.isAgentRegistrationExecutionLeaseCurrent);
		const previous = Object.getOwnPropertyDescriptor(navigator, "locks");
		Object.defineProperty(navigator, "locks", {
			configurable: true,
			value: {
				request: async (_name: string, _options: LockOptions, callback: () => unknown) => callback(),
			},
		});
		let sessionClosedWhileSigning = false;
		testState.signTypedData.mockImplementationOnce(async (data) => {
			const signature = await account.signTypedData(data);
			sessionClosedWhileSigning = await session.closeAgentRegistrationSession("Mainnet", account.address);
			return { signature };
		});
		try {
			expect(await session.activateAgentRegistrationSession("Mainnet", account.address)).toBe(true);
			const hook = await renderApprovalHook();
			let rejection: unknown;
			await act(async () => {
				rejection = await hook
					.mutateAsync({ agentAddress: AGENT }, { applicationReview: "confirmed" })
					.catch((error: unknown) => error);
			});
			expect(sessionClosedWhileSigning).toBe(true);
			expect(rejection).toBeInstanceOf(Error);
			expect(formatTransferError(rejection as Error, (descriptor) => i18n._(descriptor))).toBe(SESSION_CHANGED);
			expect(testState.signTypedData).toHaveBeenCalledOnce();
			expect(testState.signTypedData.mock.calls[0]?.[0]).toMatchObject({
				primaryType: "HyperliquidTransaction:ApproveAgent",
				message: { agentAddress: AGENT.toLowerCase() },
			});
			expect(testState.transportRequest).not.toHaveBeenCalled();
		} finally {
			if (previous) Object.defineProperty(navigator, "locks", previous);
			else Reflect.deleteProperty(navigator, "locks");
			localStorage.removeItem(`hyperliquid_exchange_nonce_Mainnet_${account.address.toLowerCase()}`);
			localStorage.removeItem(`hyperliquid_agent_registration_session_Mainnet_${account.address.toLowerCase()}`);
		}
	});

	it("does not open the external wallet prompt when the registration session ends while the real SDK reads the chain", async () => {
		const account = privateKeyToAccount(generatePrivateKey());
		testState.walletIntent = "external";
		testState.walletAddress = testState.connectedWalletAddress = account.address;
		testState.embeddedWalletAddress = OTHER_OWNER;
		const chainId = createDeferred<number>();
		const walletGetChainId = vi.fn(() => chainId.promise);
		const walletSignTypedData = vi.fn((data: Parameters<typeof account.signTypedData>[0]) =>
			account.signTypedData(data),
		);
		testState.walletClient = {
			account: { address: account.address },
			getChainId: walletGetChainId,
			signTypedData: walletSignTypedData,
		} as unknown as { account: { address: string } };
		const signer = await vi.importActual<typeof import("@/lib/wallet/external-agent-signer")>(
			"@/lib/wallet/external-agent-signer",
		);
		testState.createExternalAgentSigner.mockImplementation(signer.createExternalAgentSigner);
		testState.createExchangeClient.mockImplementation(createExchangeClient);
		testState.captureRegistrationLease.mockImplementation(session.captureAgentRegistrationExecutionLease);
		testState.startRegistrationExecution.mockImplementation(session.startAgentRegistrationExecution);
		testState.isRegistrationLeaseCurrent.mockImplementation(session.isAgentRegistrationExecutionLeaseCurrent);
		const previous = Object.getOwnPropertyDescriptor(navigator, "locks");
		Object.defineProperty(navigator, "locks", {
			configurable: true,
			value: {
				request: async (_name: string, _options: LockOptions, callback: () => unknown) => callback(),
			},
		});
		try {
			expect(await session.activateAgentRegistrationSession("Mainnet", account.address)).toBe(true);
			const hook = await renderApprovalHook();
			let request: Promise<unknown> | undefined;
			await act(async () => {
				request = hook
					.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" }, { applicationReview: "confirmed" })
					.catch((error: unknown) => error);
				await vi.waitFor(() => expect(walletGetChainId).toHaveBeenCalled());
			});
			if (!request) throw new Error("External Agent approval did not start");

			expect(await session.closeAgentRegistrationSession("Mainnet", account.address)).toBe(true);
			chainId.resolve(42161);

			let rejection: unknown;
			await act(async () => {
				rejection = await request;
			});
			expect(rejection).toBeInstanceOf(Error);
			expect(formatTransferError(rejection as Error, (descriptor) => i18n._(descriptor))).toBe(SESSION_CHANGED);
			expect(walletSignTypedData).not.toHaveBeenCalled();
			expect(testState.transportRequest).not.toHaveBeenCalled();
		} finally {
			if (previous) Object.defineProperty(navigator, "locks", previous);
			else Reflect.deleteProperty(navigator, "locks");
			localStorage.removeItem(`hyperliquid_exchange_nonce_Mainnet_${account.address.toLowerCase()}`);
			localStorage.removeItem(`hyperliquid_agent_registration_session_Mainnet_${account.address.toLowerCase()}`);
		}
	});

	it("does not open the external wallet prompt when its click deadline passes while its lease check is pending", async () => {
		const account = privateKeyToAccount(generatePrivateKey());
		testState.walletIntent = "external";
		testState.walletAddress = testState.connectedWalletAddress = account.address;
		testState.embeddedWalletAddress = OTHER_OWNER;
		const walletSignTypedData = vi.fn((data: Parameters<typeof account.signTypedData>[0]) =>
			account.signTypedData(data),
		);
		testState.walletClient = {
			account: { address: account.address },
			getChainId: vi.fn(async () => 42161),
			signTypedData: walletSignTypedData,
		} as unknown as { account: { address: string } };
		const signer = await vi.importActual<typeof import("@/lib/wallet/external-agent-signer")>(
			"@/lib/wallet/external-agent-signer",
		);
		testState.createExternalAgentSigner.mockImplementation(signer.createExternalAgentSigner);
		testState.createExchangeClient.mockImplementation(createExchangeClient);
		testState.captureRegistrationLease.mockImplementation(session.captureAgentRegistrationExecutionLease);
		testState.startRegistrationExecution.mockImplementation(session.startAgentRegistrationExecution);
		const heldLease = createDeferred<boolean>();
		testState.isRegistrationLeaseCurrent.mockImplementationOnce(() => heldLease.promise);
		testState.isRegistrationLeaseCurrent.mockImplementation(session.isAgentRegistrationExecutionLeaseCurrent);
		const deadline = {
			current: { queuedAt: Date.now(), queuedAtMonotonic: performance.now(), deadlineMs: 15_000 },
		};
		const previous = Object.getOwnPropertyDescriptor(navigator, "locks");
		Object.defineProperty(navigator, "locks", {
			configurable: true,
			value: {
				request: async (_name: string, _options: LockOptions, callback: () => unknown) => callback(),
			},
		});
		try {
			expect(await session.activateAgentRegistrationSession("Mainnet", account.address)).toBe(true);
			const hook = await renderApprovalHook();
			let request: Promise<unknown> | undefined;
			await act(async () => {
				request = hook
					.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" }, { applicationReview: "confirmed", deadline })
					.catch((error: unknown) => error);
				await vi.waitFor(() => expect(testState.isRegistrationLeaseCurrent).toHaveBeenCalledOnce());
			});
			if (!request) throw new Error("External Agent approval did not start");

			deadline.current = {
				queuedAt: Date.now() - 16_000,
				queuedAtMonotonic: performance.now() - 16_000,
				deadlineMs: 15_000,
			};
			heldLease.resolve(true);

			let rejection: unknown;
			await act(async () => {
				rejection = await request;
			});
			expect(rejection).toBeInstanceOf(ExchangeActionDeadlineError);
			expect(walletSignTypedData).not.toHaveBeenCalled();
			expect(testState.transportRequest).not.toHaveBeenCalled();
		} finally {
			if (previous) Object.defineProperty(navigator, "locks", previous);
			else Reflect.deleteProperty(navigator, "locks");
			localStorage.removeItem(`hyperliquid_exchange_nonce_Mainnet_${account.address.toLowerCase()}`);
			localStorage.removeItem(`hyperliquid_agent_registration_session_Mainnet_${account.address.toLowerCase()}`);
		}
	});

	it("stops waiting for a registration lock held elsewhere once the approval is aborted, and opens no prompt", async () => {
		const account = privateKeyToAccount(generatePrivateKey());
		testState.walletIntent = "external";
		testState.walletAddress = testState.connectedWalletAddress = account.address;
		testState.embeddedWalletAddress = OTHER_OWNER;
		const chainId = createDeferred<number>();
		const walletGetChainId = vi.fn(() => chainId.promise);
		const walletSignTypedData = vi.fn((data: Parameters<typeof account.signTypedData>[0]) =>
			account.signTypedData(data),
		);
		testState.walletClient = {
			account: { address: account.address },
			getChainId: walletGetChainId,
			signTypedData: walletSignTypedData,
		} as unknown as { account: { address: string } };
		const signer = await vi.importActual<typeof import("@/lib/wallet/external-agent-signer")>(
			"@/lib/wallet/external-agent-signer",
		);
		testState.createExternalAgentSigner.mockImplementation(signer.createExternalAgentSigner);
		testState.createExchangeClient.mockImplementation(createExchangeClient);
		testState.captureRegistrationLease.mockImplementation(session.captureAgentRegistrationExecutionLease);
		testState.startRegistrationExecution.mockImplementation(session.startAgentRegistrationExecution);
		testState.isRegistrationLeaseCurrent.mockImplementation(session.isAgentRegistrationExecutionLeaseCurrent);
		const heldElsewhere = { active: false, release: () => {} };
		const lockRequest = vi.fn((_name: string, options: LockOptions, callback: () => unknown): Promise<unknown> => {
			if (!heldElsewhere.active) return Promise.resolve(callback());
			return new Promise((resolve, reject) => {
				const signal = options.signal;
				signal?.addEventListener(
					"abort",
					() => reject(Object.assign(new Error("The lock request was aborted."), { name: "AbortError" })),
					{ once: true },
				);
				heldElsewhere.release = () => resolve(callback());
			});
		});
		const previous = Object.getOwnPropertyDescriptor(navigator, "locks");
		Object.defineProperty(navigator, "locks", { configurable: true, value: { request: lockRequest } });
		const controller = new AbortController();
		try {
			expect(await session.activateAgentRegistrationSession("Mainnet", account.address)).toBe(true);
			const hook = await renderApprovalHook();
			let request: Promise<unknown> | undefined;
			await act(async () => {
				request = hook
					.mutateAsync(
						{ agentAddress: AGENT, agentName: "Mobile" },
						{ applicationReview: "confirmed", signal: controller.signal },
					)
					.catch((error: unknown) => error);
				await vi.waitFor(() => expect(walletGetChainId).toHaveBeenCalled());
			});
			if (!request) throw new Error("External Agent approval did not start");

			heldElsewhere.active = true;
			const locksBefore = lockRequest.mock.calls.length;
			chainId.resolve(42161);
			await act(async () => {
				await vi.waitFor(() => expect(lockRequest.mock.calls.length).toBeGreaterThan(locksBefore));
			});

			let rejection: unknown;
			await act(async () => {
				controller.abort();
				rejection = await request;
			});
			expect(rejection).toMatchObject({ cause: expect.objectContaining({ name: "AbortError" }) });
			expect(walletSignTypedData).not.toHaveBeenCalled();
			expect(testState.transportRequest).not.toHaveBeenCalled();
		} finally {
			heldElsewhere.release();
			if (previous) Object.defineProperty(navigator, "locks", previous);
			else Reflect.deleteProperty(navigator, "locks");
			localStorage.removeItem(`hyperliquid_exchange_nonce_Mainnet_${account.address.toLowerCase()}`);
			localStorage.removeItem(`hyperliquid_agent_registration_session_Mainnet_${account.address.toLowerCase()}`);
		}
	});

	it("does not open the external wallet prompt when the identity changes while the real SDK reads the chain", async () => {
		const account = privateKeyToAccount(generatePrivateKey());
		testState.walletIntent = "external";
		testState.walletAddress = testState.connectedWalletAddress = account.address;
		testState.embeddedWalletAddress = OTHER_OWNER;
		const chainId = createDeferred<number>();
		const walletGetChainId = vi.fn(() => chainId.promise);
		const walletSignTypedData = vi.fn((data: Parameters<typeof account.signTypedData>[0]) =>
			account.signTypedData(data),
		);
		testState.walletClient = {
			account: { address: account.address },
			getChainId: walletGetChainId,
			signTypedData: walletSignTypedData,
		} as unknown as { account: { address: string } };
		const signer = await vi.importActual<typeof import("@/lib/wallet/external-agent-signer")>(
			"@/lib/wallet/external-agent-signer",
		);
		testState.createExternalAgentSigner.mockImplementation(signer.createExternalAgentSigner);
		testState.createExchangeClient.mockImplementation(createExchangeClient);
		testState.captureRegistrationLease.mockImplementation(session.captureAgentRegistrationExecutionLease);
		testState.startRegistrationExecution.mockImplementation(session.startAgentRegistrationExecution);
		testState.isRegistrationLeaseCurrent.mockImplementation(session.isAgentRegistrationExecutionLeaseCurrent);
		const previous = Object.getOwnPropertyDescriptor(navigator, "locks");
		Object.defineProperty(navigator, "locks", {
			configurable: true,
			value: {
				request: async (_name: string, _options: LockOptions, callback: () => unknown) => callback(),
			},
		});
		try {
			expect(await session.activateAgentRegistrationSession("Mainnet", account.address)).toBe(true);
			const hook = await renderApprovalHook();
			let request: Promise<unknown> | undefined;
			await act(async () => {
				request = hook
					.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" }, { applicationReview: "confirmed" })
					.catch((error: unknown) => error);
				await vi.waitFor(() => expect(walletGetChainId).toHaveBeenCalled());
			});
			if (!request) throw new Error("External Agent approval did not start");

			testState.walletAddress = OTHER_OWNER;
			testState.connectedWalletAddress = OTHER_OWNER;
			await renderApprovalHook();
			chainId.resolve(42161);

			let rejection: unknown;
			await act(async () => {
				rejection = await request;
			});
			expect(rejection).toBeInstanceOf(Error);
			expect(formatTransferError(rejection as Error, (descriptor) => i18n._(descriptor))).toBe(SESSION_CHANGED);
			expect(walletSignTypedData).not.toHaveBeenCalled();
			expect(testState.transportRequest).not.toHaveBeenCalled();
		} finally {
			if (previous) Object.defineProperty(navigator, "locks", previous);
			else Reflect.deleteProperty(navigator, "locks");
			localStorage.removeItem(`hyperliquid_exchange_nonce_Mainnet_${account.address.toLowerCase()}`);
			localStorage.removeItem(`hyperliquid_agent_registration_session_Mainnet_${account.address.toLowerCase()}`);
		}
	});

	it("revalidates the exact pending Agent at the signed transport submission boundary", async () => {
		testState.createExchangeClient.mockImplementation(
			(_signer: unknown, _isTestnet: boolean, _cacheKey: undefined, transport: TestTransport) => ({
				approveAgent: async (_params: unknown, options?: { signal?: AbortSignal }) => {
					if (!testState.beforeSubmit) throw new Error("Missing pre-submit guard");
					await testState.beforeSubmit();
					return transport.request("exchange", { action: "approveAgent" }, options?.signal);
				},
			}),
		);
		const hook = await renderApprovalHook();
		const controller = new AbortController();

		await act(async () => {
			await hook.mutateAsync(
				{ agentAddress: AGENT, agentName: "sairn" },
				{ registrationPublicKey: AGENT, signal: controller.signal },
			);
		});

		expect(testState.captureRegistrationLease).toHaveBeenCalledWith("Mainnet", OWNER, { agentPublicKey: AGENT });
		expect(testState.startRegistrationSubmission).toHaveBeenCalledOnce();
		expect(testState.transportRequest).toHaveBeenCalledWith("exchange", { action: "approveAgent" }, undefined);
	});

	it("does not submit a signed request after the exact transport lease is invalidated", async () => {
		testState.startRegistrationSubmission.mockResolvedValue({ status: "invalidated" });
		testState.createExchangeClient.mockImplementation(
			(_signer: unknown, _isTestnet: boolean, _cacheKey: undefined, transport: TestTransport) => ({
				approveAgent: async () => {
					if (!testState.beforeSubmit) throw new Error("Missing pre-submit guard");
					await testState.beforeSubmit();
					return transport.request("exchange", { action: "approveAgent" });
				},
			}),
		);
		const hook = await renderApprovalHook();

		await act(async () => {
			await expect(
				hook.mutateAsync({ agentAddress: AGENT, agentName: "sairn" }, { registrationPublicKey: AGENT }),
			).rejects.toThrow(SESSION_CHANGED);
		});
		expect(testState.transportRequest).not.toHaveBeenCalled();
	});

	it("does not capture a lease or open the old signer after identity changes during legal preflight", async () => {
		const legal = createDeferred<unknown>();
		testState.enforceLegalActions = true;
		testState.verifyLegalActionAllowed.mockReturnValue(legal.promise);
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.verifyLegalActionAllowed).toHaveBeenCalledOnce());
		});
		if (!request) throw new Error("Agent approval did not start");

		testState.walletAddress = OTHER_OWNER;
		testState.connectedWalletAddress = OTHER_OWNER;
		testState.embeddedWalletAddress = OTHER_OWNER;
		testState.env = "Testnet";
		await renderApprovalHook();
		legal.resolve({});

		await act(async () => {
			await expect(request).rejects.toThrow(SESSION_CHANGED);
		});
		expect(testState.captureRegistrationLease).not.toHaveBeenCalled();
		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("requires a force-fresh legal check after signing before direct submission", async () => {
		const signed = createDeferred<void>();
		testState.enforceLegalActions = true;
		testState.verifyLegalActionAllowed
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new Error("Legal access changed after signing"));
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("Agent approval did not start");
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow("Legal access changed after signing");
		});
		expect(testState.verifyLegalActionAllowed).toHaveBeenCalledTimes(2);
		expect(testState.verifyLegalActionAllowed).toHaveBeenLastCalledWith(
			expect.objectContaining({ env: "Mainnet", owner: OWNER, forceFresh: true }),
		);
		expect(testState.isRegistrationLeaseCurrent).not.toHaveBeenCalled();
	});

	it("uses a guarded external-wallet signer and forwards AbortSignal to its SDK request", async () => {
		testState.walletIntent = "external";
		testState.embeddedWalletAddress = OTHER_OWNER;
		const hook = await renderApprovalHook();
		const controller = new AbortController();
		const params = { agentAddress: AGENT, agentName: "Mobile" };

		await act(async () => {
			await hook.mutateAsync(params, {
				applicationReview: "confirmed",
				signal: controller.signal,
			});
		});

		expect(testState.createExternalAgentSigner).toHaveBeenCalledWith(
			expect.objectContaining({
				expectedAddress: OWNER,
				walletClient: testState.walletClient,
				beforeSubmit: expect.any(Function),
			}),
		);
		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).toHaveBeenCalledWith(params, { signal: controller.signal });
	});

	it("signs with the external wallet on a network outside the configured chains", async () => {
		testState.walletIntent = "external";
		testState.embeddedWalletAddress = OTHER_OWNER;
		testState.connectionChainId = 999_999;
		try {
			const hook = await renderApprovalHook();
			const params = { agentAddress: AGENT, agentName: "Mobile" };

			await act(async () => {
				await hook.mutateAsync(params, { applicationReview: "confirmed" });
			});

			expect(testState.createExternalAgentSigner).toHaveBeenCalledWith(
				expect.objectContaining({ expectedAddress: OWNER, walletClient: testState.walletClient }),
			);
			expect(testState.clientApproveAgent).toHaveBeenCalledTimes(1);
			expect(testState.clientApproveAgent.mock.calls[0]?.[0]).toEqual(params);
		} finally {
			testState.connectionChainId = 42161;
		}
	});

	it("requires a force-fresh legal check after external-wallet signing", async () => {
		const signed = createDeferred<void>();
		testState.walletIntent = "external";
		testState.embeddedWalletAddress = OTHER_OWNER;
		testState.enforceLegalActions = true;
		testState.verifyLegalActionAllowed
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new Error("Legal access changed after external signing"));
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing external pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("External Agent approval did not start");
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow("Legal access changed after external signing");
		});
		expect(testState.verifyLegalActionAllowed).toHaveBeenCalledTimes(2);
		expect(testState.verifyLegalActionAllowed).toHaveBeenLastCalledWith(
			expect.objectContaining({ env: "Mainnet", owner: OWNER, forceFresh: true }),
		);
		expect(testState.isRegistrationLeaseCurrent).not.toHaveBeenCalled();
	});

	it("rechecks the exact Privy, Wagmi, owner, and environment identity after external-wallet signing", async () => {
		const signed = createDeferred<void>();
		testState.walletIntent = "external";
		testState.embeddedWalletAddress = OTHER_OWNER;
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing external pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("External Agent approval did not start");

		testState.walletAddress = OTHER_OWNER;
		testState.connectedWalletAddress = OTHER_OWNER;
		testState.walletClient = { account: { address: OTHER_OWNER } };
		testState.env = "Testnet";
		await renderApprovalHook();
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow(SESSION_CHANGED);
		});
		expect(testState.isRegistrationLeaseCurrent).not.toHaveBeenCalled();
	});

	it("rechecks the exact registration lease after external-wallet signing", async () => {
		const signed = createDeferred<void>();
		testState.walletIntent = "external";
		testState.embeddedWalletAddress = OTHER_OWNER;
		testState.isRegistrationLeaseCurrent.mockResolvedValue(false);
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing external pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("External Agent approval did not start");
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow(SESSION_CHANGED);
		});
		expect(testState.isRegistrationLeaseCurrent).toHaveBeenCalledWith(
			expect.objectContaining({ epoch: expect.objectContaining({ env: "Mainnet", owner: OWNER }) }),
		);
	});

	it("rejects without wallet access with a reason that renders in the active language", async () => {
		testState.hasWalletAccess = false;
		const hook = await renderApprovalHook();
		let rejection: unknown;

		await act(async () => {
			rejection = await hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" }).catch((error: unknown) => error);
		});

		expect(rejection).toBeInstanceOf(LocalizedActionError);
		expect(formatTransferError(rejection as Error, (descriptor) => i18n._(descriptor))).toBe(
			"Wallet connection failed. Unlock your wallet, approve the connection, then retry.",
		);
		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("does not create a signer or dispatch once the trading-connection deadline has passed", async () => {
		const hook = await renderApprovalHook();
		const deadline = {
			current: { queuedAt: Date.now() - 20_000, queuedAtMonotonic: performance.now() - 20_000, deadlineMs: 15_000 },
		};

		await expect(hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" }, { deadline })).rejects.toBeInstanceOf(
			ExchangeActionDeadlineError,
		);

		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.signTypedData).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("binds the approval client to the click deadline and reports a late signature as the deadline error", async () => {
		const hook = await renderApprovalHook();
		const deadline = {
			current: { queuedAt: Date.now(), queuedAtMonotonic: performance.now(), deadlineMs: 15_000 },
		};
		testState.clientApproveAgent.mockRejectedValueOnce(
			Object.assign(new Error("Failed to sign typed data"), {
				name: "AbstractWalletError",
				cause: new ExchangeActionDeadlineError(),
			}),
		);

		await expect(hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" }, { deadline })).rejects.toBeInstanceOf(
			ExchangeActionDeadlineError,
		);

		expect(testState.createExchangeClient).toHaveBeenCalledOnce();
		expect(testState.createExchangeClient.mock.calls[0]?.[4]).toBe(deadline);
	});

	it("does not create a signer or dispatch when already aborted", async () => {
		const hook = await renderApprovalHook();
		const controller = new AbortController();
		const params = { agentAddress: AGENT, agentName: "Mobile" };
		controller.abort();

		await expect(hook.mutateAsync(params, { signal: controller.signal })).rejects.toMatchObject({
			name: "AbortError",
		});

		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.signTypedData).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("releases the in-flight slot immediately when registration abandons a pre-submit attempt", async () => {
		const abandoned = createDeferred<{ status: string }>();
		testState.clientApproveAgent
			.mockReturnValueOnce(abandoned.promise)
			.mockResolvedValueOnce({ status: "ok", response: { type: "default" } });
		const hook = await renderApprovalHook();
		const controller = new AbortController();
		let firstRequest: Promise<unknown> | undefined;
		await act(async () => {
			firstRequest = hook.mutateAsync(
				{ agentAddress: AGENT, agentName: "sairn" },
				{ registrationPublicKey: AGENT, signal: controller.signal },
			);
			await vi.waitFor(() => expect(testState.clientApproveAgent).toHaveBeenCalledOnce());
		});
		if (!firstRequest) throw new Error("Expected abandoned approval request");
		void firstRequest.catch(() => undefined);
		expect(approval?.isPending).toBe(true);

		await act(async () => {
			controller.abort(new Error("Registration timed out before submission"));
			await Promise.resolve();
		});
		expect(approval?.isPending).toBe(false);

		await act(async () => {
			await approval?.mutateAsync({ agentAddress: AGENT, agentName: "sairn" }, { registrationPublicKey: AGENT });
		});
		expect(testState.clientApproveAgent).toHaveBeenCalledTimes(2);
	});

	it("does not create the external-wallet signer when already aborted", async () => {
		testState.walletIntent = "external";
		testState.embeddedWalletAddress = OTHER_OWNER;
		const hook = await renderApprovalHook();
		const controller = new AbortController();
		const params = { agentAddress: AGENT, agentName: "Mobile" };
		controller.abort();

		await expect(hook.mutateAsync(params, { signal: controller.signal })).rejects.toMatchObject({
			name: "AbortError",
		});

		expect(testState.createExternalAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("does not create a signer when the exact registration lease is no longer current", async () => {
		testState.startRegistrationExecution.mockResolvedValue({ status: "invalidated" });
		const hook = await renderApprovalHook();

		await act(async () => {
			await expect(hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" })).rejects.toThrow(SESSION_CHANGED);
		});

		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.signTypedData).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("rejects the start guard when identity changes after lease capture", async () => {
		const start = createDeferred<{ status: "invalidated" }>();
		let canStart: (() => boolean) | undefined;
		testState.startRegistrationExecution.mockImplementation(async (_lease: unknown, currentCanStart: () => boolean) => {
			canStart = currentCanStart;
			return start.promise;
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(canStart).toBeTypeOf("function"));
		});
		if (!request || !canStart) throw new Error("Agent approval did not reach its start guard");

		testState.walletAddress = OTHER_OWNER;
		testState.connectedWalletAddress = OTHER_OWNER;
		testState.embeddedWalletAddress = OTHER_OWNER;
		await renderApprovalHook();
		expect(canStart()).toBe(false);
		start.resolve({ status: "invalidated" });

		await act(async () => {
			await expect(request).rejects.toThrow(SESSION_CHANGED);
		});
		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("rechecks the owner and environment after signing before direct approval submission", async () => {
		const signed = createDeferred<void>();
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("Agent approval did not start");

		testState.walletAddress = OTHER_OWNER;
		testState.connectedWalletAddress = OTHER_OWNER;
		testState.embeddedWalletAddress = OTHER_OWNER;
		testState.env = "Testnet";
		await renderApprovalHook();
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow(SESSION_CHANGED);
		});
		expect(testState.isRegistrationLeaseCurrent).not.toHaveBeenCalled();
	});

	it("rechecks the exact registration lease after signing", async () => {
		const signed = createDeferred<void>();
		testState.isRegistrationLeaseCurrent.mockResolvedValue(false);
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("Agent approval did not start");
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow(SESSION_CHANGED);
		});
		expect(testState.isRegistrationLeaseCurrent).toHaveBeenCalledWith(
			expect.objectContaining({ epoch: expect.objectContaining({ env: "Mainnet", owner: OWNER }) }),
		);
	});
});
