// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiWalletList } from "@/components/api-wallet/api-wallet-list";
import type { ApiWalletAgentView } from "@/components/api-wallet/api-wallet-view";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({ isMobile: false }));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => testState.isMobile }));

const AGENT: ApiWalletAgentView = {
	id: "grid-bot",
	name: "grid-bot",
	address: "0x2De29E088FDde87E2F25B39Cd1eeC09B18f2b1F3",
	expiresAt: "2026-12-21T00:00:00.000Z",
	expiryLabel: "Dec 21, 2026",
	status: "active",
};

const PASSIVE_TEXT = [
	"API wallet list is temporarily unavailable",
	"The extraAgents request failed",
	"Refreshing…",
	"Loading…",
	"Unavailable",
	"No API wallets authorized",
];

describe.each([false, true])("API wallet list passive states (mobile: %s)", (isMobile) => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.isMobile = isMobile;
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render(props: Partial<Parameters<typeof ApiWalletList>[0]>, onRetry = vi.fn()) {
		act(() =>
			root.render(
				<ApiWalletList
					listState="normal"
					canRemove
					agents={[AGENT]}
					isRefreshing={false}
					onRemove={vi.fn()}
					onRetry={onRetry}
					{...props}
				/>,
			),
		);
		return onRetry;
	}

	function buttons() {
		return Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
	}

	function expectNoPassiveText() {
		for (const text of PASSIVE_TEXT) expect(container.textContent).not.toContain(text);
		expect(container.querySelector('[role="alert"]')).toBeNull();
	}

	it("offers only a neutral Retry when the first read failed", () => {
		const onRetry = render({ listState: "error", agents: [] });
		expectNoPassiveText();
		expect(container.textContent).not.toMatch(/\d+ authorized/);
		const retry = buttons().find((button) => button.textContent === "Retry");
		act(() => retry?.click());
		expect(onRetry).toHaveBeenCalledOnce();
	});

	it("keeps retained agents on screen with removal disabled and a neutral Retry", () => {
		render({ listState: "retained", canRemove: false, agents: [AGENT] });
		expectNoPassiveText();
		expect(container.textContent).toContain("grid-bot");
		expect(container.textContent).toContain("1 authorized");
		const remove = buttons().filter((button) => button.textContent?.includes("Remove"));
		expect(remove.length).toBeGreaterThan(0);
		for (const button of remove) expect(button.disabled).toBe(true);
		expect(buttons().some((button) => button.textContent === "Retry")).toBe(true);
	});

	it("retries from below a retained list", () => {
		const onRetry = render({ listState: "retained", canRemove: false, agents: [AGENT] });
		const retry = buttons().filter((button) => button.textContent === "Retry");
		expect(retry).toHaveLength(1);
		act(() => retry[0]?.click());
		expect(onRetry).toHaveBeenCalledOnce();
	});

	it("draws no empty conclusion from a retained empty list", () => {
		const onRetry = render({ listState: "retained", canRemove: false, agents: [] });
		expectNoPassiveText();
		expect(container.textContent).not.toMatch(/\d+ authorized/);
		const retry = buttons().filter((button) => button.textContent === "Retry");
		expect(retry).toHaveLength(1);
		act(() => retry[0]?.click());
		expect(onRetry).toHaveBeenCalledOnce();
	});

	it("takes removal availability from the page, not from the list", () => {
		render({ listState: "normal", canRemove: false, agents: [AGENT] });
		expect(container.textContent).toContain("1 authorized");
		const remove = buttons().filter((button) => button.textContent?.includes("Remove"));
		expect(remove.length).toBeGreaterThan(0);
		for (const button of remove) expect(button.disabled).toBe(true);
	});

	it("refreshes in the background without visible text, announcing it only as busy", () => {
		render({ listState: "normal", agents: [AGENT], isRefreshing: true });
		expectNoPassiveText();
		expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe("true");
		expect(container.querySelector(".animate-spin")).toBeNull();
		expect(container.textContent).toContain("1 authorized");
	});

	it("keeps the first load blank and busy", () => {
		render({ listState: "loading", agents: [] });
		expectNoPassiveText();
		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
		expect(buttons().some((button) => button.textContent === "Retry")).toBe(false);
	});
});
