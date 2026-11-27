// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandMenu } from "@/components/trade/components/command-menu";
import type { MarketCatalogState } from "@/lib/hyperliquid/markets/market-catalog-state";

const mocks = vi.hoisted(() => ({
	markets: [] as unknown[],
	isLoading: false,
	error: new Error("catalog failed") as Error | null,
	catalogState: undefined as MarketCatalogState | undefined,
	retryMarketCatalog: vi.fn(),
	close: vi.fn(),
}));

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span>{coin}</span>,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarketsInfo: () => ({
		markets: mocks.markets,
		isLoading: mocks.isLoading,
		error: mocks.error,
		catalogState: mocks.catalogState,
		retryMarketCatalog: mocks.retryMarketCatalog,
	}),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useCommandMenuOpen: () => true,
	useCommandMenuActions: () => ({ close: mocks.close }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("command menu retry keyboard activation", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		if (!globalThis.ResizeObserver) {
			globalThis.ResizeObserver = class ResizeObserver {
				observe() {}
				unobserve() {}
				disconnect() {}
			};
		}
		if (!HTMLElement.prototype.scrollIntoView) {
			HTMLElement.prototype.scrollIntoView = () => {};
		}

		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.markets = [];
		mocks.isLoading = false;
		mocks.error = new Error("catalog failed");
		mocks.catalogState = {
			status: "error",
			canResolveNotFound: false,
			isRefreshing: false,
			isRestoring: false,
			isPaused: false,
			isStale: true,
			error: mocks.error,
		};
		mocks.retryMarketCatalog.mockReset();
		mocks.retryMarketCatalog.mockResolvedValue(undefined);
		mocks.close.mockReset();

		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<CommandMenu />
				</I18nProvider>,
			),
		);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	// r3 E-03
	it("preserves native Enter and Space activation on the Retry button inside real CommandDialog", () => {
		const retryButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Retry",
		);
		expect(retryButton).toBeDefined();

		act(() => {
			retryButton?.focus();
		});

		const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
		act(() => {
			retryButton?.dispatchEvent(enterEvent);
			if (!enterEvent.defaultPrevented) {
				retryButton?.click();
			}
		});
		expect(enterEvent.defaultPrevented).toBe(false);
		expect(mocks.retryMarketCatalog).toHaveBeenCalledTimes(1);

		const spaceEvent = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
		act(() => {
			retryButton?.dispatchEvent(spaceEvent);
			if (!spaceEvent.defaultPrevented) {
				retryButton?.click();
			}
		});
		expect(spaceEvent.defaultPrevented).toBe(false);
		expect(mocks.retryMarketCatalog).toHaveBeenCalledTimes(2);
	});
});
