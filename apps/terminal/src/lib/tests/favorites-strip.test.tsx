// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FavoritesStrip } from "@/components/trade/header/favorites-strip";
import { FavoritesStripView } from "@/components/trade/header/favorites-strip-view";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";

const mocks = vi.hoisted(() => ({
	favorites: ["BTC", "ETH"] as string[],
	marketsByName: {} as Record<string, Partial<UnifiedMarketInfo>>,
	toggleFavoriteMarket: vi.fn(),
	navigateToMarket: vi.fn(),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarketsInfo: () => ({
		getMarketInfo: (name: string) => mocks.marketsByName[name] as UnifiedMarketInfo | undefined,
	}),
	useSelectedMarketInfo: () => ({ data: undefined }),
}));

vi.mock("@/stores/use-market-store", () => ({
	useFavoriteMarkets: () => mocks.favorites,
	useSelectedMarket: () => "BTC",
	useMarketActions: () => ({ toggleFavoriteMarket: mocks.toggleFavoriteMarket }),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => mocks.navigateToMarket,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("favorites strip G3a fixes", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.favorites = ["BTC", "ETH"];
		mocks.marketsByName = {
			BTC: {
				name: "BTC",
				pairName: "BTC-USDC",
				markPx: "110",
				midPx: "110",
				prevDayPx: "100",
				markPriceStatus: "stale",
				markPriceReceivedAt: Date.now() - 20_000,
				assetContextLive: false,
			},
			ETH: {
				name: "ETH",
				pairName: "ETH-USDC",
				markPx: "220",
				midPx: "220",
				prevDayPx: "200",
				markPriceStatus: "success",
				markPriceReceivedAt: Date.now(),
				assetContextLive: true,
			},
		};
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	// r1 E-01
	it("omits 24h change when market price or asset context is stale and keeps live change", () => {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<FavoritesStrip />
				</I18nProvider>,
			);
		});

		const btcBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Select BTC-USDC market"]');
		const ethBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Select ETH-USDC market"]');
		const btcChangeSpan = btcBtn?.querySelectorAll("span")[1];
		const ethChangeSpan = ethBtn?.querySelectorAll("span")[1];

		expect(btcChangeSpan?.className).toContain("invisible");
		expect(btcChangeSpan?.textContent).not.toContain("10.00%");
		expect(ethChangeSpan?.className).not.toContain("invisible");
		expect(ethChangeSpan?.textContent).toContain("10.00%");
	});

	// r1 E-08
	it("keeps the remove button keyboard-focusable and visible on focus-within with a focus ring", () => {
		act(() => {
			root.render(
				<FavoritesStripView
					items={[{ name: "BTC", label: "BTC-USDC", active: true, changeText: "+1.00%", changeTone: "up" }]}
					emptyLabel="No favorites"
					selectLabel={(name) => `Select ${name}`}
					removeLabel={(name) => `Remove ${name}`}
				/>,
			);
		});

		const removeBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Remove BTC"]');
		expect(removeBtn).not.toBeNull();
		expect(removeBtn?.className.split(/\s+/)).not.toContain("hidden");
		expect(removeBtn?.className).toContain("group-focus-within/fav:");
		expect(removeBtn?.className).toContain("focus-visible:outline-");
	});

	// r3 E-06
	it("places the remove button and its focus ring inside the padded scroll container and restores focus after removal", () => {
		function renderStrip() {
			act(() => {
				root.render(
					<I18nProvider i18n={i18n}>
						<FavoritesStrip />
					</I18nProvider>,
				);
			});
		}

		mocks.toggleFavoriteMarket.mockImplementation((name: string) => {
			mocks.favorites = mocks.favorites.filter((item) => item !== name);
		});

		renderStrip();

		const scrollContainer = container.querySelector<HTMLDivElement>(".overflow-x-auto");
		expect(scrollContainer?.className).toMatch(/\bpy-\d/);
		expect(scrollContainer?.className).toMatch(/\bpx-\d/);

		const removeBtcBtn = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Remove BTC-USDC from favorites"]',
		);
		expect(removeBtcBtn).not.toBeNull();
		expect(removeBtcBtn?.className).not.toContain("-top-0.5");
		expect(removeBtcBtn?.className).not.toContain("-end-0.5");
		expect(removeBtcBtn?.className).toContain("top-0");
		expect(removeBtcBtn?.className).toContain("end-0");

		act(() => {
			removeBtcBtn?.focus();
			removeBtcBtn?.click();
		});
		renderStrip();

		const selectEthBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Select ETH-USDC market"]');
		expect(document.activeElement).toBe(selectEthBtn);

		const removeEthBtn = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Remove ETH-USDC from favorites"]',
		);
		act(() => {
			removeEthBtn?.focus();
			removeEthBtn?.click();
		});
		renderStrip();

		const strip = container.querySelector<HTMLDivElement>("[data-favorites-strip]");
		expect(document.activeElement).toBe(strip);
	});
});
