import { msg } from "@lingui/core/macro";
import type { QueryClient } from "@tanstack/react-query";
import type { GeoVerdict } from "@/config/geo";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";

export interface TradingRegionVerdict {
	actionsBlocked: boolean;
	tradeRestricted: boolean;
	isResolved: boolean;
}

export function getGeoDevOverride(): string | null {
	if (!import.meta.env.DEV || typeof window === "undefined") return null;
	return new URLSearchParams(window.location.search).get("geo");
}

export function getGeoQueryKey(override: string | null) {
	return ["geo", override] as const;
}

/** The terminal's own region verdict; an unresolved or failed lookup blocks like a restricted one. */
export function deriveTradingRegionVerdict(data: GeoVerdict | undefined, isError: boolean): TradingRegionVerdict {
	const hasResolvedCountry = typeof data?.country === "string" && data.country.trim().length > 0;
	const isResolved = hasResolvedCountry && !isError;
	const tradeRestricted = hasResolvedCountry && (data?.tradeRestricted === true || data?.proxy === true);
	return { actionsBlocked: !isResolved || tradeRestricted, tradeRestricted, isResolved };
}

/** Reads the shared geo query synchronously, so an execution guard sees a change without a render. */
export function readTradingRegionVerdict(queryClient: QueryClient): TradingRegionVerdict {
	const state = queryClient.getQueryState<GeoVerdict>(getGeoQueryKey(getGeoDevOverride()));
	return deriveTradingRegionVerdict(state?.data, state?.status === "error");
}

export class TradingRegionBlockedError extends LocalizedActionError {
	readonly restricted: boolean;

	constructor(restricted: boolean) {
		super(
			restricted
				? msg`Trading is not available in your region`
				: msg`Unable to verify regional availability. Trading is temporarily unavailable.`,
		);
		this.name = "TradingRegionBlockedError";
		this.restricted = restricted;
	}
}

export function assertTradingRegionAllowed(verdict: Pick<TradingRegionVerdict, "actionsBlocked" | "tradeRestricted">) {
	if (verdict.tradeRestricted) throw new TradingRegionBlockedError(true);
	if (verdict.actionsBlocked) throw new TradingRegionBlockedError(false);
}

export function findTradingRegionBlockedError(error: unknown): TradingRegionBlockedError | undefined {
	if (error instanceof TradingRegionBlockedError) return error;
	if (error instanceof Error && error.cause instanceof TradingRegionBlockedError) return error.cause;
	return undefined;
}
