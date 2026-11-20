import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_SRC = resolve(TEST_DIR, "../..");

const DASHBOARD_COMPONENT_DIRS = [
	"portfolio",
	"earn",
	"staking",
	"vaults",
	"referrals",
	"leaderboard",
	"funding-comparison",
	"funding-history",
	"historical-orders",
	"trade-history",
	"api-wallet",
] as const;

const SOURCES = DASHBOARD_COMPONENT_DIRS.flatMap((dir) =>
	readdirSync(resolve(TERMINAL_SRC, "components", dir))
		.filter((file) => file.endsWith(".tsx"))
		.map((file) => `components/${dir}/${file}`),
).sort();

const STRING_LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;
const DESKTOP_COLUMNS = /^min-\[1001px\]:grid-cols-/;
const BASE_COLUMNS = /^grid-cols-(?:[1-9]\d*|\[[^\]]+\])$/;

/**
 * `.claude/rules/style-ui-guide.md` (Dashboard page gutters): a grid that takes its columns only
 * from 1001px up is one implicit column on phones, which grows to its widest nowrap content and is
 * clipped silently by an overflow-hidden panel. Such a grid names its phone track (`grid-cols-1`).
 * The check reads class strings, so a grid assembled from separate arguments is not seen.
 */
describe("dashboard mobile grid track contract", () => {
	it("gives every grid whose columns start at the desktop breakpoint an explicit phone track", () => {
		expect(SOURCES.length).toBeGreaterThan(20);
		const missing = SOURCES.flatMap((file) =>
			Array.from(readFileSync(resolve(TERMINAL_SRC, file), "utf8").matchAll(STRING_LITERAL), (match) =>
				(match[1] ?? match[2] ?? match[3] ?? "").split(/\s+/),
			)
				.filter(
					(tokens) =>
						tokens.includes("grid") &&
						tokens.some((token) => DESKTOP_COLUMNS.test(token)) &&
						!tokens.some((token) => BASE_COLUMNS.test(token)),
				)
				.map((tokens) => `${file}: ${tokens.join(" ")}`),
		);
		expect(missing).toEqual([]);
	});
});
