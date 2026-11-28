import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { localeList } from "@/config/i18n";

const LOCALES_ROOT = resolve(__dirname, "../../locales");

// Numbers follow the number-format setting, never the interface language. A source message therefore carries no
// grouped number: a limit or threshold is a placeholder that the number formatter fills at render time
// (docs/i18n-presentation.md, docs/number-format-setting.md). Any number a message still writes (none today) is not
// formatted at runtime, so every catalog keeps the source's digits and separators. An exception would list each message
// with the source numbers it changes; a listed message that no longer changes them fails as stale.
const PENDING_LOCALIZED_NUMBERS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {};

const PO_FIELDS = new Set(["msgctxt", "msgid", "msgstr"]);

interface PoEntry {
	key: string;
	msgid: string;
	msgstr: string;
}

// Reads the forms Lingui writes; anything else, gettext plurals included, throws instead of being skipped.
function parsePo(source: string): PoEntry[] {
	return source
		.replace(/\r\n?/g, "\n")
		.split(/\n[ \t]*\n/)
		.flatMap((block) => {
			const fields = new Map<string, string>();
			let field: string | null = null;
			for (const line of block.split("\n")) {
				if (line.startsWith("#") || line.trim() === "") continue;
				const keyword = line.match(/^(\S+)\s+(".*")$/);
				if (keyword) {
					if (!PO_FIELDS.has(keyword[1]) || fields.has(keyword[1])) throw new Error(`unsupported PO line: ${line}`);
					field = keyword[1];
					fields.set(field, JSON.parse(keyword[2]) as string);
				} else if (field && line.startsWith('"')) {
					fields.set(field, `${fields.get(field)}${JSON.parse(line) as string}`);
				} else {
					throw new Error(`unreadable PO line: ${line}`);
				}
			}
			const msgid = fields.get("msgid");
			const msgstr = fields.get("msgstr");
			if (msgid === undefined && msgstr === undefined && !fields.has("msgctxt")) return [];
			if (msgid === undefined || msgstr === undefined) throw new Error(`incomplete PO entry: ${block}`);
			if (msgid === "") return [];
			const context = fields.get("msgctxt");
			return [{ key: context ? `${context}\u0004${msgid}` : msgid, msgid, msgstr }];
		});
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GROUPED_NUMBER_PATTERN = /(?<![\d.,])\d{1,3}(?:,\d{3})+(?![\d]|[.,]\d)/g;

// English source messages group thousands with commas; any such group counts, decimals included ("$10,000.00").
const SOURCE_GROUPED_NUMBER_PATTERN = /\d{1,3}(?:,\d{3})+(?:\.\d+)?/g;

// Every source message that writes a comma-grouped number, translated or not, with the numbers it writes.
function sourceGroupedNumbers(source: string): Record<string, string[]> {
	const found: Record<string, string[]> = {};
	for (const { key, msgid } of parsePo(source)) {
		const numbers = msgid.match(SOURCE_GROUPED_NUMBER_PATTERN);
		if (numbers) found[key] = [...numbers];
	}
	return found;
}

// The source's grouped numbers that the translation does not repeat as whole tokens, as often as the source has them.
function changedNumbers(msgid: string, msgstr: string): string[] {
	const wanted = new Map<string, number>();
	for (const number of msgid.match(GROUPED_NUMBER_PATTERN) ?? []) {
		wanted.set(number, (wanted.get(number) ?? 0) + 1);
	}
	const changed: string[] = [];
	for (const [number, count] of wanted) {
		const found = msgstr.match(new RegExp(`(?<![\\d.,])${escapeRegExp(number)}(?![\\d]|[.,]\\d)`, "g"))?.length ?? 0;
		for (let index = found; index < count; index++) changed.push(number);
	}
	return changed;
}

function catalogViolations(source: string): Record<string, string[]> {
	const violations: Record<string, string[]> = {};
	for (const { key, msgstr } of parsePo(source)) {
		if (!msgstr) continue;
		const msgid = key.includes("\u0004") ? key.slice(key.indexOf("\u0004") + 1) : key;
		const changed = changedNumbers(msgid, msgstr);
		if (changed.length) violations[key] = changed.sort();
	}
	return violations;
}

function readCatalog(locale: string) {
	return readFileSync(resolve(LOCALES_ROOT, `${locale}/messages.po`), "utf8");
}

describe("catalog literal number contract", () => {
	it("detects a changed, grown, partly kept or missing number, and accepts kept ones", () => {
		expect(changedNumbers("Limit 1,000 USDC", "Límite 1.000 USDC")).toEqual(["1,000"]);
		expect(changedNumbers("Limit 1,000 USDC", "Limit 11,000 USDC")).toEqual(["1,000"]);
		expect(changedNumbers("Cap 10,000,000", "Cap 110,000,000")).toEqual(["10,000,000"]);
		expect(changedNumbers("From 1,000 to 1,000", "Von 1,000 bis 1.000")).toEqual(["1,000"]);
		expect(changedNumbers("Cap 10,000,000 USDC", "Лимит — 10 000 000 USDC")).toEqual(["10,000,000"]);
		expect(changedNumbers("Cap 10,000,000 USDC", "Batas 10,000,000 USDC.")).toEqual([]);
		expect(changedNumbers("Over $10,000.", "Acima de $10,000.")).toEqual([]);
	});

	it("binds each violation to its message, so a new one cannot hide behind a listed one", () => {
		const catalog = [
			'msgid ""',
			'msgstr ""',
			"",
			'msgid "Cap 10,000,000 USDC"',
			'msgstr "Cap 10.000.000 USDC"',
			"",
			'msgctxt "Board"',
			'msgid "Volume above 10,000,000"',
			'msgstr "Volume au-dessus de 10 000 000"',
			"",
		].join("\n");
		expect(catalogViolations(catalog)).toEqual({
			"Cap 10,000,000 USDC": ["10,000,000"],
			"Board\u0004Volume above 10,000,000": ["10,000,000"],
		});
		expect(() => parsePo('msgid "One"\nmsgid_plural "Many"\nmsgstr[0] "1,000"')).toThrow();
	});

	it("finds a grouped number in any source message, translated or not", () => {
		const catalog = [
			'msgid "Cap {limit} USDC"',
			'msgstr ""',
			"",
			'msgid "Cap 10,000,000 USDC"',
			'msgstr ""',
			"",
			'msgctxt "Board"',
			'msgid "Over $10,000"',
			'msgstr "Über $10,000"',
			"",
			'msgid "Fee of $10,000.00 and 2.5 USDC"',
			'msgstr ""',
			"",
			'#~ msgid "Old cap 1,000 USDC"',
			'#~ msgstr "Alte Grenze 1,000 USDC"',
			"",
		].join("\n");
		expect(sourceGroupedNumbers(catalog)).toEqual({
			"Cap 10,000,000 USDC": ["10,000,000"],
			"Board\u0004Over $10,000": ["10,000"],
			"Fee of $10,000.00 and 2.5 USDC": ["10,000.00"],
		});
	});

	it.each(localeList.map(({ code }) => code))(
		"writes no grouped number into a source message of the %s catalog",
		(locale) => {
			expect(sourceGroupedNumbers(readCatalog(locale))).toEqual({});
		},
	);

	it.each(localeList.map(({ code }) => code).filter((code) => code !== "en"))(
		"keeps the source's literal numbers in the %s catalog",
		(locale) => {
			const pending = Object.fromEntries(
				Object.entries(PENDING_LOCALIZED_NUMBERS[locale] ?? {}).map(([msgid, numbers]) => [msgid, [...numbers].sort()]),
			);
			expect(catalogViolations(readCatalog(locale))).toEqual(pending);
		},
	);
});
