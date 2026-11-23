// @vitest-environment jsdom

import type { ExchangeClient, IRequestTransport } from "@nktkas/hyperliquid";
import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import { createExchangeClient } from "@sairn/hl-react/clients";
import { useExchange } from "@sairn/hl-react/hooks/useExchange";
import {
	ExchangeRequestInvalidatedError,
	invalidateAllExchangeRequestIdentities,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { HyperliquidProvider } from "@sairn/hl-react/provider";
import { captureAgentRegistrationExecutionLease } from "@sairn/hl-react/signing/agent-registration-session";
import { useBuilderFeeApproval } from "@sairn/hl-react/signing/use-builder-fee-approval";
import { useTradingAuthorization } from "@sairn/hl-react/signing/use-trading-authorization";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isExchangeRequestNotSentError } from "@/lib/errors/action-error";
import { createPrivyOwnerSigner } from "@/lib/wallet/privy-owner-signer";
import { createOwnerSignerClient } from "../../../../../packages/hl-react/src/signing/owner-signer-client";
import {
	type HyperliquidOwnerSigner,
	HyperliquidOwnerSignerProvider,
	useHyperliquidOwnerSigner,
} from "../../../../../packages/hl-react/src/signing/owner-signer-provider";

const ACCOUNT_A = privateKeyToAccount(`0x${"0".repeat(63)}a`);
const ACCOUNT_B = privateKeyToAccount(`0x${"0".repeat(63)}b`);
const OWNER_A = ACCOUNT_A.address;
const OWNER_B = ACCOUNT_B.address;
const BUILDER = "0x2222222222222222222222222222222222222222";
const DESTINATION = "0x3333333333333333333333333333333333333333";
const SEND = { destination: DESTINATION, amount: "1" };
const OK_RESPONSE = { status: "ok", response: { type: "default" } };

const state = vi.hoisted(() => ({
	useClients: null as null | (() => unknown),
	refetchBuilderFee: null as null | (() => Promise<unknown>),
	refetchRequirements: null as null | (() => Promise<unknown>),
	realTradingStatus: false,
	agentBuilderFee: null as null | (() => Promise<unknown>),
}));

vi.mock("@sairn/hl-react/clients", async (importOriginal) => ({
	...(await importOriginal<typeof import("@sairn/hl-react/clients")>()),
	createWsReconnectTrigger: () => () => {},
	getSubscriptionClient: () => ({}),
	getWsTransport: () => ({}),
	initializeClients: () => {},
	subscribeWsDisconnect: () => () => {},
}));
vi.mock("@sairn/hl-react/internal/websocket/chaos", () => ({ registerChaosHarness: vi.fn() }));
vi.mock("@sairn/hl-react/internal/websocket/debug", () => ({
	registerDebugSnapshot: vi.fn(),
	setDebugStore: vi.fn(),
}));
vi.mock("@sairn/hl-react/create-config", () => ({
	createHyperliquidConfig: () => ({ httpTransport: {}, wsTransport: {}, ssr: false }),
}));
vi.mock("@sairn/hl-react/store", async () => {
	const { createStore } = await vi.importActual<typeof import("zustand")>("zustand");
	return { createHyperliquidStore: () => createStore(() => ({ config: {} })) };
});
vi.mock("../../../../../packages/hl-react/src/internal/exchange/server-clock", async (importOriginal) => ({
	...(await importOriginal<object>()),
	createServerClock: () => ({
		sync: async () => {},
		getExpiresAfter: async () => Date.now() + 15_000,
		estimateNow: () => undefined,
	}),
}));
vi.mock("@sairn/hl-react/hooks/useClients", () => ({
	useHyperliquidClients: () => state.useClients?.(),
}));
vi.mock("../../../../../packages/hl-react/src/signing/use-trading-status", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../../../../packages/hl-react/src/signing/use-trading-status")>();
	const stub = {
		refetch: () => state.refetchRequirements?.(),
		refetchBuilderFee: () => state.refetchBuilderFee?.(),
		refetchSigner: () => state.refetchRequirements?.(),
		signerAddress: null,
		signerMode: "owner",
	};
	return {
		useTradingStatus() {
			const real = actual.useTradingStatus();
			return state.realTradingStatus ? real : stub;
		},
	};
});
vi.mock("../../../../../packages/hl-react/src/signing/use-agent-status", () => {
	const requirements = {
		isAgentReady: false,
		isBuilderFeeReady: false,
		isReady: false,
		needsAgent: false,
		needsBuilderFee: true,
		signaturesRequired: 1,
	};
	const refetchBuilderFee = () => state.agentBuilderFee?.() ?? Promise.resolve(requirements);
	return {
		useAgentStatus: () => ({
			...requirements,
			agentAddress: null,
			isAgentLoading: false,
			isBuilderFeeLoading: false,
			refetch: refetchBuilderFee,
			refetchAgent: refetchBuilderFee,
			refetchBuilderFee,
		}),
	};
});
vi.mock("../../../../../packages/hl-react/src/signing/use-agent-registration", () => ({
	useAgentRegistration: () => ({ error: null, register: vi.fn(), status: "idle" }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

interface Gate {
	reached: Promise<void>;
	release: () => void;
	wait: () => Promise<void>;
}

function gate(): Gate {
	let release: () => void = () => {};
	let markReached: () => void = () => {};
	const reached = new Promise<void>((resolve) => {
		markReached = resolve;
	});
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		reached,
		release,
		wait: async () => {
			markReached();
			await released;
		},
	};
}

function spiedTransport(onExchange?: () => Promise<void> | void) {
	const request = vi.fn(async (endpoint: string) => {
		if (endpoint === "exchange") await onExchange?.();
		return OK_RESPONSE;
	});
	return { request, transport: { isTestnet: false, request } as unknown as IRequestTransport };
}

function externalWallet(account: typeof ACCOUNT_A, holdSignature?: Gate): AbstractViemJsonRpcAccount {
	return {
		async signTypedData(params) {
			const signature = await account.signTypedData(params as Parameters<typeof account.signTypedData>[0]);
			await holdSignature?.wait();
			return signature;
		},
		getAddresses: async () => [account.address],
		getChainId: async () => 42_161,
	};
}

function externalClients(client: ExchangeClient) {
	return () => ({
		agentPublicKey: null,
		info: {},
		subscription: {},
		trading: null,
		user: client,
		userWalletMismatch: false,
	});
}

function ownerSignerClients(transport: IRequestTransport) {
	const clients = new WeakMap<HyperliquidOwnerSigner, ExchangeClient | null>();
	return () => {
		const owner = useHyperliquidOwnerSigner();
		let client: ExchangeClient | null = null;
		if (owner?.ownerAddress) {
			if (!clients.has(owner)) clients.set(owner, createOwnerSignerClient(owner, false, transport));
			client = clients.get(owner) ?? null;
		}
		return {
			agentPublicKey: null,
			info: {},
			subscription: {},
			trading: client,
			user: client,
			userWalletMismatch: false,
		};
	};
}

/** The email owner the app supplies: its silent signer checks the session around the signature. */
function emailOwner(currentToken: { value: number }, token: number, holdSignature?: Gate): HyperliquidOwnerSigner {
	function assertCurrent() {
		if (currentToken.value !== token) throw new Error("The embedded owner signing session is no longer available.");
	}
	return {
		ownerAddress: OWNER_A,
		wallet: createPrivyOwnerSigner({
			ownerAddress: OWNER_A,
			chainId: 42_161,
			signTypedData: async (typedData) => {
				const signature = await ACCOUNT_A.signTypedData(typedData as Parameters<typeof ACCOUNT_A.signTypedData>[0]);
				await holdSignature?.wait();
				return { signature };
			},
			assertCurrent,
		}),
		assertCurrent,
	};
}

describe("exchange retirement under the real provider tree (ADR 0058)", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let send: { mutateAsync: (params: never) => Promise<unknown> } | null;
	let builderFee: ReturnType<typeof useBuilderFeeApproval> | null;
	let authorization: ReturnType<typeof useTradingAuthorization> | null;

	function SendProbe() {
		send = useExchange("usdSend");
		return null;
	}

	function BuilderFeeProbe() {
		builderFee = useBuilderFeeApproval();
		return null;
	}

	function AuthorizationProbe() {
		authorization = useTradingAuthorization();
		return null;
	}

	function render(address: `0x${string}` | undefined, owner: HyperliquidOwnerSigner | null, probe = SendProbe) {
		const Probe = probe;
		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<HyperliquidProvider
						env="Mainnet"
						userAddress={address}
						allowAgentOnlySession={false}
						builderConfig={{ b: BUILDER, f: 10 }}
					>
						<HyperliquidOwnerSignerProvider value={owner}>
							<Probe />
						</HyperliquidOwnerSignerProvider>
					</HyperliquidProvider>
				</QueryClientProvider>,
			);
		});
	}

	async function waitForRegistrationSession(owner: `0x${string}`) {
		await act(async () => {
			await vi.waitFor(() => expect(captureAgentRegistrationExecutionLease("Mainnet", owner)).not.toBeNull());
		});
	}

	beforeAll(() => {
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: {
				request(name: string, options: unknown, maybeCallback?: (lock: Lock | null) => unknown) {
					const callback = (typeof options === "function" ? options : maybeCallback) as (lock: Lock | null) => unknown;
					return Promise.resolve(callback({ name, mode: "exclusive" } as Lock));
				},
			},
		});
	});

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
		send = null;
		builderFee = null;
		authorization = null;
		state.useClients = null;
		state.refetchBuilderFee = null;
		state.refetchRequirements = null;
		state.realTradingStatus = false;
		state.agentBuilderFee = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		queryClient.clear();
		invalidateAllExchangeRequestIdentities();
		window.sessionStorage.clear();
		window.localStorage.clear();
	});

	async function startSend(holdSignature: Gate) {
		if (!send) throw new Error("Missing usdSend mutation");
		const pending = send.mutateAsync(SEND as never);
		const outcome = pending.then(
			() => ({ sent: true as const }),
			(error: unknown) => ({ sent: false as const, error }),
		);
		await holdSignature.reached;
		return { outcome };
	}

	it("sends an external owner's signature while the session is only unresolved", async () => {
		const holdSignature = gate();
		const { request, transport } = spiedTransport();
		state.useClients = externalClients(
			createExchangeClient(externalWallet(ACCOUNT_A, holdSignature), false, undefined, transport),
		);
		render(OWNER_A, null);
		await waitForRegistrationSession(OWNER_A);

		const { outcome } = await startSend(holdSignature);
		render(undefined, null);
		holdSignature.release();

		await expect(outcome).resolves.toEqual({ sent: true });
		expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(1);
	});

	it("sends it when the session comes back as the same owner", async () => {
		const holdSignature = gate();
		const { request, transport } = spiedTransport();
		state.useClients = externalClients(
			createExchangeClient(externalWallet(ACCOUNT_A, holdSignature), false, undefined, transport),
		);
		render(OWNER_A, null);
		await waitForRegistrationSession(OWNER_A);

		const { outcome } = await startSend(holdSignature);
		render(undefined, null);
		render(OWNER_A, null);
		holdSignature.release();

		await expect(outcome).resolves.toEqual({ sent: true });
		expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(1);
	});

	it("drops it as not sent when the unresolved session settles on another owner", async () => {
		const holdSignature = gate();
		const { request, transport } = spiedTransport();
		state.useClients = externalClients(
			createExchangeClient(externalWallet(ACCOUNT_A, holdSignature), false, undefined, transport),
		);
		render(OWNER_A, null);
		await waitForRegistrationSession(OWNER_A);

		const { outcome } = await startSend(holdSignature);
		render(undefined, null);
		render(OWNER_B, null);
		holdSignature.release();

		const result = await outcome;
		expect(result.sent).toBe(false);
		const error = result.sent ? undefined : result.error;
		expect(error).toBeInstanceOf(ExchangeRequestInvalidatedError);
		expect((error as ExchangeRequestInvalidatedError).phase).toBe("after-signature");
		expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(0);
	});

	it("reports an email signature dropped after a binding change as not sent", async () => {
		const holdSignature = gate();
		const currentToken = { value: 1 };
		const { request, transport } = spiedTransport();
		state.useClients = ownerSignerClients(transport);
		render(OWNER_A, emailOwner(currentToken, 1, holdSignature));
		await waitForRegistrationSession(OWNER_A);

		const { outcome } = await startSend(holdSignature);
		currentToken.value = 2;
		render(OWNER_A, emailOwner(currentToken, 2));
		holdSignature.release();

		const result = await outcome;
		expect(result.sent).toBe(false);
		const error = result.sent ? undefined : result.error;
		expect(isExchangeRequestNotSentError(error)).toBe(true);
		expect((error as ExchangeRequestInvalidatedError).phase).toBe("after-signature");
		expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(0);
	});

	it("retires owner-signed requests when the owner binding changes within the same session", async () => {
		const holdSignature = gate();
		const currentToken = { value: 1 };
		const { request, transport } = spiedTransport();
		state.useClients = externalClients(
			createExchangeClient(externalWallet(ACCOUNT_A, holdSignature), false, undefined, transport),
		);
		render(OWNER_A, emailOwner(currentToken, 1));
		await waitForRegistrationSession(OWNER_A);

		const { outcome } = await startSend(holdSignature);
		render(OWNER_A, emailOwner(currentToken, 1));
		holdSignature.release();

		const result = await outcome;
		expect(result.sent).toBe(false);
		const error = result.sent ? undefined : result.error;
		expect((error as ExchangeRequestInvalidatedError).phase).toBe("after-signature");
		expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(0);
	});

	it("retires owner-signed requests when an owner binding loses its wallet within the same session", async () => {
		const holdSignature = gate();
		const currentToken = { value: 1 };
		const { request, transport } = spiedTransport();
		state.useClients = externalClients(
			createExchangeClient(externalWallet(ACCOUNT_A, holdSignature), false, undefined, transport),
		);
		render(OWNER_A, emailOwner(currentToken, 1));
		await waitForRegistrationSession(OWNER_A);

		const { outcome } = await startSend(holdSignature);
		render(OWNER_A, { ownerAddress: OWNER_A, wallet: null, assertCurrent: () => {} });
		holdSignature.release();

		const result = await outcome;
		expect(result.sent).toBe(false);
		const error = result.sent ? undefined : result.error;
		expect((error as ExchangeRequestInvalidatedError).phase).toBe("after-signature");
		expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(0);
	});

	it("leaves the retirement to the session provider when the binding changes with the identity", async () => {
		const holdSignature = gate();
		const currentToken = { value: 1 };
		const { request, transport } = spiedTransport();
		state.useClients = externalClients(
			createExchangeClient(externalWallet(ACCOUNT_A, holdSignature), false, undefined, transport),
		);
		render(OWNER_A, emailOwner(currentToken, 1));
		await waitForRegistrationSession(OWNER_A);

		const { outcome } = await startSend(holdSignature);
		render(undefined, emailOwner(currentToken, 1));
		render(OWNER_A, emailOwner(currentToken, 1));
		holdSignature.release();

		await expect(outcome).resolves.toEqual({ sent: true });
		expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(1);
	});

	it("keeps an external signature when an owner binding appears for the same session", async () => {
		const holdSignature = gate();
		const currentToken = { value: 1 };
		const { request, transport } = spiedTransport();
		state.useClients = externalClients(
			createExchangeClient(externalWallet(ACCOUNT_A, holdSignature), false, undefined, transport),
		);
		render(OWNER_A, null);
		await waitForRegistrationSession(OWNER_A);

		const { outcome } = await startSend(holdSignature);
		render(OWNER_A, emailOwner(currentToken, 1));
		holdSignature.release();

		await expect(outcome).resolves.toEqual({ sent: true });
		expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(1);
	});

	it("keeps an external signature when a binding without an owner wallet flickers in and out", async () => {
		const holdSignature = gate();
		const { request, transport } = spiedTransport();
		state.useClients = externalClients(
			createExchangeClient(externalWallet(ACCOUNT_A, holdSignature), false, undefined, transport),
		);
		render(OWNER_A, null);
		await waitForRegistrationSession(OWNER_A);

		const { outcome } = await startSend(holdSignature);
		render(OWNER_A, { ownerAddress: OWNER_B, wallet: null, assertCurrent: () => {} });
		render(OWNER_A, null);
		holdSignature.release();

		await expect(outcome).resolves.toEqual({ sent: true });
		expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(1);
	});

	it("keeps an email signer failure as it is while the owner binding is still current", async () => {
		const { request, transport } = spiedTransport();
		state.useClients = ownerSignerClients(transport);
		const owner = emailOwner({ value: 1 }, 1);
		const failingWallet: AbstractViemJsonRpcAccount = {
			...(owner.wallet as AbstractViemJsonRpcAccount),
			signTypedData: async () => {
				throw new Error("Embedded wallet signing failed");
			},
		};
		render(OWNER_A, { ...owner, wallet: failingWallet });
		await waitForRegistrationSession(OWNER_A);

		if (!send) throw new Error("Missing usdSend mutation");
		const error = await send.mutateAsync(SEND as never).then(
			() => undefined,
			(caught: unknown) => caught,
		);
		expect(isExchangeRequestNotSentError(error)).toBe(false);
		expect(error).toMatchObject({ cause: { message: "Embedded wallet signing failed" } });
		expect(request).not.toHaveBeenCalled();
	});

	it("reports a request stopped by the owner's own session before it started as not sent", async () => {
		const currentToken = { value: 1 };
		const { request, transport } = spiedTransport();
		state.useClients = ownerSignerClients(transport);
		render(OWNER_A, emailOwner(currentToken, 1));
		await waitForRegistrationSession(OWNER_A);
		currentToken.value = 2;

		if (!send) throw new Error("Missing usdSend mutation");
		const error = await send.mutateAsync(SEND as never).then(
			() => undefined,
			(caught: unknown) => caught,
		);
		expect(isExchangeRequestNotSentError(error)).toBe(true);
		expect((error as ExchangeRequestInvalidatedError).phase).toBe("before-start");
		expect(request).not.toHaveBeenCalled();
	});

	describe("builder fee approval that reached the exchange", () => {
		function builderFeeRequirements() {
			let calls = 0;
			return async () => {
				calls += 1;
				return { needsBuilderFee: calls === 1 };
			};
		}

		function startApproval(): { rejection: Promise<unknown> } {
			const approve = builderFee?.approve;
			if (!approve) throw new Error("Missing builder fee approval");
			let rejection: Promise<unknown> = Promise.resolve(undefined);
			act(() => {
				rejection = approve().then(
					() => undefined,
					(error: unknown) => error,
				);
			});
			return { rejection };
		}

		async function settled(promise: Promise<unknown>): Promise<unknown> {
			let value: unknown;
			await act(async () => {
				value = await promise;
			});
			return value;
		}

		it("is not reported as not sent when the owner's own session ended after the approval", async () => {
			const currentToken = { value: 1 };
			const { request, transport } = spiedTransport(() => {
				currentToken.value = 2;
			});
			state.useClients = ownerSignerClients(transport);
			state.refetchBuilderFee = builderFeeRequirements();
			render(OWNER_A, emailOwner(currentToken, 1), BuilderFeeProbe);
			await waitForRegistrationSession(OWNER_A);

			const rejection = await settled(startApproval().rejection);

			expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(1);
			expect(rejection).toMatchObject({ message: "The embedded owner signing session is no longer available." });
			expect(isExchangeRequestNotSentError(rejection)).toBe(false);
		});

		it("is not reported as not sent when the owner binding changed after the approval", async () => {
			const currentToken = { value: 1 };
			const holdResponse = gate();
			const { request, transport } = spiedTransport(() => holdResponse.wait());
			state.useClients = ownerSignerClients(transport);
			state.refetchBuilderFee = builderFeeRequirements();
			render(OWNER_A, emailOwner(currentToken, 1), BuilderFeeProbe);
			await waitForRegistrationSession(OWNER_A);

			const approval = startApproval();
			await settled(holdResponse.reached);
			render(OWNER_A, emailOwner(currentToken, 1), BuilderFeeProbe);
			holdResponse.release();

			const rejection = await settled(approval.rejection);
			expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(1);
			expect(rejection).toMatchObject({ message: "Wallet changed during builder fee approval" });
			expect(isExchangeRequestNotSentError(rejection)).toBe(false);
		});

		it("keeps a trading authorization whose approval was sent out of the not-sent errors", async () => {
			const currentToken = { value: 1 };
			const holdConfirmation = gate();
			const { request, transport } = spiedTransport();
			state.useClients = ownerSignerClients(transport);
			state.refetchBuilderFee = builderFeeRequirements();
			let requirementCalls = 0;
			state.refetchRequirements = async () => {
				requirementCalls += 1;
				if (requirementCalls === 1) return { needsAgent: false, needsBuilderFee: true };
				await holdConfirmation.wait();
				return { isSignerReady: true, isBuilderFeeReady: true };
			};
			render(OWNER_A, emailOwner(currentToken, 1), AuthorizationProbe);
			await waitForRegistrationSession(OWNER_A);

			const authorize = authorization?.authorize;
			if (!authorize) throw new Error("Missing trading authorization");
			let rejection: Promise<unknown> = Promise.resolve(undefined);
			act(() => {
				rejection = authorize().then(
					() => undefined,
					(error: unknown) => error,
				);
			});
			await settled(holdConfirmation.reached);
			render(OWNER_A, emailOwner(currentToken, 1), AuthorizationProbe);
			holdConfirmation.release();

			const error = await settled(rejection);
			expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(1);
			expect(error).toMatchObject({ message: "The wallet or network changed during trading authorization" });
			expect(isExchangeRequestNotSentError(error)).toBe(false);
		});

		function heldConfirmation(checksBeforeApproval: number, heldCall: number, holdConfirmation: Gate) {
			let calls = 0;
			return async () => {
				calls += 1;
				const call = calls;
				if (call === heldCall) await holdConfirmation.wait();
				const needsBuilderFee = call <= checksBeforeApproval;
				return {
					isAgentReady: false,
					isBuilderFeeReady: !needsBuilderFee,
					isReady: false,
					needsAgent: false,
					needsBuilderFee,
					signaturesRequired: Number(needsBuilderFee),
				};
			};
		}

		it("is not reported as not sent when the binding changed during the real confirmation query", async () => {
			const currentToken = { value: 1 };
			const holdConfirmation = gate();
			const { request, transport } = spiedTransport();
			state.useClients = ownerSignerClients(transport);
			state.realTradingStatus = true;
			state.agentBuilderFee = heldConfirmation(1, 2, holdConfirmation);
			render(OWNER_A, emailOwner(currentToken, 1), BuilderFeeProbe);
			await waitForRegistrationSession(OWNER_A);

			const approval = startApproval();
			await settled(holdConfirmation.reached);
			render(OWNER_A, emailOwner(currentToken, 1), BuilderFeeProbe);
			holdConfirmation.release();

			const rejection = await settled(approval.rejection);
			expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(1);
			expect(rejection).toMatchObject({ message: "Wallet changed during builder fee approval" });
			expect((rejection as Error).cause).toBeInstanceOf(ExchangeRequestInvalidatedError);
			expect(isExchangeRequestNotSentError(rejection)).toBe(false);
		});

		it("keeps a trading authorization out of the not-sent errors when the real final check sees a new binding", async () => {
			const currentToken = { value: 1 };
			const holdConfirmation = gate();
			const { request, transport } = spiedTransport();
			state.useClients = ownerSignerClients(transport);
			state.realTradingStatus = true;
			state.agentBuilderFee = heldConfirmation(2, 4, holdConfirmation);
			render(OWNER_A, emailOwner(currentToken, 1), AuthorizationProbe);
			await waitForRegistrationSession(OWNER_A);

			const authorize = authorization?.authorize;
			if (!authorize) throw new Error("Missing trading authorization");
			let rejection: Promise<unknown> = Promise.resolve(undefined);
			act(() => {
				rejection = authorize().then(
					() => undefined,
					(error: unknown) => error,
				);
			});
			await settled(holdConfirmation.reached);
			render(OWNER_A, emailOwner(currentToken, 1), AuthorizationProbe);
			holdConfirmation.release();

			const error = await settled(rejection);
			expect(request.mock.calls.filter(([endpoint]) => endpoint === "exchange")).toHaveLength(1);
			expect(error).toMatchObject({ message: "The wallet or network changed during trading authorization" });
			expect((error as Error).cause).toBeInstanceOf(ExchangeRequestInvalidatedError);
			expect(isExchangeRequestNotSentError(error)).toBe(false);
		});
	});
});
