import { getCanonicalNetworkForOrigin } from "@/config/public-origins";
import { isValidReferralCode, normalizeReferralCode } from "./referral";

export interface ReferralJoinIntent {
	code: string;
	env: "Mainnet" | "Testnet";
}

export function isSafeReferralJoinCode(code: string): boolean {
	const normalized = normalizeReferralCode(code);
	return normalized !== null && isValidReferralCode(normalized);
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
	return isSafeReferralJoinCode(code) ? code : null;
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
