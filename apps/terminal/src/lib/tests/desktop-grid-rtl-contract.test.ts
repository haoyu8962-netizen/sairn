import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const STYLES_CSS = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");

describe("desktop grid RTL origin contract", () => {
	it("pins .desktop-terminal-grid > .react-grid-item to top: 0 and left: 0 so translate(x, y) stays in-bounds in RTL", () => {
		const match = /\.desktop-terminal-grid\s*>\s*\.react-grid-item\s*\{([^}]+)\}/.exec(STYLES_CSS);
		expect(match).not.toBeNull();
		const ruleBody = match?.[1] ?? "";
		expect(ruleBody).toMatch(/(?:^|[;\s])left:\s*0\s*;/);
		expect(ruleBody).toMatch(/(?:^|[;\s])top:\s*0\s*;/);
	});
});
