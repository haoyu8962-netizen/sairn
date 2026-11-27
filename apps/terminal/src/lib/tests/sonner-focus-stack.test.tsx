// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n } from "@lingui/core";
import { act, createContext, useContext } from "react";
import type { Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderNotificationHost } from "@/components/trade/order-notification-host";
import {
	retractPrivyFiatFundingNotice,
	showPrivyFiatFundingNotice,
} from "@/components/trade/tradebox/privy-fiat-funding-notice-toast";
import { Toaster } from "@/components/ui/sonner";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import { addOrderQueueItem, removeOrderQueueItem } from "@/stores/use-order-queue-store";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const identity = vi.hoisted(() => ({ clientKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", env: "Mainnet" }));
const IdentityContext = createContext(identity);
vi.mock("@/lib/hyperliquid", () => ({ useHyperliquid: () => useContext(IdentityContext) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	useIsTestnet: () => false,
}));

const SONNER_CSS = readFileSync(resolve(process.cwd(), "src/components/ui/sonner.css"), "utf8");

describe("Collapsed notification stack keyboard focus", () => {
	let container: HTMLDivElement;
	let styleEl: HTMLStyleElement;
	let root: Root;
	const ids: string[] = [];

	beforeEach(() => {
		vi.useFakeTimers();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		styleEl = document.createElement("style");
		styleEl.textContent = SONNER_CSS;
		document.head.appendChild(styleEl);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() =>
			root.render(
				<IdentityContext.Provider value={identity}>
					<Toaster />
					<OrderNotificationHost />
				</IdentityContext.Provider>,
			),
		);
	});

	afterEach(async () => {
		await act(async () => {
			for (const id of ids.splice(0)) removeOrderQueueItem(id);
			toast.dismiss();
			await vi.advanceTimersByTimeAsync(1000);
			root.unmount();
		});
		container.remove();
		styleEl.remove();
		vi.useRealTimers();
	});

	it("keeps collapsed back OrderToast controls out of Tab order until the stack is focused or expanded", async () => {
		const observers: { notify: () => void }[] = [];
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe = vi.fn();
				disconnect = vi.fn();
				constructor(notify: () => void) {
					observers.push({ notify });
				}
			},
		);

		let olderId = "";
		act(() => {
			olderId = addOrderQueueItem({
				owner: identity.clientKey,
				env: "Mainnet",
				market: "HYPE",
				side: "buy",
				size: "1",
				status: "pending",
			});
			ids.push(olderId);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => {
			toast.info("Newer notification", { id: "front-toast", duration: Infinity });
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		const frontToast = container.querySelector<HTMLElement>('[data-sonner-toast][data-front="true"]');
		const backCard = container.querySelector<HTMLElement>(`[data-order-feedback="${olderId}"]`);
		const backToast = backCard?.closest<HTMLElement>("[data-sonner-toast]");
		const backDismissButton = backCard?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
		const backScrollBody = backCard?.querySelector<HTMLElement>('[data-order-scroll="body"]');

		expect(frontToast).not.toBeNull();
		expect(backToast?.getAttribute("data-front")).toBe("false");
		expect(backToast?.getAttribute("data-expanded")).toBe("false");
		expect(backDismissButton).not.toBeNull();
		expect(backScrollBody).not.toBeNull();

		Object.defineProperties(backScrollBody as HTMLElement, {
			clientHeight: { get: () => 80 },
			scrollHeight: { get: () => 200 },
		});
		act(() => {
			for (const observer of observers) observer.notify();
		});

		expect(backDismissButton?.tabIndex).toBe(-1);
		expect(backScrollBody?.hasAttribute("tabindex")).toBe(false);
		expect(backCard?.querySelector('[role="status"]')).not.toBeNull();

		act(() => {
			frontToast?.focus();
			frontToast?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		});

		expect(backDismissButton?.tabIndex).toBe(0);
		expect(backScrollBody?.tabIndex).toBe(0);

		const outside = document.createElement("button");
		document.body.appendChild(outside);
		act(() => {
			outside.focus();
			frontToast?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }));
		});
		outside.remove();

		expect(backDismissButton?.tabIndex).toBe(-1);
		expect(backScrollBody?.hasAttribute("tabindex")).toBe(false);

		const toaster = container.querySelector<HTMLElement>("[data-sonner-toaster]");
		act(() => {
			toaster?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(backToast?.getAttribute("data-expanded")).toBe("true");
		expect(backDismissButton?.tabIndex).toBe(0);
		expect(backScrollBody?.tabIndex).toBe(0);
		expect(SONNER_CSS).toContain(":focus-within");
	});

	it("keeps non-visible overflow toasts out of Tab order and visually hidden while visible live regions stay active", async () => {
		act(() => {
			for (let index = 0; index < 4; index += 1) {
				const id = addOrderQueueItem({
					owner: identity.clientKey,
					env: "Mainnet",
					market: `ASSET-${index}`,
					side: "buy",
					size: "1",
					status: "pending",
				});
				ids.push(id);
			}
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		const hiddenToast = container.querySelector<HTMLElement>('[data-sonner-toast][data-visible="false"]');
		const visibleToast = container.querySelector<HTMLElement>('[data-sonner-toast][data-visible="true"]');
		const hiddenDismiss = hiddenToast?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');

		expect(hiddenToast).not.toBeNull();
		expect(visibleToast).not.toBeNull();
		expect(hiddenDismiss?.tabIndex).toBe(-1);
		expect(getComputedStyle(hiddenToast as HTMLElement).visibility).toBe("hidden");
		expect(getComputedStyle(visibleToast as HTMLElement).visibility).not.toBe("hidden");
	});

	it("keeps live regions accessible when an overflowed 4th order fails while newer toasts remain in front", async () => {
		const { updateOrderQueueItem } = await import("@/stores/use-order-queue-store");
		let oldestId = "";
		act(() => {
			oldestId = addOrderQueueItem({
				owner: identity.clientKey,
				env: "Mainnet",
				market: "BTC",
				side: "buy",
				size: "1",
				status: "pending",
			});
			ids.push(oldestId);
			for (let index = 1; index < 4; index += 1) {
				const id = addOrderQueueItem({
					owner: identity.clientKey,
					env: "Mainnet",
					market: `ASSET-${index}`,
					side: "buy",
					size: "1",
					status: "pending",
				});
				ids.push(id);
			}
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => {
			updateOrderQueueItem(oldestId, {
				status: "failed",
				error: "Insufficient margin",
			});
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		const failedCard = container.querySelector<HTMLElement>(`[data-order-feedback="${oldestId}"]`);
		const hiddenToast = failedCard?.closest<HTMLElement>("[data-sonner-toast]");
		const dismissButton = failedCard?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
		const alertRegion = failedCard?.querySelector<HTMLElement>('[role="alert"]');

		expect(hiddenToast?.getAttribute("data-visible")).toBe("false");
		expect(getComputedStyle(hiddenToast as HTMLElement).visibility).toBe("hidden");
		expect(dismissButton?.tabIndex).toBe(-1);
		expect(getComputedStyle(dismissButton as HTMLElement).visibility).toBe("hidden");
		expect(alertRegion).not.toBeNull();
		expect(alertRegion?.textContent).toContain("Insufficient margin");
		expect(getComputedStyle(alertRegion as HTMLElement).visibility).toBe("visible");
		expect(getComputedStyle(alertRegion as HTMLElement).width).toBe("1px");
		expect(getComputedStyle(alertRegion as HTMLElement).height).toBe("1px");
		expect(getComputedStyle(alertRegion as HTMLElement).overflow).toBe("hidden");
		expect(getComputedStyle(alertRegion as HTMLElement).clipPath).toBe("inset(50%)");
	});

	it("keeps status live regions accessible when an overflowed 4th order succeeds while newer toasts remain in front", async () => {
		const { updateOrderQueueItem } = await import("@/stores/use-order-queue-store");
		let oldestId = "";
		act(() => {
			oldestId = addOrderQueueItem({
				owner: identity.clientKey,
				env: "Mainnet",
				market: "ETH",
				side: "buy",
				size: "2",
				status: "pending",
			});
			ids.push(oldestId);
			for (let index = 1; index < 4; index += 1) {
				const id = addOrderQueueItem({
					owner: identity.clientKey,
					env: "Mainnet",
					market: `ASSET-${index}`,
					side: "buy",
					size: "1",
					status: "pending",
				});
				ids.push(id);
			}
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => {
			updateOrderQueueItem(oldestId, {
				status: "success",
				price: "3200",
			});
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		const succeededCard = container.querySelector<HTMLElement>(`[data-order-feedback="${oldestId}"]`);
		const hiddenToast = succeededCard?.closest<HTMLElement>("[data-sonner-toast]");
		const dismissButton = succeededCard?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
		const statusRegion = succeededCard?.querySelector<HTMLElement>('[role="status"]');

		expect(hiddenToast?.getAttribute("data-visible")).toBe("false");
		expect(getComputedStyle(hiddenToast as HTMLElement).visibility).toBe("hidden");
		expect(dismissButton?.tabIndex).toBe(-1);
		expect(getComputedStyle(dismissButton as HTMLElement).visibility).toBe("hidden");
		expect(statusRegion).not.toBeNull();
		expect(succeededCard?.querySelector('[role="alert"]')).toBeNull();
		expect(statusRegion?.textContent).toContain("ETH");
		expect(getComputedStyle(statusRegion as HTMLElement).visibility).toBe("visible");
		expect(getComputedStyle(statusRegion as HTMLElement).width).toBe("1px");
		expect(getComputedStyle(statusRegion as HTMLElement).height).toBe("1px");
		expect(getComputedStyle(statusRegion as HTMLElement).overflow).toBe("hidden");
		expect(getComputedStyle(statusRegion as HTMLElement).clipPath).toBe("inset(50%)");
	});

	it("keeps status live regions accessible and dismiss button hidden when a non-error card funding notice overflows", async () => {
		const presentation = showPrivyFiatFundingNotice({
			kind: "confirmed",
			network: "mainnet",
			ownerKey: getPrivyFiatFundingOwnerKey("mainnet", identity.clientKey),
			walletKind: "embedded",
		});

		try {
			await act(() => vi.advanceTimersByTimeAsync(0));
			act(() => {
				for (let index = 1; index <= 3; index += 1) {
					const id = addOrderQueueItem({
						owner: identity.clientKey,
						env: "Mainnet",
						market: `NEWER-${index}`,
						side: "buy",
						size: "1",
						status: "pending",
					});
					ids.push(id);
				}
			});
			await act(() => vi.advanceTimersByTimeAsync(0));

			const card = container.querySelector<HTMLElement>('[data-privy-fiat-funding-notice="confirmed"]');
			const hiddenToast = card?.closest<HTMLElement>("[data-sonner-toast]");
			const dismissButton = card?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
			const statusRegion = card?.querySelector<HTMLElement>('[role="status"]');

			expect(card).not.toBeNull();
			expect(hiddenToast?.getAttribute("data-visible")).toBe("false");
			expect(getComputedStyle(hiddenToast as HTMLElement).visibility).toBe("hidden");
			expect(dismissButton).not.toBeNull();
			expect(getComputedStyle(dismissButton as HTMLElement).visibility).toBe("hidden");
			expect(statusRegion).not.toBeNull();
			expect(statusRegion?.contains(dismissButton as Node)).toBe(false);
			expect(card?.querySelector('[role="alert"]')).toBeNull();
			expect(statusRegion?.textContent).toContain("Card purchase confirmed");
			expect(getComputedStyle(statusRegion as HTMLElement).visibility).toBe("visible");
			expect(getComputedStyle(statusRegion as HTMLElement).width).toBe("1px");
			expect(getComputedStyle(statusRegion as HTMLElement).height).toBe("1px");
			expect(getComputedStyle(statusRegion as HTMLElement).overflow).toBe("hidden");
			expect(getComputedStyle(statusRegion as HTMLElement).clipPath).toBe("inset(50%)");
		} finally {
			act(() => retractPrivyFiatFundingNotice(presentation));
		}
	});
});
