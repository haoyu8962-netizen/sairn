import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setupI18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { describe, expect, it } from "vitest";

const TRANSLATED_LOCALES = ["zh", "ja", "hi", "es", "fr", "ar"] as const;

interface CatalogEntry {
	id: string;
	translation: string;
}

interface CatalogEntryWithContext extends CatalogEntry {
	context: string;
}

function readCatalog(locale: string): string {
	return readFileSync(resolve(__dirname, `../../locales/${locale}/messages.po`), "utf8");
}

function parseActiveEntries(catalog: string): CatalogEntry[] {
	return catalog
		.split(/\n{2,}/)
		.filter((block) => !/^#~ /m.test(block))
		.flatMap((block) => {
			const id = readField(block, "msgid");
			const translation = readField(block, "msgstr");
			return id && translation !== undefined ? [{ id, translation }] : [];
		});
}

function readField(block: string, name: "msgctxt" | "msgid" | "msgstr"): string | undefined {
	const lines = block.split("\n");
	const start = lines.findIndex((line) => line.startsWith(`${name} "`));
	if (start === -1) return undefined;
	let value = lines[start].slice(name.length + 2, -1);
	for (let index = start + 1; index < lines.length && lines[index].startsWith('"'); index += 1) {
		value += lines[index].slice(1, -1);
	}
	return value;
}

function decodePoString(literal: string): string {
	return JSON.parse(literal) as string;
}

function readDecodedField(block: string, name: "msgctxt" | "msgid" | "msgstr"): string | undefined {
	const lines = block.split("\n");
	const start = lines.findIndex((line) => line.startsWith(`${name} "`));
	if (start === -1) return undefined;
	let value = decodePoString(lines[start].slice(name.length + 1));
	for (let index = start + 1; index < lines.length && lines[index].startsWith('"'); index += 1) {
		value += decodePoString(lines[index]);
	}
	return value;
}

function parseActiveEntriesWithContext(catalog: string): CatalogEntryWithContext[] {
	return catalog
		.split(/\n{2,}/)
		.filter((block) => !/^#~ /m.test(block))
		.flatMap((block) => {
			const id = readDecodedField(block, "msgid");
			const translation = readDecodedField(block, "msgstr");
			const context = readDecodedField(block, "msgctxt") ?? "";
			return id && translation !== undefined ? [{ id, context, translation }] : [];
		});
}

function entryKey(entry: Pick<CatalogEntryWithContext, "id" | "context">): string {
	return `${entry.id}\x1f${entry.context}`;
}

function linguiId(message: string, context = ""): string {
	return createHash("sha256").update(`${message}\x1f${context}`).digest("base64").slice(0, 6);
}

function extractPlaceholders(message: string): string[] {
	const placeholders: string[] = [];
	let index = 0;
	while (index < message.length) {
		const char = message[index];
		if (char === "}") {
			placeholders.push("__UNMATCHED_CLOSE_BRACE__");
			index += 1;
			continue;
		}
		if (char !== "{") {
			index += 1;
			continue;
		}
		let depth = 1;
		let end = index + 1;
		while (end < message.length && depth > 0) {
			if (message[end] === "{") depth += 1;
			else if (message[end] === "}") depth -= 1;
			end += 1;
		}
		if (depth !== 0) {
			placeholders.push("__UNMATCHED_OPEN_BRACE__");
			break;
		}
		const inner = message.slice(index + 1, end - 1);
		const commaIndex = inner.indexOf(",");
		if (commaIndex === -1) {
			placeholders.push(inner.trim());
		} else {
			placeholders.push(inner.slice(0, commaIndex).trim());
			const rest = inner.slice(commaIndex + 1);
			let cursor = 0;
			while (cursor < rest.length) {
				if (rest[cursor] === "{") {
					let branchDepth = 1;
					let branchEnd = cursor + 1;
					while (branchEnd < rest.length && branchDepth > 0) {
						if (rest[branchEnd] === "{") branchDepth += 1;
						else if (rest[branchEnd] === "}") branchDepth -= 1;
						branchEnd += 1;
					}
					if (branchDepth !== 0) {
						placeholders.push("__UNMATCHED_OPEN_BRACE__");
						break;
					}
					placeholders.push(...extractPlaceholders(rest.slice(cursor + 1, branchEnd - 1)));
					cursor = branchEnd;
				} else {
					cursor += 1;
				}
			}
		}
		index = end;
	}
	return placeholders.sort();
}

function findCatalogKeyParityIssues(
	sourceEntries: readonly CatalogEntryWithContext[],
	targetEntries: readonly CatalogEntryWithContext[],
): { missing: string[]; extra: string[]; duplicateTargetKeys: string[] } {
	const sourceKeys = new Set(sourceEntries.map(entryKey));
	const targetKeys = new Set<string>();
	const duplicateTargetKeys: string[] = [];
	for (const entry of targetEntries) {
		const key = entryKey(entry);
		if (targetKeys.has(key)) duplicateTargetKeys.push(key);
		targetKeys.add(key);
	}
	const missing = [...sourceKeys].filter((key) => !targetKeys.has(key));
	const extra = [...targetKeys].filter((key) => !sourceKeys.has(key));
	return { missing, extra, duplicateTargetKeys };
}

function findPlaceholderMismatches(
	sourceEntries: readonly CatalogEntryWithContext[],
	targetEntries: readonly CatalogEntryWithContext[],
): Array<{ id: string; context: string; expected: string[]; actual: string[] }> {
	const targetByKey = new Map(targetEntries.map((entry) => [entryKey(entry), entry]));
	const mismatches: Array<{ id: string; context: string; expected: string[]; actual: string[] }> = [];
	for (const sourceEntry of sourceEntries) {
		const targetEntry = targetByKey.get(entryKey(sourceEntry));
		if (!targetEntry) continue;
		const expected = extractPlaceholders(sourceEntry.id);
		const actual = extractPlaceholders(targetEntry.translation);
		if (expected.length !== actual.length || expected.some((name, index) => name !== actual[index])) {
			mismatches.push({
				id: sourceEntry.id,
				context: sourceEntry.context,
				expected,
				actual,
			});
		}
	}
	return mismatches;
}

describe("translation catalog completeness", () => {
	const englishEntries = parseActiveEntriesWithContext(readCatalog("en"));

	it("reads active entries and skips obsolete ones", () => {
		const catalog = [
			'#: src/a.tsx\nmsgid "Kept"\nmsgstr ""',
			'#~ msgid "Obsolete"\n#~ msgstr ""',
			'#: src/b.tsx\nmsgid "Wrapped"\nmsgstr ""\n"Over two "\n"lines"',
		].join("\n\n");

		expect(parseActiveEntries(catalog)).toEqual([
			{ id: "Kept", translation: "" },
			{ id: "Wrapped", translation: "Over two lines" },
		]);
	});

	it("catches missing active entries, context mismatches, and missing or duplicated placeholders", () => {
		const source = parseActiveEntriesWithContext(
			[
				'#: src/a.tsx\nmsgid "Modify Order for {marketLabel}: {modifyUnavailableReason}"\nmsgstr "Modify Order for {marketLabel}: {modifyUnavailableReason}"',
				'#: src/b.tsx\nmsgctxt "order"\nmsgid "Repeat {token} and {token}"\nmsgstr "Repeat {token} and {token}"',
			].join("\n\n"),
		);

		const droppedPlaceholder = parseActiveEntriesWithContext(
			[
				'#: src/a.tsx\nmsgid "Modify Order for {marketLabel}: {modifyUnavailableReason}"\nmsgstr "تعديل طلب {marketLabel}:"',
				'#: src/b.tsx\nmsgctxt "order"\nmsgid "Repeat {token} and {token}"\nmsgstr "كرر {token}"',
			].join("\n\n"),
		);
		expect(findPlaceholderMismatches(source, droppedPlaceholder)).toEqual([
			{
				id: "Modify Order for {marketLabel}: {modifyUnavailableReason}",
				context: "",
				expected: ["marketLabel", "modifyUnavailableReason"],
				actual: ["marketLabel"],
			},
			{
				id: "Repeat {token} and {token}",
				context: "order",
				expected: ["token", "token"],
				actual: ["token"],
			},
		]);

		const missingEntry = parseActiveEntriesWithContext(
			'#: src/b.tsx\nmsgctxt "wrong"\nmsgid "Repeat {token} and {token}"\nmsgstr "كرر {token} و {token}"',
		);
		expect(findCatalogKeyParityIssues(source, missingEntry)).toEqual({
			missing: ["Modify Order for {marketLabel}: {modifyUnavailableReason}\x1f", "Repeat {token} and {token}\x1forder"],
			extra: ["Repeat {token} and {token}\x1fwrong"],
			duplicateTargetKeys: [],
		});
	});

	it("keeps English active entries unique with consistent msgid and msgstr placeholders", () => {
		expect(englishEntries.length).toBeGreaterThan(0);
		expect(findCatalogKeyParityIssues(englishEntries, englishEntries)).toEqual({
			missing: [],
			extra: [],
			duplicateTargetKeys: [],
		});
		expect(findPlaceholderMismatches(englishEntries, englishEntries)).toEqual([]);
	});

	it.each(TRANSLATED_LOCALES)("translates every active message in %s", (locale) => {
		const untranslated = parseActiveEntries(readCatalog(locale))
			.filter((entry) => entry.translation.trim() === "")
			.map((entry) => entry.id);

		expect(untranslated).toEqual([]);
	});

	it.each(TRANSLATED_LOCALES)(
		"matches every English active msgid, msgctxt, and placeholder multiset in %s",
		(locale) => {
			expect(englishEntries.length).toBeGreaterThan(0);
			const localeEntries = parseActiveEntriesWithContext(readCatalog(locale));
			expect(findCatalogKeyParityIssues(englishEntries, localeEntries)).toEqual({
				missing: [],
				extra: [],
				duplicateTargetKeys: [],
			});
			expect(findPlaceholderMismatches(englishEntries, localeEntries)).toEqual([]);
		},
	);

	it.each(TRANSLATED_LOCALES)(
		"interpolates both market and unavailable reason for the mobile modify-order screen-reader label in %s",
		(locale) => {
			const localeEntries = parseActiveEntriesWithContext(readCatalog(locale));
			const messages: Record<string, string> = {};
			for (const entry of localeEntries) {
				messages[linguiId(entry.id, entry.context)] = entry.translation;
			}
			const localI18n = setupI18n({ locale, messages: { [locale]: messages } });
			const marketLabel = "BTC-USD";
			const modifyUnavailableReason = localI18n._(msg`Orders with linked TP/SL orders cannot be modified here.`);
			const rendered = localI18n._(msg`Modify Order for ${marketLabel}: ${modifyUnavailableReason}`);

			expect(modifyUnavailableReason).not.toBe("Orders with linked TP/SL orders cannot be modified here.");
			expect(rendered).toContain(marketLabel);
			expect(rendered).toContain(modifyUnavailableReason);
			expect(rendered).not.toContain("{marketLabel}");
			expect(rendered).not.toContain("{modifyUnavailableReason}");
			expect(rendered).not.toBe(`Modify Order for ${marketLabel}: ${modifyUnavailableReason}`);
		},
	);
});
