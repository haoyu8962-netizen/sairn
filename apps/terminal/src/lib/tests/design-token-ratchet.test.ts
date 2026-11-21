import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(TEST_DIR, "../..");

const ARBITRARY_FONT_SIZE = /(?<![\w-])!?text-\[\d+(?:\.\d+)?px\]/g;
const ARBITRARY_RADIUS = /(?<![\w-])!?rounded(?:-[a-z]{1,2})?-\[\d+(?:\.\d+)?px\]/g;
const IMPORTANT_MENU_OR_DIALOG_SURFACE = /(?<![\w-])!(?:bg-modal|bg-overlay|shadow-overlay)(?![\w-])/g;
const RELATIVE_FONT_SIZE = /(?<![\w-])!?text-\[\d+(?:\.\d+)?(?:em|rem)\]/g;
const NUMERIC_RADIUS = /(?<![\w-])!?rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?-(\d+(?:\.\d+)?)(?![\w.-])/g;
const UI_SOURCE_ROOT = resolve(SOURCE_ROOT, "../../../packages/ui/src");

const ARBITRARY_FONT_SIZE_BASELINE = 111;
const ARBITRARY_RADIUS_BASELINE = 199;
const IMPORTANT_SURFACE_BASELINE = 12;
const RELATIVE_FONT_SIZE_BASELINE = 1;

function listSourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);
		if (statSync(path).isDirectory()) {
			if (name === "tests" || name === "locales" || name === "node_modules") return [];
			return listSourceFiles(path);
		}
		return /\.(ts|tsx)$/.test(name) ? [path] : [];
	});
}

function getDefinedNumericRadii(): Set<string> {
	const css = readFileSync(join(UI_SOURCE_ROOT, "globals.css"), "utf8");
	return new Set(Array.from(css.matchAll(/--radius-(\d+):/g), (match) => match[1]));
}

function countMatches(pattern: RegExp): number {
	return listSourceFiles(SOURCE_ROOT).reduce(
		(total, path) => total + (readFileSync(path, "utf8").match(pattern)?.length ?? 0),
		0,
	);
}

function describeRatchet(name: string, baseline: number, total: number): string {
	if (total > baseline) {
		return `${name} grew from ${baseline} to ${total}. Use the named scale from .claude/rules/design-tokens.md instead of adding arbitrary values.`;
	}
	return `${name} shrank from ${baseline} to ${total}. Lower the baseline in design-token-ratchet.test.ts so the debt cannot return.`;
}

describe("design token ratchet", () => {
	it("does not add arbitrary font sizes", () => {
		const total = countMatches(ARBITRARY_FONT_SIZE);
		expect(total, describeRatchet("Arbitrary text-[Npx] usage", ARBITRARY_FONT_SIZE_BASELINE, total)).toBe(
			ARBITRARY_FONT_SIZE_BASELINE,
		);
	});

	it("does not add arbitrary corner radii", () => {
		const total = countMatches(ARBITRARY_RADIUS);
		expect(total, describeRatchet("Arbitrary rounded-[Npx] usage", ARBITRARY_RADIUS_BASELINE, total)).toBe(
			ARBITRARY_RADIUS_BASELINE,
		);
	});

	it("does not add important overrides of the shared dialog and menu surfaces", () => {
		const total = countMatches(IMPORTANT_MENU_OR_DIALOG_SURFACE);
		expect(total, describeRatchet("Important surface override usage", IMPORTANT_SURFACE_BASELINE, total)).toBe(
			IMPORTANT_SURFACE_BASELINE,
		);
	});

	it("does not add relative font sizes beyond text that scales with its parent", () => {
		const total = countMatches(RELATIVE_FONT_SIZE);
		expect(total, describeRatchet("Relative text-[Nem] usage", RELATIVE_FONT_SIZE_BASELINE, total)).toBe(
			RELATIVE_FONT_SIZE_BASELINE,
		);
	});

	it("uses only numeric corner radii that the theme defines", () => {
		const defined = getDefinedNumericRadii();
		expect(defined.size).toBeGreaterThan(0);
		const undefinedRadii = [...listSourceFiles(SOURCE_ROOT), ...listSourceFiles(UI_SOURCE_ROOT)].flatMap((path) =>
			Array.from(readFileSync(path, "utf8").matchAll(NUMERIC_RADIUS))
				.filter((match) => !defined.has(match[1] ?? ""))
				.map((match) => `${path.slice(path.indexOf("/src/") + 1)}: ${match[0]}`),
		);
		expect(
			undefinedRadii,
			"Tailwind generates no rule for a rounded-N class without a matching --radius-N theme value, so the corner renders square. Use the named scale in .claude/rules/design-tokens.md.",
		).toEqual([]);
	});
});
