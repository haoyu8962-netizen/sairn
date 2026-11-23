// @vitest-environment jsdom

import { useInfo } from "@sairn/hl-react/hooks/useInfo";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApiWalletController } from "@/components/api-wallet/use-api-wallet-controller";
import { createI18nRoot } from "./harness/react";

const OWNER = "0x1111111111111111111111111111111111111111";
const AGENT = "0x2222222222222222222222222222222222222222";
const PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const mocks = vi.hoisted(() => ({
	approve: vi.fn(),
	read: vi.fn(),
	owner: "0x1111111111111111111111111111111111111111",
	signer: undefined as string | undefined,
}));

vi.mock("@sairn/hl-react", () => ({ useActiveAgentOwner: () => null }));
vi.mock("@sairn/hl-react/transport-provider", () => ({
	useHyperliquidTransport: () => ({ env: "Mainnet", info: { extraAgents: mocks.read } }),
}));
vi.mock("@/lib/hyperliquid", () => ({
	useInfo,
	useHyperliquid: () => ({ env: "Mainnet" }),
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useReconnectWallet: () => ({ reconnectWallet: vi.fn() }),
	useWalletSession: () => ({
		address: mocks.owner,
		walletAddress: mocks.signer ?? mocks.owner,
		hasWalletAccess: true,
		isConnected: true,
		sessionMode: "wallet",
	}),
}));
vi.mock("@/hooks/wallet/use-explicit-agent-approval", () => ({
	useExplicitAgentApproval: () => ({ isPending: false, mutateAsync: mocks.approve }),
}));
vi.mock("@/hooks/trade/use-master-wallet-action-reason", () => ({
	useMasterWalletActionReason: () => null,
}));

let controller: ReturnType<typeof useApiWalletController> | undefined;

function Probe() {
	controller = useApiWalletController({ createCredential: () => ({ address: AGENT, privateKey: PRIVATE_KEY }) });
	return null;
}

describe("API wallet verification after a real query failure", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	beforeEach(async () => {
		vi.useFakeTimers();
		mocks.owner = OWNER;
		mocks.signer = undefined;
		mocks.read.mockReset().mockResolvedValue([]);
		mocks.approve.mockReset().mockImplementation(async () => {
			mocks.read.mockRejectedValue(new Error("simulated read failure"));
			return { status: "ok", response: { type: "default" } };
		});
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false } },
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		render();
		await act(async () => vi.advanceTimersByTimeAsync(1));
		expect(current().pageState).toBe("empty");
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		vi.useRealTimers();
	});

	function current() {
		if (!controller) throw new Error("Controller was not captured");
		return controller;
	}

	function render() {
		act(() =>
			root.render(
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>,
			),
		);
	}

	async function submitUntilUnknown() {
		act(() => current().onNameChange("grid-bot"));
		act(() => current().onGenerate());
		act(() => current().onAuthorize());
		await act(async () => {
			const submission = current().onConfirmAction();
			await vi.runAllTimersAsync();
			await submission;
		});
		expect(queryClient.getQueryCache().getAll()[0]?.state.status).toBe("error");
		expect(current().pageState).toBe("retained");
		expect(current().listState).toBe("retained");
		expect(current().canGenerate).toBe(false);
		expect(current().action).toMatchObject({ stage: "done", result: "unknown" });
		expect(current().action?.privateKey).toBeUndefined();
		expect(mocks.approve).toHaveBeenCalledOnce();
	}

	it("treats a list cached before the page mounted as a first failure", async () => {
		act(() => root.unmount());
		mocks.read.mockRejectedValue(new Error("simulated read failure"));
		root = createI18nRoot(container);
		render();
		await act(async () => {
			current().onRetry();
			await vi.runAllTimersAsync();
		});
		expect(queryClient.getQueryCache().getAll()[0]?.state.status).toBe("error");
		expect(queryClient.getQueryCache().getAll()[0]?.state.data).toEqual([]);
		expect(current().pageState).toBe("error");
		expect(current().listState).toBe("error");
	});

	it("reads again from error, reconciles the exact tuple and never signs twice", async () => {
		await submitUntilUnknown();
		const readsBefore = mocks.read.mock.calls.length;
		const params = mocks.approve.mock.calls[0]?.[0] as { agentName: string };
		mocks.read.mockResolvedValue([
			{ name: "grid-bot", address: AGENT, validUntil: Number(params.agentName.split(" ").at(-1)) },
		]);
		await act(async () => {
			const verification = current().onVerifyAgain();
			await current().onVerifyAgain();
			await vi.runAllTimersAsync();
			await verification;
		});
		expect(mocks.read).toHaveBeenCalledTimes(readsBefore + 1);
		expect(mocks.approve).toHaveBeenCalledOnce();
		expect(current().action).toMatchObject({ result: "success", privateKey: PRIVATE_KEY });
	});

	it.each(["owner change", "unmount"])("ignores a retained Verify again handler after %s", async (change) => {
		await submitUntilUnknown();
		const verify = current().onVerifyAgain;
		const readsBefore = mocks.read.mock.calls.length;
		if (change === "owner change") {
			mocks.owner = AGENT;
			render();
			await act(async () => vi.advanceTimersByTimeAsync(1));
		} else {
			act(() => root.render(null));
		}
		const readsAfterChange = mocks.read.mock.calls.length;
		await act(async () => verify());
		expect(mocks.read).toHaveBeenCalledTimes(readsAfterChange);
		expect(readsAfterChange).toBeGreaterThanOrEqual(readsBefore);
		expect(mocks.approve).toHaveBeenCalledOnce();
	});
});

describe("API wallet list presentation from a real query", () => {
	const SIGNER = "0x3333333333333333333333333333333333333333";
	const VALID_SNAPSHOT = [{ name: "grid-bot", address: AGENT, validUntil: null }];
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	beforeEach(() => {
		vi.useFakeTimers();
		mocks.owner = OWNER;
		mocks.signer = undefined;
		mocks.read.mockReset().mockResolvedValue(VALID_SNAPSHOT);
		mocks.approve.mockReset();
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false } },
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		onlineManager.setOnline(true);
		queryClient.clear();
		container.remove();
		vi.useRealTimers();
	});

	function current() {
		if (!controller) throw new Error("Controller was not captured");
		return controller;
	}

	function render() {
		act(() =>
			root.render(
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>,
			),
		);
	}

	function agentsQueryState() {
		const query = queryClient.getQueryCache().getAll()[0];
		if (!query) throw new Error("The extraAgents query was not created");
		return query.state;
	}

	it.each([
		["the master wallet", undefined, "loading"],
		["another signer", SIGNER, "nonMaster"],
	] as const)("keeps a paused offline first read blank and busy for %s", async (_label, signer, pageState) => {
		mocks.signer = signer;
		onlineManager.setOnline(false);
		render();
		await act(async () => vi.advanceTimersByTimeAsync(20_000));
		expect(agentsQueryState()).toMatchObject({ status: "pending", fetchStatus: "paused", data: undefined });
		expect(mocks.read).not.toHaveBeenCalled();
		expect(current().listState).toBe("loading");
		expect(current().pageState).toBe(pageState);
		expect(current().agents).toEqual([]);
		expect(current().canGenerate).toBe(false);
	});

	async function showValidThenMalformedRefresh() {
		render();
		await act(async () => vi.advanceTimersByTimeAsync(1));
		expect(current().listState).toBe("normal");
		mocks.read.mockResolvedValue({ unexpected: true });
		await act(async () => {
			current().onRetry();
			await vi.runAllTimersAsync();
		});
		expect(agentsQueryState()).toMatchObject({ status: "success", data: { unexpected: true } });
	}

	it("keeps the last valid list as retained when a refresh answers a malformed snapshot", async () => {
		await showValidThenMalformedRefresh();
		expect(current().pageState).toBe("retained");
		expect(current().listState).toBe("retained");
		expect(current().agents.map((agent) => agent.name)).toEqual(["grid-bot"]);
		expect(current().canGenerate).toBe(false);
		expect(current().canAuthorize).toBe(false);
		mocks.read.mockResolvedValue(VALID_SNAPSHOT);
		await act(async () => {
			current().onRetry();
			await vi.runAllTimersAsync();
		});
		expect(current().listState).toBe("normal");
		expect(current().canGenerate).toBe(true);
	});

	it("retains nothing for another account after a malformed refresh", async () => {
		await showValidThenMalformedRefresh();
		mocks.owner = AGENT;
		mocks.read.mockResolvedValue({ unexpected: true });
		render();
		await act(async () => vi.runAllTimersAsync());
		expect(current().accountAddress).toBe(AGENT);
		expect(current().listState).toBe("error");
		expect(current().agents).toEqual([]);
		mocks.owner = OWNER;
		render();
		await act(async () => vi.runAllTimersAsync());
		expect(current().accountAddress).toBe(OWNER);
		expect(current().listState).toBe("error");
		expect(current().agents).toEqual([]);
	});

	it("keeps a list cached before the mount out of a malformed refresh", async () => {
		render();
		await act(async () => vi.advanceTimersByTimeAsync(1));
		act(() => root.unmount());
		mocks.read.mockResolvedValue({ unexpected: true });
		root = createI18nRoot(container);
		render();
		await act(async () => {
			current().onRetry();
			await vi.runAllTimersAsync();
		});
		expect(current().listState).toBe("error");
		expect(current().agents).toEqual([]);
	});
});
