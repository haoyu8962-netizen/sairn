// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { WALLET_SESSION_RESOLVING_MAX_MS } from "@/lib/wallet/session-resolving-clock";
import {
	resetWalletSessionStage,
	setWalletSessionStage,
	type WalletSessionStage,
} from "./harness/wallet-session-stage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@privy-io/react-auth", async () => (await import("./harness/wallet-session-stage")).privyMock);
vi.mock("wagmi", async () => (await import("./harness/wallet-session-stage")).wagmiMock);
vi.mock("@privy-io/wagmi", async () => (await import("./harness/wallet-session-stage")).privyWagmiMock);
vi.mock("@/lib/hyperliquid", async () => (await import("./harness/wallet-session-stage")).hyperliquidSessionMock);

function Probe() {
	const { address, hasWalletAccess, isConnected, isResolving, sessionMode } = useWalletSession();
	return (
		<output
			data-address={address ?? ""}
			data-connected={String(isConnected)}
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
});
