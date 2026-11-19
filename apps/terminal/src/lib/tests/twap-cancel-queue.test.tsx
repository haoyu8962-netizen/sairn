// @vitest-environment jsdom

import { ApiRequestError } from "@nktkas/hyperliquid";
import { useExchange } from "@sairn/hl-react/hooks/useExchange";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { useTwapCancel } from "@/hooks/trade/use-twap-cancel";
import "@/hooks/trade/use-twap-cancel";
import { createI18nRoot } from "./harness/react";

const state = vi.hoisted(() => ({
	owner: "0x1111111111111111111111111111111111111111",
	sessionMode: "wallet" as "wallet" | "agent-only",
	exchangeSession: { id: Symbol(), active: true },
	exchangeLifecycle: { id: Symbol(), active: true },
	wallet: { twapCancel: vi.fn() },
	agent: { twapCancel: vi.fn() },
	legalCheck: vi.fn(),
}));

function useMockHyperliquid() {
	return {
		clientKey: state.owner,
		env: "Mainnet",
		sessionMode: state.sessionMode,
		exchangeSession: state.exchangeSession,
		exchangeLifecycle: state.exchangeLifecycle,
		enforceLegalActions: true,
		info: { legalCheck: state.legalCheck },
	};
}

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => useMockHyperliquid(),
}));

vi.mock("@sairn/hl-react/hooks/useClients", () => ({
	useHyperliquidClients: () => ({
		trading: state.sessionMode === "wallet" ? state.wallet : state.agent,
		agentPublicKey: null,
		userWalletMismatch: false,
	}),
}));

vi.mock("../../../../../packages/hl-react/src/signing/owner-signer-provider", () => ({
	useHyperliquidOwnerSigner: () => ownerSigner,
}));

const ownerSigner = { assertCurrent() {} };

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => useMockHyperliquid(),
	useExchange,
	useMarkets: () => ({ getAssetId: () => 7 }),
}));

const success = { status: "ok", response: { type: "twapCancel", data: { status: "success" } } };
const sessionStorageKey = `hyperliquid_agent_registration_session_Mainnet_${state.owner}`;
const epoch = "11111111-1111-4111-8111-111111111111";
const replacementEpoch = "22222222-2222-4222-8222-222222222222";
const lockName = `sairn-order-asset-v1:mainnet:${state.owner}:7`;
const sessionLockName = `hyperliquid_agent_registration_session:Mainnet:${state.owner}`;
const roots: Root[] = [];
const clients: QueryClient[] = [];

function setEpoch(value: string) {
	localStorage.setItem(sessionStorageKey, JSON.stringify({ version: 1, epoch: value, state: "active" }));
}

function installLocks() {
	const tails = new Map<string, Promise<unknown>>();
	const request = vi.fn((name: string, options: LockOptions, callback: (lock: Lock) => unknown): Promise<unknown> => {
		const pending = (tails.get(name) ?? Promise.resolve()).then(() => {
			if (options.signal?.aborted) throw options.signal.reason;
			return callback({ name, mode: "exclusive" });
		});
		tails.set(
			name,
			pending.catch(() => {}),
		);
		return pending;
	});
	vi.stubGlobal("navigator", { locks: { request }, onLine: true });
	return request;
}

function setOnline(value: boolean) {
	Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

function holdAssetLock() {
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	void navigator.locks.request(lockName, {}, () => gate);
	return release;
}

async function openTab() {
	vi.resetModules();
	const { useTwapCancel: useCancel } = await import("@/hooks/trade/use-twap-cancel");
	const store = await import("@/stores/use-pending-trading-action-store");
	const queue = await import("@/stores/use-order-queue-store");
	const client = new QueryClient();
	clients.push(client);
	const root = createI18nRoot(document.createElement("div"));
	roots.push(root);
	let hook: ReturnType<typeof useTwapCancel>;
	function Probe({ revision }: { revision: number }) {
		hook = useCancel();
		return <span hidden>{revision}</span>;
	}
	function render(revision: number) {
		act(() =>
			root.render(
				<QueryClientProvider client={client}>
					<Probe revision={revision} />
				</QueryClientProvider>,
			),
		);
	}
	render(0);
	return {
		render,
		click: () => hook.cancelTwap("BTC", 42),
		feedback: () => hook.feedback,
		pending: () => store.getPendingTradingActionSnapshot().twapCancellations,
		task: (id: string) => queue.getOrderQueueItem(store.getPendingTradingActionToastId(id)),
	};
}

describe("TWAP cancellation before the SDK boundary", () => {
	beforeEach(() => {
		window.localStorage.clear();
		setEpoch(epoch);
		state.sessionMode = "wallet";
		state.exchangeSession = { id: Symbol(), active: true };
		state.wallet.twapCancel.mockReset().mockResolvedValue(success);
		state.agent.twapCancel.mockReset().mockResolvedValue(success);
		state.legalCheck.mockReset().mockResolvedValue({ acceptedTerms: true, userAllowed: true, restrictions: "n" });
	});

	afterEach(() => {
		act(() => {
			for (const root of roots.splice(0)) root.unmount();
		});
		for (const client of clients.splice(0)) client.clear();
		vi.unstubAllGlobals();
	});

	it.each(["same-owner session", "registration epoch"])(
		"discards a queued click after a change of %s",
		async (change) => {
			installLocks();
			const release = holdAssetLock();
			const tab = await openTab();
			let click: Promise<void> | undefined;
			await act(async () => {
				click = tab.click();
			});
			const [action] = tab.pending();
			expect(action).toMatchObject({ phase: "submitting", owner: state.owner });
			expect(state.wallet.twapCancel).not.toHaveBeenCalled();

			if (change === "same-owner session") {
				state.exchangeSession.active = false;
				state.exchangeSession = { id: Symbol(), active: true };
				state.sessionMode = "agent-only";
				tab.render(1);
				expect(tab.pending()).toEqual([]);
			} else {
				setEpoch(replacementEpoch);
			}
			await act(async () => {
				release();
				await click;
			});
			expect(state.agent.twapCancel).not.toHaveBeenCalled();
			expect(state.wallet.twapCancel).not.toHaveBeenCalled();
			expect(tab.pending()).toEqual([]);
			expect(tab.task(action.id)).toMatchObject({ status: "failed", error: { code: "twap-cancel-identity-changed" } });
		},
	);

	it("rejects an offline click without waiting or sending on reconnect", async () => {
		const requestLock = installLocks();
		const release = holdAssetLock();
		const tab = await openTab();
		setOnline(false);
		let click: Promise<void> | undefined;
		let settled = false;
		await act(async () => {
			click = tab.click().then(() => {
				settled = true;
			});
		});
		const offline = {
			settled,
			requests: requestLock.mock.calls.length,
			pending: tab.pending(),
			feedback: tab.feedback(),
		};

		await act(async () => {
			setOnline(true);
			release();
			await click;
		});
		expect(state.wallet.twapCancel).not.toHaveBeenCalled();
		expect(offline).toEqual({
			settled: true,
			requests: 1,
			pending: [],
			feedback: { tone: "error", message: "Request not submitted" },
		});
	});

	it.each(["no registration session", "an ended session lease"])(
		"does not queue a click made with %s",
		async (cause) => {
			installLocks();
			const tab = await openTab();
			if (cause === "no registration session") localStorage.removeItem(sessionStorageKey);
			else state.exchangeSession.active = false;
			await act(async () => {
				await tab.click();
			});
			expect(state.wallet.twapCancel).not.toHaveBeenCalled();
			expect(tab.pending()).toEqual([]);
			expect(tab.feedback()).toEqual({ tone: "error", message: "Request not submitted" });
		},
	);

	it.each([
		{ heldMs: 16_000, calls: 0 },
		{ heldMs: 14_000, calls: 1 },
	])("bounds the wait after the asset lock at 15 seconds (signing lock held $heldMs ms)", async ({ heldMs, calls }) => {
		vi.useFakeTimers();
		try {
			installLocks();
			let releaseSessionLock = () => {};
			const sessionLockHeld = new Promise<void>((resolve) => {
				releaseSessionLock = resolve;
			});
			void navigator.locks.request(sessionLockName, {}, () => sessionLockHeld);
			const tab = await openTab();
			let click: Promise<void> | undefined;
			await act(async () => {
				click = tab.click();
			});
			const [action] = tab.pending();
			expect(action).toMatchObject({ phase: "submitting" });

			await act(async () => {
				await vi.advanceTimersByTimeAsync(heldMs);
			});
			await act(async () => {
				releaseSessionLock();
				await vi.advanceTimersByTimeAsync(0);
				await click;
			});

			expect(state.wallet.twapCancel).toHaveBeenCalledTimes(calls);
			if (calls === 0) {
				expect(tab.pending()).toEqual([]);
				expect(tab.task(action.id)).toMatchObject({ status: "failed" });
				expect(tab.feedback()).toEqual({
					tone: "error",
					message: "The checks before this request took too long. Nothing was signed or sent. Try again.",
				});
			} else {
				expect(tab.pending()[0]).toMatchObject({ phase: "awaiting", accepted: true });
			}
		} finally {
			vi.useRealTimers();
		}
	});

	it("leaves a second tab's duplicate termination to the exchange and reports its answer", async () => {
		const alreadyCancelled = {
			status: "ok",
			response: {
				type: "twapCancel",
				data: { status: { error: "TWAP was never placed, already canceled, or filled." } },
			},
		};
		state.wallet.twapCancel
			.mockResolvedValueOnce(success)
			.mockRejectedValueOnce(new ApiRequestError(alreadyCancelled, alreadyCancelled.response.data.status.error));
		installLocks();
		const release = holdAssetLock();
		const first = await openTab();
		const second = await openTab();
		let clicks: Promise<void>[] = [];
		await act(async () => {
			clicks = [first.click(), second.click()];
		});
		const [secondAction] = second.pending();

		await act(async () => {
			release();
			await Promise.all(clicks);
		});
		expect(state.wallet.twapCancel).toHaveBeenCalledTimes(2);
		expect(first.pending()[0]).toMatchObject({ phase: "awaiting", accepted: true });
		expect(second.pending()).toEqual([]);
		expect(second.task(secondAction.id)).toMatchObject({
			status: "failed",
			error: { kind: "exchange-error", entries: [{ text: "TWAP was never placed, already canceled, or filled." }] },
		});
	});
});
