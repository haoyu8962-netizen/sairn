// @vitest-environment jsdom

import { normalizePublicLeaderboard } from "@sairn/hl-react/public-stats-data";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeaderboardApiSuccessResponse } from "@/lib/leaderboard/leaderboard-api";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { deriveLeaderboard } from "../leaderboard-domain";
import { LeaderboardView } from "../leaderboard-view";
import { useLeaderboardController } from "../use-leaderboard-controller";

const mocks = vi.hoisted(() => ({
	isMobile: false,
	isTestnet: false,
	data: undefined as LeaderboardApiSuccessResponse | undefined,
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mocks.isMobile }));
vi.mock("@/lib/hyperliquid", async () => ({
	getExplorerAddressUrl: (await import("@sairn/hl-react")).getExplorerAddressUrl,
	useHyperliquid: () => ({ isTestnet: mocks.isTestnet }),
}));
vi.mock("../use-leaderboard-data", () => ({
	useLeaderboardData: () => ({ data: mocks.data, fetchStatus: "idle", isError: false, refetch: vi.fn() }),
}));

function Probe() {
	return <LeaderboardView {...useLeaderboardController()} />;
}

describe("leaderboard trader identity", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it.each([
		["desktop", false, "Mainnet"],
		["desktop", false, "Testnet"],
		["mobile", true, "Mainnet"],
		["mobile", true, "Testnet"],
	] as const)(
		"shows the short address with the full address on hover when the display name is blank on %s (%s, %s)",
		(_surface, mobile, env) => {
			mocks.isMobile = mobile;
			mocks.isTestnet = env === "Testnet";
			const names = ["", " \t\n ", null, "Trader"];
			const rows = normalizePublicLeaderboard(
				{
					leaderboardRows: names.map((displayName, index) => ({
						ethAddress: `0x${String(index + 1).repeat(40)}`,
						accountValue: "200000",
						displayName,
						prize: 0,
						windowPerformances: ["day", "week", "month", "allTime"].map((period) => [
							period,
							{ pnl: "30", roi: "0.03", vlm: "10000000" },
						]),
					})),
				},
				env,
			);
			const result = deriveLeaderboard({
				rows,
				period: "month",
				sortKey: "pnl",
				sortDirection: "descending",
				query: "",
				page: 1,
				rowsPerPage: 10,
			});
			mocks.data = {
				version: 1,
				env,
				generatedAt: 1,
				stale: false,
				period: "month",
				sortKey: "pnl",
				sortDirection: "descending",
				query: "",
				rowsPerPage: 10,
				...result,
			};
			act(() => root.render(<Probe />));
			const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href*="/explorer/address/"]'));
			expect(links).toHaveLength(4);
			for (const [index, link] of links.entries()) {
				const address = rows[index]?.address;
				if (!address) throw new Error("Missing normalized trader");
				const shortAddress = `${address.slice(0, 8)}...${address.slice(-4)}`;
				const displayName = names[index]?.trim();
				expect(link.textContent?.trim()).toBe(displayName || shortAddress);
				expect(link.getAttribute("title")).toBe(displayName ? null : address);
				expect(link.hasAttribute("aria-label")).toBe(false);
				expect(link.getAttribute("href")).toBe(
					`https://${env === "Testnet" ? "app.hyperliquid-testnet.xyz" : "app.hyperliquid.xyz"}/explorer/address/${address}`,
				);
				expect(link.target).toBe("_blank");
				expect(link.rel).toBe("noopener");
			}
		},
	);
});
