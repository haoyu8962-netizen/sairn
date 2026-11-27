import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { localeList } from "@/config/i18n";
import { fontTextForLocale, LOCALE_FONT_SAMPLES } from "@/lib/fonts/font-readiness";

const SOURCE_ROOT = resolve(__dirname, "../..");
const stylesCss = readFileSync(resolve(SOURCE_ROOT, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

interface Face {
	family: string;
	subset: string;
	ranges: Array<[number, number]>;
}

function parseRanges(value: string): Array<[number, number]> {
	return value.split(",").map((part) => {
		const match = part.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i);
		if (!match) throw new Error(`unreadable unicode-range part: ${part}`);
		const start = Number.parseInt(match[1], 16);
		return [start, match[2] ? Number.parseInt(match[2], 16) : start];
	});
}

function readFaces(source: string): Face[] {
	return (source.match(/@font-face\s*\{[^}]*\}/gi) ?? []).map((block) => {
		const family = block.match(/font-family:\s*"([^"]+)"/)?.[1];
		const subset = block.match(/\/files\/(?:inter|ibm-plex-sans)-([a-z-]+)-wght-normal\.woff2/)?.[1];
		const range = block.match(/unicode-range:\s*([^;}]+)/)?.[1];
		if (!family || !subset || !range) throw new Error(`unreadable font face: ${block}`);
		return { family, subset, ranges: parseRanges(range) };
	});
}

const faces = readFaces(stylesCss);
const families = [...new Set(faces.map(({ family }) => family))];

function covers(face: Face, codePoint: number) {
	return face.ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

// Overlapping ranges resolve to the face declared last (CSS Fonts 4, unicode-range), which is the one a page renders.
function usedFace(family: string, codePoint: number) {
	return faces.filter((face) => face.family === family && covers(face, codePoint)).at(-1);
}

interface PoEntry {
	msgid: string;
	msgstr: string;
}

const PO_FIELDS = new Set(["msgctxt", "msgid", "msgstr"]);

// Reads the forms Lingui writes: blank-line separated entries, `#` comments (obsolete `#~` entries included), and
// msgctxt / msgid / msgstr with continuation lines. Anything else, plural `msgid_plural` / `msgstr[n]` included, throws
// instead of being skipped, so a change of catalog format cannot make this contract pass on half the text.
function parsePoEntries(source: string): PoEntry[] {
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
					continue;
				}
				if (field && line.startsWith('"')) {
					fields.set(field, `${fields.get(field)}${JSON.parse(line) as string}`);
					continue;
				}
				throw new Error(`unreadable PO line: ${line}`);
			}
			const msgid = fields.get("msgid");
			const msgstr = fields.get("msgstr");
			if (msgid === undefined && msgstr === undefined && !fields.has("msgctxt")) return [];
			if (msgid === undefined || msgstr === undefined) throw new Error(`incomplete PO entry: ${block}`);
			return msgid === "" ? [] : [{ msgid, msgstr }];
		});
}

function readCatalogText(locale: string): string {
	const entries = parsePoEntries(readFileSync(resolve(SOURCE_ROOT, `locales/${locale}/messages.po`), "utf8"));
	return entries.map(({ msgid, msgstr }) => (locale === "en" ? `${msgid}${msgstr}` : msgstr)).join("");
}

function subsetsUsedBy(family: string, text: string): string[] {
	const subsets = new Set<string>();
	for (const character of text) {
		const face = usedFace(family, character.codePointAt(0) ?? 0);
		if (face && face.subset !== "latin") subsets.add(face.subset);
	}
	return [...subsets].sort();
}

function subsetsLoadedFor(family: string, text: string): string[] {
	const subsets = new Set<string>();
	for (const character of text) {
		const codePoint = character.codePointAt(0) ?? 0;
		for (const face of faces) {
			if (face.family === family && face.subset !== "latin" && covers(face, codePoint)) subsets.add(face.subset);
		}
	}
	return [...subsets].sort();
}

describe("locale font subset contract", () => {
	it("reads every face of both families", () => {
		expect(faces).toHaveLength(stylesCss.match(/@font-face/gi)?.length ?? 0);
		expect(families).toEqual(["Inter Variable", "IBM Plex Sans Variable"]);
	});

	it("reads the catalogs it checks", () => {
		expect(readCatalogText("vi")).toContain("Đóng theo thị trường");
		expect(readCatalogText("en")).toContain("Market Close");
	});

	it("reads translations only, without the header, comments or obsolete entries", () => {
		const entries = parsePoEntries(
			[
				'msgid ""',
				'msgstr ""',
				'"Last-Translator: Иван\\n"',
				"",
				"#. js-lingui-explicit-id",
				"#: src/a.tsx:1",
				'msgctxt "Order type"',
				'msgid "Market"',
				'msgstr "Thị "',
				'"trường \\"ạ\\""',
				"",
				'#~ msgid "Gone"',
				'#~ msgstr "Ж"',
				"",
			].join("\n"),
		);
		expect(entries).toEqual([{ msgid: "Market", msgstr: 'Thị trường "ạ"' }]);
	});

	it("reads a catalog saved with Windows line endings like the same catalog with Unix ones", () => {
		const source = [
			'msgid ""',
			'msgstr ""',
			'"Language: vi\\n"',
			"",
			'msgid "A"',
			'msgstr "ạ "',
			'"ă"',
			"",
			'msgid "B"',
			'msgstr "Ж"',
			"",
			"",
		].join("\n");
		expect(parsePoEntries(source.replaceAll("\n", "\r\n"))).toEqual(parsePoEntries(source));
		expect(parsePoEntries(source)).toEqual([
			{ msgid: "A", msgstr: "ạ ă" },
			{ msgid: "B", msgstr: "Ж" },
		]);
	});

	it.each([
		["plural forms", 'msgid "One"\nmsgid_plural "Many"\nmsgstr[0] "Ж"'],
		["an indexed msgstr", 'msgid "One"\nmsgstr[0] "Ж"'],
		["an entry without msgstr", 'msgid "One"'],
		["a repeated field", 'msgid "One"\nmsgstr "a"\nmsgstr "b"'],
		["an unreadable line", 'msgid "One"\nmsgstr "a"\nstray text'],
	])("refuses %s instead of skipping it", (_form, source) => {
		expect(() => parsePoEntries(source)).toThrow();
	});

	it.each(localeList.map(({ code }) => code))(
		"samples exactly the non-Latin subsets the %s catalog renders",
		(locale) => {
			const catalogText = readCatalogText(locale);
			const sample = LOCALE_FONT_SAMPLES[locale] ?? "";
			for (const family of families) {
				expect(subsetsUsedBy(family, sample), `${locale} ${family}`).toEqual(subsetsUsedBy(family, catalogText));
				expect(subsetsLoadedFor(family, sample), `${locale} ${family}: a sample that loads an unused subset`).toEqual(
					subsetsUsedBy(family, catalogText),
				);
			}
		},
	);

	it("keeps the space that makes the Latin faces part of every language's wait", () => {
		for (const { code } of localeList) {
			const text = fontTextForLocale(code);
			if (text === undefined) continue;
			expect(text.startsWith(" "), code).toBe(true);
		}
		const sampled = Object.keys(LOCALE_FONT_SAMPLES);
		expect(sampled.every((code) => localeList.some((locale) => locale.code === code))).toBe(true);
		expect(sampled.length).toBeGreaterThan(0);
	});

	it("detects a catalog subset the sample misses", () => {
		const viText = readCatalogText("vi");
		expect(subsetsUsedBy("IBM Plex Sans Variable", "ạ")).not.toEqual(subsetsUsedBy("IBM Plex Sans Variable", viText));
		expect(subsetsUsedBy("Inter Variable", "ă")).not.toEqual(subsetsUsedBy("Inter Variable", viText));
	});
});
