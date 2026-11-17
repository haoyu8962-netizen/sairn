/** @vitest-environment jsdom */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectPlaceholder } from "@/components/trade/positions/placeholder";
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

const SENTENCE = "Connect your wallet to view positions.";
const TABS_DIR = resolve(import.meta.dirname, "../../components/trade/positions");

describe("desktop account tabs while the wallet session resolves", () => {
	let container: HTMLDivElement;
	let root: Root;

	function mount(stage: WalletSessionStage) {
		resetWalletSessionStage(stage);
		act(() => root.render(<ConnectPlaceholder>{SENTENCE}</ConnectPlaceholder>));
	}

	beforeEach(() => {
		window.sessionStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it.each([
		"authentication-initialising",
		"directory-initialising",
		"activating",
		"connecting",
		"reconnecting",
	] as const)("shows a busy region instead of the Connect sentence while the session is %s", (stage) => {
		mount(stage);

		expect(container.textContent).toBe("");
		expect(container.querySelector('[data-slot="passive-data-placeholder"]')?.getAttribute("aria-busy")).toBe("true");
	});

	it.each([
		"signed-out",
		"wallet-missing",
		"connected-other-account",
		"authentication-initialising-first-visit",
	] as const)("shows the Connect sentence once the session is %s", (stage) => {
		mount(stage);

		expect(container.textContent).toBe(SENTENCE);
		expect(container.querySelector('[aria-busy="true"]')).toBeNull();
	});

	it("shows the Connect sentence once the session has been resolving for the maximum time", () => {
		vi.useFakeTimers();
		mount("reconnecting");
		expect(container.textContent).toBe("");

		act(() => vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS));
		expect(container.textContent).toBe(SENTENCE);
	});

	it("follows the session from busy to the sentence when it ends signed out", () => {
		mount("authentication-initialising");
		act(() => setWalletSessionStage("signed-out"));
		expect(container.textContent).toBe(SENTENCE);
	});

	it("routes every desktop account tab's Connect sentence through the shared placeholder", () => {
		const offenders: string[] = [];
		let sentences = 0;
		for (const file of readdirSync(TABS_DIR)) {
			if (!file.endsWith(".tsx")) continue;
			const source = readFileSync(resolve(TABS_DIR, file), "utf8");
			for (const match of source.matchAll(/<(\w+)>\s*\{t`Connect your wallet to view [^`]+`\}/g)) {
				sentences += 1;
				if (match[1] !== "ConnectPlaceholder") offenders.push(`${file}: <${match[1]}>`);
			}
		}

		expect(offenders).toEqual([]);
		expect(sentences).toBe(10);
	});
});
