// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFundsSessionKey } from "@/hooks/trade/use-funds-session-key";
import { WALLET_SESSION_RESOLVING_MAX_MS } from "@/lib/wallet/session-resolving-clock";
import {
	resetWalletSessionStage,
	setWalletSessionStage,
	type WalletSessionStage,
} from "./harness/wallet-session-stage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const network = vi.hoisted(() => ({ env: "Mainnet" as "Mainnet" | "Testnet" }));

vi.mock("@privy-io/react-auth", async () => (await import("./harness/wallet-session-stage")).privyMock);
vi.mock("wagmi", async () => (await import("./harness/wallet-session-stage")).wagmiMock);
vi.mock("@privy-io/wagmi", async () => (await import("./harness/wallet-session-stage")).privyWagmiMock);
vi.mock("@/lib/hyperliquid", async () => {
	const harness = await import("./harness/wallet-session-stage");
	const useHyperliquid = () => ({ ...harness.useHyperliquidSession(), env: network.env });
	return { ...harness.hyperliquidSessionMock, useHyperliquid, useHyperliquidOptional: useHyperliquid };
});

function Draft() {
	const [amount, setAmount] = useState("");
	return <input aria-label="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} />;
}

function FundsDialogProbe() {
	const key = useFundsSessionKey();
	return (
		<section data-key={key}>
			<Draft key={key} />
		</section>
	);
}

describe("useFundsSessionKey", () => {
	let container: HTMLDivElement;
	let root: Root;

	function show(stage: WalletSessionStage) {
		act(() => setWalletSessionStage(stage));
	}

	function key() {
		return container.querySelector("section")?.dataset.key ?? "";
	}

	function input() {
		const element = container.querySelector<HTMLInputElement>("input");
		if (!element) throw new Error("Missing draft input");
		return element;
	}

	function type(value: string) {
		const element = input();
		act(() => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
			element.dispatchEvent(new Event("input", { bubbles: true }));
		});
	}

	beforeEach(() => {
		vi.useFakeTimers();
		window.sessionStorage.clear();
		network.env = "Mainnet";
		resetWalletSessionStage("connected");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<FundsDialogProbe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it.each(["reconnecting", "connecting", "directory-initialising", "activating"] as const)(
		"keeps the dialog and its draft while the session is %s and settles back",
		(stage) => {
			const settledKey = key();
			const draftInput = input();
			type("125.5");
			show(stage);
			expect(key()).toBe(settledKey);
			show("connected");
			expect(key()).toBe(settledKey);
			expect(input()).toBe(draftInput);
			expect(input().value).toBe("125.5");
		},
	);

	it("remounts once the session settles on another owner", () => {
		const settledKey = key();
		type("125.5");
		show("reconnecting");
		show("connected-other-owner");
		expect(key()).not.toBe(settledKey);
		expect(input().value).toBe("");
	});

	it("remounts at once for a confirmed sign-out, which is not a resolving session", () => {
		const settledKey = key();
		type("125.5");
		show("signed-out");
		expect(key()).not.toBe(settledKey);
		expect(input().value).toBe("");
	});

	it("remounts when the resolving window ends without a session", () => {
		const settledKey = key();
		type("125.5");
		show("reconnecting");
		expect(key()).toBe(settledKey);
		act(() => vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS + 1));
		expect(key()).not.toBe(settledKey);
		expect(input().value).toBe("");
	});

	it("never holds the network: a switch remounts even while the session resolves", () => {
		const settledKey = key();
		type("125.5");
		show("reconnecting");
		network.env = "Testnet";
		act(() => root.render(<FundsDialogProbe />));
		expect(key()).not.toBe(settledKey);
		expect(key().startsWith("Testnet:")).toBe(true);
		expect(input().value).toBe("");
	});
});
