import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { localeList } from "@/config/i18n";

const LOCALES_ROOT = resolve(__dirname, "../../locales");

// Numbers follow the number-format setting, never the interface language. A number written into a message (a deposit
// limit, a volume threshold) is not formatted at runtime, so every catalog keeps the source's digits and separators.
// Catalogs that predate this contract and still localize them are listed with the source numbers they change; fixing
// one means removing it here (docs/i18n-presentation.md, task record 2026-11-26 pending item 6).
const PENDING_LOCALIZED_NUMBERS: Readonly<Record<string, readonly string[]>> = {
	es: ["10,000,000", "1,000"],
	fr: ["100,000", "10,000,000", "10,000,000", "1,000", "10,000"],
};

function readEntries(locale: string): Array<{ msgid: string; msgstr: string }> {
	const source = readFileSync(resolve(LOCALES_ROOT, `${locale}/messages.po`), "utf8").replace(/\r\n?/g, "\n");
	return source.split(/\n[ \t]*\n/).flatMap((block) => {
		const fields = new Map<string, string>();
		let field: string | null = null;
		for (const line of block.split("\n")) {
			if (line.startsWith("#")) continue;
			const keyword = line.match(/^(msgctxt|msgid|msgstr)\s+(".*")$/);
			if (keyword) {
				field = keyword[1];
				fields.set(field, JSON.parse(keyword[2]) as string);
			} else if (field && line.startsWith('"')) {
				fields.set(field, `${fields.get(field)}${JSON.parse(line) as string}`);
			}
		}
		const msgid = fields.get("msgid");
		const msgstr = fields.get("msgstr");
		return msgid && msgstr !== undefined ? [{ msgid, msgstr }] : [];
	});
}

function localizedNumbers(locale: string): string[] {
	const changed: string[] = [];
	for (const { msgid, msgstr } of readEntries(locale)) {
		if (!msgstr) continue;
		for (const number of msgid.match(/\d{1,3}(?:,\d{3})+/g) ?? []) {
			if (!msgstr.includes(number)) changed.push(number);
		}
	}
	return changed;
}

describe("catalog literal number contract", () => {
	it("finds the grouped numbers it checks", () => {
		const numbers = readEntries("en").flatMap(({ msgid }) => msgid.match(/\d{1,3}(?:,\d{3})+/g) ?? []);
		expect(numbers).toContain("10,000,000");
		expect(localizedNumbers("fr").length).toBeGreaterThan(0);
	});

	it.each(localeList.map(({ code }) => code).filter((code) => code !== "en"))(
		"keeps the source's literal numbers in the %s catalog",
		(locale) => {
			expect(localizedNumbers(locale).sort()).toEqual([...(PENDING_LOCALIZED_NUMBERS[locale] ?? [])].sort());
		},
	);
});
