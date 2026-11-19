import { describe, expect, it } from "vitest";
import {
	isSafeReferralJoinCode,
	parseReferralJoinPath,
	resolveReferralJoinIntent,
	resolveReferralJoinRouteCode,
} from "@/lib/trade/referral-join";

describe("referral join links", () => {
	it("resolves canonical hosts to immutable Hyperliquid environments", () => {
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://app.sairn.ai")).toEqual({
			code: "SAIRNAPPWEB3",
			env: "Mainnet",
		});
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://testnet.sairn.ai")).toEqual({
			code: "SAIRNAPPWEB3",
			env: "Testnet",
		});
	});

	it("rejects the retired gatu.ai hosts", () => {
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://app.gatu.ai")).toBeNull();
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://testnet.gatu.ai")).toBeNull();
	});

	it("rejects unknown and hostname-confusion origins", () => {
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://app.sairn.ai.evil.example")).toBeNull();
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://preview.sairn.ai")).toBeNull();
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "http://app.sairn.ai")).toBeNull();
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://app.sairn.ai:8443")).toBeNull();
	});

	it("rejects spaces and Unicode that the referral submit path cannot apply", () => {
		expect(parseReferralJoinPath("/join/Sairn%20Code")).toBeNull();
		expect(parseReferralJoinPath(`/join/${encodeURIComponent("邀请")}`)).toBeNull();
	});

	it("upper-cases the code from the link, as the official terminal and the submit path do", () => {
		expect(parseReferralJoinPath("/join/sairnappweb3")).toBe("SAIRNAPPWEB3");
		expect(parseReferralJoinPath("/join/SairnApp7")).toBe("SAIRNAPP7");
		expect(parseReferralJoinPath("/join/PROBE")).toBe("PROBE");
	});

	it("opens the invitation for a lower-case link and keeps the upper-cased code", () => {
		expect(resolveReferralJoinRouteCode("sairnappweb3", "/join/sairnappweb3", "https://app.sairn.ai", "Mainnet")).toBe(
			"SAIRNAPPWEB3",
		);
		expect(resolveReferralJoinRouteCode("other", "/join/sairnappweb3", "https://app.sairn.ai", "Mainnet")).toBeNull();
		expect(
			resolveReferralJoinRouteCode(
				"sairnappweb3",
				"/join/sairnappweb3",
				"https://app.sairn.ai.evil.example",
				"Mainnet",
			),
		).toBeNull();
	});

	it("accepts equivalent percent-encoding and upper-cases the decoded code once", () => {
		expect(parseReferralJoinPath("/join/%73airnappweb3")).toBe("SAIRNAPPWEB3");
		expect(parseReferralJoinPath("/join/%e9%82%80%e8%af%b7")).toBeNull();
	});

	it.each([
		"/join",
		"/join/",
		"/join/code/extra",
		"/join/%2F",
		"/join/%5C",
		"/join/%252F",
		"/join/%00",
		"/join/%2e%2e",
		"/join/%",
	])("rejects unsafe or malformed path %s", (pathname) => {
		expect(parseReferralJoinPath(pathname)).toBeNull();
	});

	it("enforces the actionable code format without mutating safe codes", () => {
		expect(isSafeReferralJoinCode("A")).toBe(true);
		expect(isSafeReferralJoinCode("x".repeat(20))).toBe(true);
		expect(isSafeReferralJoinCode("x".repeat(21))).toBe(false);
		expect(isSafeReferralJoinCode("Code With Space")).toBe(false);
	});
});
