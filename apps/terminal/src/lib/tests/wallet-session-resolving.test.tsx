// @vitest-environment jsdom

import { resolveSession } from "@sairn/hl-react/signing/agent-session";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFundsSessionHold } from "@/hooks/trade/use-funds-session-hold";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { WALLET_SESSION_RESOLVING_MAX_MS } from "@/lib/wallet/session-resolving-clock";
import {
	OTHER_OWNER,
	resetWalletSessionStage,
	SESSION_OWNER,
	setWalletSessionStage,
	type WalletSessionStage,
} from "./harness/wallet-session-stage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@privy-io/react-auth", async () => (await import("./harness/wallet-session-stage")).privyMock);
vi.mock("wagmi", async () => (await import("./harness/wallet-session-stage")).wagmiMock);
vi.mock("@privy-io/wagmi", async () => (await import("./harness/wallet-session-stage")).privyWagmiMock);
vi.mock("@/lib/hyperliquid", async () => (await import("./harness/wallet-session-stage")).hyperliquidSessionMock);

function Probe() {
	const { address, connectedWalletAddress, hasWalletAccess, isConnected, isResolving, sessionMode } =
		useWalletSession();
	const fundsHeld = useFundsSessionHold();
	return (
		<output
			data-address={address ?? ""}
			data-connected={String(isConnected)}
			data-connected-wallet={connectedWalletAddress ?? ""}
			data-funds-held={String(fundsHeld)}
			data-resolving={String(isResolving)}
			data-session-mode={sessionMode}
			data-wallet-access={String(hasWalletAccess)}
		/>
	);
}

describe("useWalletSession().isResolving", () => {
	let container: HTMLDivElement;
	let root: Root;

	function show(stage: WalletSessionStage) {
		act(() => setWalletSessionStage(stage));
	}

	function read() {
		const output = container.querySelector("output");
		if (!output) throw new Error("probe not rendered");
		return {
			connected: output.dataset.connected === "true",
			resolving: output.dataset.resolving === "true",
			walletAccess: output.dataset.walletAccess === "true",
			sessionMode: output.dataset.sessionMode,
		};
	}

	function readAddress() {
		return container.querySelector("output")?.dataset.address || undefined;
	}

	beforeEach(() => {
		vi.useFakeTimers();
		window.sessionStorage.clear();
		resetWalletSessionStage("connected");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it("is false for an established wallet session", () => {
		expect(read()).toEqual({ connected: true, resolving: false, walletAccess: true, sessionMode: "wallet" });
	});

	it.each([
		"authentication-initialising",
		"directory-initialising",
		"connecting",
		"reconnecting",
		"activating",
	] as const)("is true while the session is %s, without exposing a connection", (stage) => {
		show(stage);
		expect(read()).toEqual({ connected: false, resolving: true, walletAccess: false, sessionMode: "disconnected" });
	});

	describe("in a browser that never signed in", () => {
		beforeEach(() => {
			act(() => root.unmount());
			resetWalletSessionStage("authentication-initialising-first-visit");
			root = createRoot(container);
			act(() => root.render(<Probe />));
		});

		it("is false while Privy initialises, like the header's Connect button", () => {
			expect(read()).toEqual({ connected: false, resolving: false, walletAccess: false, sessionMode: "disconnected" });

			act(() => vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS * 2));
			show("signed-out");
			expect(read().resolving).toBe(false);
		});

		it("still waits for the session once the visitor signs in", () => {
			act(() => vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS * 2));
			show("directory-initialising");
			expect(read().resolving).toBe(true);

			show("connected");
			expect(read()).toEqual({ connected: true, resolving: false, walletAccess: true, sessionMode: "wallet" });
		});
	});

	it("is false for a signed-out visitor as soon as Privy is ready", () => {
		show("signed-out");
		expect(read()).toEqual({ connected: false, resolving: false, walletAccess: false, sessionMode: "disconnected" });
	});

	it("is false when the expected wallet is missing from the directory and nothing is connecting", () => {
		show("wallet-missing");
		expect(read()).toEqual({ connected: false, resolving: false, walletAccess: false, sessionMode: "disconnected" });
	});

	it.each(["agent-only", "agent-only-over-wallet"] as const)(
		"is false for an Agent-only session, whatever Privy is doing behind it (%s)",
		(stage) => {
			show(stage);
			expect(read()).toEqual({ connected: true, resolving: false, walletAccess: false, sessionMode: "agent-only" });
		},
	);

	it("does not let an Agent-only caller, which cannot see the wallet session, close the wait", () => {
		show("activating");
		act(() => vi.advanceTimersByTime(5_000));
		show("agent-only-over-wallet");
		act(() => vi.advanceTimersByTime(3_000));

		show("activating");
		expect(read().resolving).toBe(true);
		act(() => vi.advanceTimersByTime(2_000));
		expect(read().resolving).toBe(false);
	});

	it.each([
		"authentication-initialising",
		"directory-initialising",
		"connecting",
		"reconnecting",
		"activating",
	] as const)("stops waiting once the session has been %s for the maximum time", (stage) => {
		show(stage);
		act(() => vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS - 1));
		expect(read().resolving).toBe(true);

		act(() => vi.advanceTimersByTime(1));
		expect(read()).toEqual({ connected: false, resolving: false, walletAccess: false, sessionMode: "disconnected" });

		act(() => vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS * 6));
		expect(read().resolving).toBe(false);
	});

	it("counts the maximum time across the stages of one unsettled episode", () => {
		show("authentication-initialising");
		act(() => vi.advanceTimersByTime(4_000));
		show("directory-initialising");
		act(() => vi.advanceTimersByTime(4_000));
		show("reconnecting");
		act(() => vi.advanceTimersByTime(1_999));
		expect(read().resolving).toBe(true);

		act(() => vi.advanceTimersByTime(1));
		expect(read().resolving).toBe(false);
	});

	it("gives every caller the same deadline, however late it mounted", () => {
		show("activating");
		act(() => vi.advanceTimersByTime(9_000));
		const lateContainer = document.createElement("div");
		const lateRoot = createRoot(lateContainer);
		act(() => lateRoot.render(<Probe />));
		expect(lateContainer.querySelector("output")?.dataset.resolving).toBe("true");

		act(() => vi.advanceTimersByTime(1_000));
		expect(read().resolving).toBe(false);
		expect(lateContainer.querySelector("output")?.dataset.resolving).toBe("false");
		act(() => lateRoot.unmount());
	});

	it("does not start a new wait when a failing wallet is marked connected for an instant", () => {
		show("activating");
		act(() => vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS));
		expect(read().resolving).toBe(false);

		show("connected");
		act(() => vi.advanceTimersByTime(50));
		show("reconnecting");
		expect(read().resolving).toBe(false);
		show("activating");
		expect(read().resolving).toBe(false);
	});

	it("starts a new wait for a reconnect of a session that had settled", () => {
		show("activating");
		act(() => vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS));
		show("connected");
		act(() => vi.advanceTimersByTime(2_000));

		show("reconnecting");
		expect(read().resolving).toBe(true);
	});

	it("reports an account switched in the wallet at once, not as resolving", () => {
		show("connected-other-account");
		expect(read()).toEqual({ connected: false, resolving: false, walletAccess: false, sessionMode: "disconnected" });
	});

	it("reports a real owner change as a session, not as resolving", () => {
		show("connected-other-owner");
		expect(read()).toEqual({ connected: true, resolving: false, walletAccess: true, sessionMode: "wallet" });
	});

	describe("what it lets funds dialogs hold", () => {
		function held() {
			return container.querySelector("output")?.dataset.fundsHeld === "true";
		}

		function connectedWallet() {
			return container.querySelector("output")?.dataset.connectedWallet || undefined;
		}

		it("does not hold a signed-in session whose wallet left the directory and is not resolving (E2)", () => {
			show("wallet-missing");
			expect(connectedWallet()).toBeUndefined();
			expect(read().resolving).toBe(false);
			expect(held()).toBe(false);
		});

		it("holds only while the session resolves, and no longer once the resolving window ends", () => {
			show("reconnecting");
			expect(held()).toBe(true);
			act(() => vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS + 1));
			expect(read().resolving).toBe(false);
			expect(held()).toBe(false);
		});

		it("does not hold a session that already shows another active account", () => {
			show("connected-other-account");
			expect(connectedWallet()).toBe(OTHER_OWNER);
			expect(held()).toBe(false);
		});

		it.each(["reconnecting-other-account", "directory-initialising-other-account"] as const)(
			"ends the hold at once when the wallet reports another account while the session is still resolving (%s)",
			(stage) => {
				show(stage);
				expect(read().resolving).toBe(true);
				expect(connectedWallet()).toBe(OTHER_OWNER);
				expect(held()).toBe(false);
			},
		);

		it("keeps holding a reconnect that still reports the settled account", () => {
			show("reconnecting");
			expect(read().resolving).toBe(true);
			expect(connectedWallet()).toBe(SESSION_OWNER);
			expect(held()).toBe(true);
		});

		it("ends a resolving hold as soon as the reconnecting wallet reports another account", () => {
			show("reconnecting");
			expect(held()).toBe(true);
			show("reconnecting-other-account");
			expect(held()).toBe(false);
		});

		it("never holds while the wallet reports an account other than the session's, resolving or not", () => {
			const checked: WalletSessionStage[] = [];
			for (const stage of [
				"connected",
				"directory-initialising",
				"connecting",
				"reconnecting",
				"activating",
				"wallet-missing",
				"connected-other-account",
				"reconnecting-other-account",
				"directory-initialising-other-account",
				"connected-other-owner",
				"signed-out",
			] as const) {
				act(() => resetWalletSessionStage("connected"));
				show(stage);
				const otherAccountActive = connectedWallet() !== undefined && connectedWallet() !== SESSION_OWNER;
				if (otherAccountActive && readAddress() !== connectedWallet()) {
					checked.push(stage);
					expect({ stage, held: held() }).toEqual({ stage, held: false });
				}
			}
			expect(checked).toEqual([
				"connected-other-account",
				"reconnecting-other-account",
				"directory-initialising-other-account",
			]);
		});
	});

	describe("the address it gives the Hyperliquid provider", () => {
		const STAGES: readonly WalletSessionStage[] = [
			"connected",
			"authentication-initialising",
			"directory-initialising",
			"connecting",
			"reconnecting",
			"activating",
			"wallet-missing",
			"connected-other-account",
			"connected-other-owner",
			"signed-out",
		];

		it("is never a wallet while the session is resolving, so the client key is disconnected", () => {
			const resolvingStages: WalletSessionStage[] = [];
			for (const from of STAGES) {
				for (const to of STAGES) {
					act(() => resetWalletSessionStage("connected"));
					show(from);
					show(to);
					if (!read().resolving) continue;
					resolvingStages.push(to);
					expect({ stage: to, address: readAddress() }).toEqual({ stage: to, address: undefined });
					expect(resolveSession(readAddress() as `0x${string}` | undefined, null, "Mainnet").clientKey).toBe(
						"disconnected",
					);
				}
			}
			expect(new Set(resolvingStages)).toEqual(
				new Set(["authentication-initialising", "directory-initialising", "connecting", "reconnecting", "activating"]),
			);
		});

		it("is the wallet once the session settles on it", () => {
			show("reconnecting");
			expect(readAddress()).toBeUndefined();
			show("connected");
			expect(readAddress()).toBe(SESSION_OWNER);
			expect(resolveSession(SESSION_OWNER, null, "Mainnet").clientKey).toBe(SESSION_OWNER);
		});
	});
});
