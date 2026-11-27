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

interface IcuBranch {
	selector: string;
	nodes: IcuNode[];
}

type IcuNode =
	| { type: "literal"; value: string }
	| { type: "pound" }
	| { type: "argument"; name: string }
	| { type: "formatted"; name: string; formatType: string }
	| { type: "select"; name: string; branches: IcuBranch[] }
	| { type: "plural" | "selectordinal"; name: string; branches: IcuBranch[] };

interface IcuPluralBlock {
	kind: "plural" | "selectordinal";
	name: string;
	branches: IcuBranch[];
}

interface PluralCountInterpolationIssue {
	id: string;
	context: string;
	reason: string;
}

function parseIcuMessage(message: string): { nodes: IcuNode[]; errors: string[] } {
	let cursor = 0;
	const errors: string[] = [];

	function skipWhitespace() {
		while (cursor < message.length && /\s/.test(message[cursor])) {
			cursor += 1;
		}
	}

	function isSyntaxChar(char: string | undefined, inPluralBranch: boolean): boolean {
		return char === "{" || char === "}" || (inPluralBranch && char === "#");
	}

	function parseNodes(stopAtBrace: boolean, inPluralBranch: boolean): IcuNode[] {
		const nodes: IcuNode[] = [];
		let literal = "";
		const flushLiteral = () => {
			if (literal.length > 0) {
				nodes.push({ type: "literal", value: literal });
				literal = "";
			}
		};

		while (cursor < message.length) {
			const char = message[cursor];
			if (char === "'") {
				const next = message[cursor + 1];
				if (next === "'") {
					literal += "'";
					cursor += 2;
					continue;
				}
				if (isSyntaxChar(next, inPluralBranch)) {
					cursor += 1;
					while (cursor < message.length) {
						if (message[cursor] === "'") {
							if (message[cursor + 1] === "'") {
								literal += "'";
								cursor += 2;
								continue;
							}
							cursor += 1;
							break;
						}
						literal += message[cursor];
						cursor += 1;
					}
					continue;
				}
				literal += "'";
				cursor += 1;
				continue;
			}

			if (char === "}") {
				if (stopAtBrace) {
					flushLiteral();
					return nodes;
				}
				errors.push("unmatched-close-brace");
				cursor += 1;
				continue;
			}

			if (char === "#" && inPluralBranch) {
				flushLiteral();
				nodes.push({ type: "pound" });
				cursor += 1;
				continue;
			}

			if (char === "{") {
				flushLiteral();
				nodes.push(parseArgument(inPluralBranch));
				continue;
			}

			literal += char;
			cursor += 1;
		}

		flushLiteral();
		if (stopAtBrace) {
			errors.push("unmatched-open-brace");
		}
		return nodes;
	}

	function parseArgument(inPluralBranch: boolean): IcuNode {
		cursor += 1;
		const nameStart = cursor;
		while (cursor < message.length && message[cursor] !== "," && message[cursor] !== "}") {
			cursor += 1;
		}
		const name = message.slice(nameStart, cursor).trim();
		if (cursor >= message.length) {
			errors.push("unmatched-open-brace");
			return { type: "argument", name };
		}
		if (message[cursor] === "}") {
			cursor += 1;
			return { type: "argument", name };
		}

		cursor += 1;
		const typeStart = cursor;
		while (cursor < message.length && message[cursor] !== "," && message[cursor] !== "}") {
			cursor += 1;
		}
		const formatType = message.slice(typeStart, cursor).trim();
		if (cursor >= message.length) {
			errors.push("unmatched-open-brace");
			return { type: "formatted", name, formatType };
		}
		if (message[cursor] === "}") {
			cursor += 1;
			return { type: "formatted", name, formatType };
		}

		cursor += 1;
		if (formatType === "plural" || formatType === "selectordinal" || formatType === "select") {
			const isPluralKind = formatType === "plural" || formatType === "selectordinal";
			skipWhitespace();
			if (isPluralKind && message.slice(cursor).startsWith("offset:")) {
				cursor += "offset:".length;
				skipWhitespace();
				while (cursor < message.length && /[-+\d.]/.test(message[cursor])) {
					cursor += 1;
				}
				skipWhitespace();
			}

			const branches: IcuBranch[] = [];
			while (cursor < message.length && message[cursor] !== "}") {
				const selectorStart = cursor;
				while (
					cursor < message.length &&
					!/\s/.test(message[cursor]) &&
					message[cursor] !== "{" &&
					message[cursor] !== "}"
				) {
					cursor += 1;
				}
				const selector = message.slice(selectorStart, cursor).trim();
				skipWhitespace();
				if (selector.length === 0 || message[cursor] !== "{") {
					errors.push(`invalid-branch:${name}`);
					break;
				}
				cursor += 1;
				const branchNodes = parseNodes(true, isPluralKind ? true : inPluralBranch);
				if (message[cursor] !== "}") {
					errors.push("unmatched-open-brace");
					break;
				}
				cursor += 1;
				branches.push({ selector, nodes: branchNodes });
				skipWhitespace();
			}

			if (message[cursor] === "}") {
				cursor += 1;
			} else {
				errors.push("unmatched-open-brace");
			}
			return { type: formatType, name, branches };
		}

		let depth = 1;
		while (cursor < message.length && depth > 0) {
			const char = message[cursor];
			if (char === "'") {
				if (message[cursor + 1] === "'") {
					cursor += 2;
					continue;
				}
				if (message[cursor + 1] === "{" || message[cursor + 1] === "}") {
					cursor += 1;
					while (cursor < message.length) {
						if (message[cursor] === "'") {
							if (message[cursor + 1] === "'") {
								cursor += 2;
								continue;
							}
							cursor += 1;
							break;
						}
						cursor += 1;
					}
					continue;
				}
			}
			if (char === "{") depth += 1;
			else if (char === "}") depth -= 1;
			cursor += 1;
		}
		if (depth !== 0) {
			errors.push("unmatched-open-brace");
		}
		return { type: "formatted", name, formatType };
	}

	const nodes = parseNodes(false, false);
	return { nodes, errors };
}

function collectPluralBlocks(nodes: readonly IcuNode[], out: IcuPluralBlock[] = []): IcuPluralBlock[] {
	for (const node of nodes) {
		if (node.type === "plural" || node.type === "selectordinal") {
			out.push({ kind: node.type, name: node.name, branches: node.branches });
			for (const branch of node.branches) {
				collectPluralBlocks(branch.nodes, out);
			}
		} else if (node.type === "select") {
			for (const branch of node.branches) {
				collectPluralBlocks(branch.nodes, out);
			}
		}
	}
	return out;
}

function nodesContainExplicitParam(nodes: readonly IcuNode[], param: string): boolean {
	for (const node of nodes) {
		if ((node.type === "argument" || node.type === "formatted") && node.name === param) return true;
		if (node.type === "select" || node.type === "plural" || node.type === "selectordinal") {
			if (node.branches.length > 0 && node.branches.every((branch) => nodesContainExplicitParam(branch.nodes, param))) {
				return true;
			}
		}
	}
	return false;
}

function branchInterpolatesPluralCount(nodes: readonly IcuNode[], pluralParam: string): boolean {
	for (const node of nodes) {
		if (node.type === "pound") return true;
		if ((node.type === "argument" || node.type === "formatted") && node.name === pluralParam) return true;
		if (node.type === "select") {
			if (
				node.branches.length > 0 &&
				node.branches.every((branch) => branchInterpolatesPluralCount(branch.nodes, pluralParam))
			) {
				return true;
			}
		}
		if (node.type === "plural" || node.type === "selectordinal") {
			if (
				node.branches.length > 0 &&
				node.branches.every((branch) => nodesContainExplicitParam(branch.nodes, pluralParam))
			) {
				return true;
			}
		}
	}
	return false;
}

function isExactNumericSelector(selector: string): boolean {
	return /^=-?\d+(?:\.\d+)?$/.test(selector);
}

function findPluralCountInterpolationIssues(
	sourceEntries: readonly CatalogEntryWithContext[],
	targetEntries: readonly CatalogEntryWithContext[],
): PluralCountInterpolationIssue[] {
	const targetByKey = new Map(targetEntries.map((entry) => [entryKey(entry), entry]));
	const issues: PluralCountInterpolationIssue[] = [];

	for (const sourceEntry of sourceEntries) {
		const targetEntry = targetByKey.get(entryKey(sourceEntry));
		if (!targetEntry) continue;

		const parsedSource = parseIcuMessage(sourceEntry.id);
		if (parsedSource.errors.length > 0) {
			issues.push({
				id: sourceEntry.id,
				context: sourceEntry.context,
				reason: `source ICU parse error: ${parsedSource.errors.join(", ")}`,
			});
			continue;
		}
		const sourcePlurals = collectPluralBlocks(parsedSource.nodes);
		if (sourcePlurals.length === 0) continue;

		const parsedTarget = parseIcuMessage(targetEntry.translation);
		if (parsedTarget.errors.length > 0) {
			issues.push({
				id: sourceEntry.id,
				context: sourceEntry.context,
				reason: `target ICU parse error: ${parsedTarget.errors.join(", ")}`,
			});
			continue;
		}
		const targetPlurals = collectPluralBlocks(parsedTarget.nodes);

		for (const sourcePlural of sourcePlurals) {
			const sourceHasCountInterpolation = sourcePlural.branches.some((branch) =>
				branchInterpolatesPluralCount(branch.nodes, sourcePlural.name),
			);
			if (!sourceHasCountInterpolation) continue;

			const sourceRequiresAllNonExact = sourcePlural.branches.every(
				(branch) =>
					isExactNumericSelector(branch.selector) || branchInterpolatesPluralCount(branch.nodes, sourcePlural.name),
			);

			const matchingTargetPlurals = targetPlurals.filter(
				(candidate) => candidate.kind === sourcePlural.kind && candidate.name === sourcePlural.name,
			);
			if (matchingTargetPlurals.length === 0) {
				issues.push({
					id: sourceEntry.id,
					context: sourceEntry.context,
					reason: `missing ${sourcePlural.kind} block for parameter "${sourcePlural.name}"`,
				});
				continue;
			}

			for (const targetPlural of matchingTargetPlurals) {
				const otherBranch = targetPlural.branches.find((branch) => branch.selector === "other");
				if (!otherBranch) {
					issues.push({
						id: sourceEntry.id,
						context: sourceEntry.context,
						reason: `plural "${sourcePlural.name}" is missing required "other" branch`,
					});
					continue;
				}
				if (!branchInterpolatesPluralCount(otherBranch.nodes, sourcePlural.name)) {
					issues.push({
						id: sourceEntry.id,
						context: sourceEntry.context,
						reason: `plural "${sourcePlural.name}" branch "other" is missing # or {${sourcePlural.name}}`,
					});
				}

				for (const branch of targetPlural.branches) {
					if (branch.selector === "other" || isExactNumericSelector(branch.selector)) continue;
					if (!sourceRequiresAllNonExact && branch.selector === "one") continue;
					if (!branchInterpolatesPluralCount(branch.nodes, sourcePlural.name)) {
						issues.push({
							id: sourceEntry.id,
							context: sourceEntry.context,
							reason: `plural "${sourcePlural.name}" branch "${branch.selector}" is missing # or {${sourcePlural.name}}`,
						});
					}
				}
			}
		}
	}

	return issues;
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

	it("catches missing plural count interpolation (# or explicit parameter) while allowing exact =N branches and locale categories", () => {
		const source = parseActiveEntriesWithContext(
			[
				'#: src/a.tsx\nmsgid "{0, plural, one {# order} other {# orders}}"\nmsgstr "{0, plural, one {# order} other {# orders}}"',
				'#: src/b.tsx\nmsgid "{orderCount, plural, one {Cancel the open order.} other {Cancel all # open orders.}}"\nmsgstr "{orderCount, plural, one {Cancel the open order.} other {Cancel all # open orders.}}"',
			].join("\n\n"),
		);

		const droppedArabicOtherPound = parseActiveEntriesWithContext(
			[
				'#: src/a.tsx\nmsgid "{0, plural, one {# order} other {# orders}}"\nmsgstr "{0, plural, one {# أمر} other {أوامر}}"',
				'#: src/b.tsx\nmsgid "{orderCount, plural, one {Cancel the open order.} other {Cancel all # open orders.}}"\nmsgstr "{orderCount, plural, =1 {将取消当前委托。} other {将取消全部 # 个当前委托。}}"',
			].join("\n\n"),
		);
		expect(findPluralCountInterpolationIssues(source, droppedArabicOtherPound)).toEqual([
			{
				id: "{0, plural, one {# order} other {# orders}}",
				context: "",
				reason: 'plural "0" branch "other" is missing # or {0}',
			},
		]);

		const quotedPoundAndDroppedOne = parseActiveEntriesWithContext(
			[
				'#: src/a.tsx\nmsgid "{0, plural, one {# order} other {# orders}}"\nmsgstr "{0, plural, one {أمر} other {\'#\' أوامر}}"',
				'#: src/b.tsx\nmsgid "{orderCount, plural, one {Cancel the open order.} other {Cancel all # open orders.}}"\nmsgstr "{orderCount, plural, one {Cette action annulera l\'ordre ouvert.} other {Cette action annulera les # ordres ouverts.}}"',
			].join("\n\n"),
		);
		expect(findPluralCountInterpolationIssues(source, quotedPoundAndDroppedOne)).toEqual([
			{
				id: "{0, plural, one {# order} other {# orders}}",
				context: "",
				reason: 'plural "0" branch "other" is missing # or {0}',
			},
			{
				id: "{0, plural, one {# order} other {# orders}}",
				context: "",
				reason: 'plural "0" branch "one" is missing # or {0}',
			},
		]);

		const validLocaleSpecificCategoriesAndExplicitParam = parseActiveEntriesWithContext(
			[
				'#: src/a.tsx\nmsgid "{0, plural, one {# order} other {# orders}}"\nmsgstr "{0, plural, =0 {لا توجد أوامر} one {# أمر} two {# أمران} few {# أوامر} many {{0} أمرًا} other {{0} أمر}}"',
				'#: src/b.tsx\nmsgid "{orderCount, plural, one {Cancel the open order.} other {Cancel all # open orders.}}"\nmsgstr "{orderCount, plural, =1 {将取消当前委托。} other {将取消全部 {orderCount} 个当前委托。}}"',
			].join("\n\n"),
		);
		expect(findPluralCountInterpolationIssues(source, validLocaleSpecificCategoriesAndExplicitParam)).toEqual([]);
	});

	it("keeps English active entries unique with consistent msgid and msgstr placeholders", () => {
		expect(englishEntries.length).toBeGreaterThan(0);
		expect(findCatalogKeyParityIssues(englishEntries, englishEntries)).toEqual({
			missing: [],
			extra: [],
			duplicateTargetKeys: [],
		});
		expect(findPlaceholderMismatches(englishEntries, englishEntries)).toEqual([]);
		expect(findPluralCountInterpolationIssues(englishEntries, englishEntries)).toEqual([]);
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
			expect(findPluralCountInterpolationIssues(englishEntries, localeEntries)).toEqual([]);
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

	it("renders Arabic plural order counts with the localized number from the real ar catalog", () => {
		const arEntries = parseActiveEntriesWithContext(readCatalog("ar"));
		const messages: Record<string, string> = {};
		for (const entry of arEntries) {
			messages[linguiId(entry.id, entry.context)] = entry.translation;
		}
		const localI18n = setupI18n({ locale: "ar", messages: { ar: messages } });
		const orderCountId = linguiId("{0, plural, one {# order} other {# orders}}");

		for (const count of [1, 5, 100]) {
			const rendered = localI18n._(orderCountId, { 0: count });
			const formattedCount = new Intl.NumberFormat("ar").format(count);
			expect(rendered).toContain(formattedCount);
			expect(rendered).not.toContain("#");
			expect(rendered).not.toContain("order");
		}
		expect(localI18n._(orderCountId, { 0: 5 })).toContain("أوامر");
	});
});
