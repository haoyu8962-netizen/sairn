import { getCanonicalNetworkForOrigin } from "@/config/public-origins";
import { isValidReferralCode, normalizeReferralCode } from "./referral-code";

export interface ReferralJoinIntent {
	code: string;
	env: "Mainnet" | "Testnet";
}

export function isSafeReferralJoinCode(code: string): boolean {
	return normalizeReferralJoinCode(code) !== null;
}

export function parseReferralJoinPath(pathname: string): string | null {
	const match = /^\/join\/([^/]+)$/.exec(pathname);
	if (!match?.[1] || match[1].length > 240) return null;

	const rawCode = match[1];
	if (/%(?![0-9a-fA-F]{2})/.test(rawCode)) return null;
	let code: string;
	try {
		code = decodeURIComponent(rawCode);
	} catch {
		return null;
	}
	return normalizeReferralJoinCode(code);
}

/** The code a join link carries, upper-cased as the official terminal and `setReferrer` submission use it. */
function normalizeReferralJoinCode(code: string): string | null {
	const normalized = normalizeReferralCode(code);
	return normalized !== null && isValidReferralCode(normalized) ? normalized : null;
}

export function resolveReferralJoinIntent(
	pathname: string,
	origin: string,
	developmentEnv?: "Mainnet" | "Testnet",
): ReferralJoinIntent | null {
	const code = parseReferralJoinPath(pathname);
	if (!code) return null;

	const canonicalNetwork = getCanonicalNetworkForOrigin(origin);
	if (canonicalNetwork) {
		return { code, env: canonicalNetwork === "testnet" ? "Testnet" : "Mainnet" };
	}
	if (!import.meta.env.DEV || !developmentEnv) return null;

	let developmentOrigin: URL;
	try {
		developmentOrigin = new URL(origin);
	} catch {
		return null;
	}
	const isDevelopmentHost =
		(developmentOrigin.protocol === "http:" || developmentOrigin.protocol === "https:") &&
		["localhost", "127.0.0.1", "[::1]"].includes(developmentOrigin.hostname);
	return isDevelopmentHost ? { code, env: developmentEnv } : null;
}

/**
 * The invitation code for the `/join/$code` route: the router's decoded parameter and the browser path,
 * decoded once by `parseReferralJoinPath`, must name the same code once both are upper-cased.
 */
export function resolveReferralJoinRouteCode(
	paramCode: string,
	pathname: string,
	origin: string,
	developmentEnv?: "Mainnet" | "Testnet",
): string | null {
	const intent = resolveReferralJoinIntent(pathname, origin, developmentEnv);
	if (!intent || intent.code !== normalizeReferralJoinCode(paramCode)) return null;
	return intent.code;
}
