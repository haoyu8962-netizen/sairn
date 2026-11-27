import { getEightHourFundingRate, getMarketCapUsd, getOiUsd } from "@/domain/market";
import { isLiveMarkPriceReady } from "@/domain/trade/market-price";
import type { MarketCatalogState } from "@/lib/hyperliquid/markets/market-catalog-state";
import type { MarketRow } from "./token-selector-categories";

export type MarketCatalogDisplayState = "ready" | "loading" | "error";

export function canConfirmEmptyMarketCatalog({
	isLoading,
	error,
	catalogState,
}: {
	isLoading: boolean;
	error: Error | null | undefined;
	catalogState: MarketCatalogState | undefined;
}): boolean {
	if (catalogState) {
		return catalogState.status === "ready" && catalogState.canResolveNotFound;
	}
	return !isLoading && !error;
}

export function resolveMarketCatalogDisplayState({
	visibleMarketCount,
	isLoading,
	error,
	catalogState,
}: {
	visibleMarketCount: number;
	isLoading: boolean;
	error: Error | null | undefined;
	catalogState: MarketCatalogState | undefined;
}): MarketCatalogDisplayState {
	if (visibleMarketCount > 0) return "ready";
	if (catalogState) {
		if (
			catalogState.status === "restoring" ||
			catalogState.status === "loading" ||
			catalogState.isRestoring ||
			catalogState.isRefreshing
		) {
			return "loading";
		}
		if (catalogState.status === "ready" && catalogState.canResolveNotFound) {
			return "ready";
		}
		return "error";
	}
	if (isLoading) return "loading";
	if (error) return "error";
	return "ready";
}

export function getLiveSelectorMarkPrice(market: MarketRow, now = Date.now()): string | undefined {
	if (!isLiveMarkPriceReady(market.markPriceStatus ?? "idle", market.markPx, market.markPriceReceivedAt, now)) {
		return undefined;
	}
	return market.markPx;
}

export function getLiveSelectorVolume(market: MarketRow): string | undefined {
	if (market.assetContextLive !== true) return undefined;
	return market.dayNtlVlm;
}

export function getLiveSelectorFunding(market: MarketRow): number | null {
	if (market.kind === "spot" || market.assetContextLive !== true) return null;
	return getEightHourFundingRate(market.funding);
}

export function getLiveSelectorOiUsd(market: MarketRow, now = Date.now()): number | null {
	if (market.kind === "spot" || market.assetContextLive !== true) return null;
	const liveMarkPx = getLiveSelectorMarkPrice(market, now);
	if (!liveMarkPx) return null;
	return getOiUsd(market.openInterest, liveMarkPx);
}

export function getLiveSelectorSpotMarketCapUsd(market: MarketRow, now = Date.now()): string | null {
	if (market.kind !== "spot" || market.assetContextLive !== true) return null;
	const liveMarkPx = getLiveSelectorMarkPrice(market, now);
	if (!liveMarkPx) return null;
	return getMarketCapUsd(market.circulatingSupply, liveMarkPx);
}
