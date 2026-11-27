// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNavDrawer } from "@/components/trade/mobile/mobile-nav-drawer";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	router: {
		navigate: vi.fn(async () => {}),
		preloadRoute: vi.fn(async () => {}),
		subscribe: vi.fn(() => () => {}),
	},
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to, ...rest }: { children?: React.ReactNode; to: string }) =>
		createElement("a", { href: to, ...rest }, children),
	useLocation: () => ({ pathname: "/trade/HYPE" }),
	useRouter: () => mocks.router,
}));

vi.mock("@/components/trade/header/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/hooks/trade/use-trade-home-path", () => ({ useTradeHomePath: () => "/trade/HYPE" }));
vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({ available: false, path: "external", unavailableReason: null }),
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ hasWalletAccess: false, sessionMode: "disconnected" }),
}));
vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
	useSettingsDialogActions: () => ({ open: vi.fn() }),
}));
vi.mock("@/components/trade/components/lazy-global-modals", () => ({
	preloadGlobalModal: vi.fn(async () => {}),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileNavDrawer real DrawerTrigger semantics", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		document.querySelectorAll("[data-base-ui-portal]").forEach((portal) => {
			portal.remove();
		});
	});

	it("exposes dialog trigger semantics, links aria-controls while open, and closes cleanly", async () => {
		act(() => root.render(<MobileNavDrawer />));

		const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]');
		expect(trigger).not.toBeNull();
		expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");

		await act(async () => {
			trigger?.click();
		});

		const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
		expect(dialog).not.toBeNull();
		expect(dialog?.id).toBeTruthy();
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		const controls = trigger?.getAttribute("aria-controls");
		expect(controls).toBe(dialog?.id);
		expect(controls ? document.getElementById(controls) : null).toBe(dialog);

		const closeButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="Close navigation"]');
		expect(closeButton).not.toBeNull();
		await act(async () => {
			closeButton?.click();
		});

		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		expect(document.activeElement).toBe(trigger);

		await act(async () => {
			trigger?.click();
		});
		const reopenedDialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
		expect(reopenedDialog).not.toBeNull();
		expect(trigger?.getAttribute("aria-controls")).toBe(reopenedDialog?.id);

		await act(async () => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});

		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		expect(document.body.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});
});
