import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { parseSource } from "./react-source";

// Reads one component source and reports everything in it that can present a state to the user as a
// warning, a failure or a status: announcers, warning icons, warning-coloured class tokens and tone
// props, status wording, raw error text and the fields that carry passive availability reasons.
// mobile-data-presentation-contract compares the result with a reviewed registry, so a new passive
// data notice in a covered file changes a count or adds a string and fails the contract.
//
// What it does not see is listed in docs/mobile-data-presentation.md (回归入口).

export interface PresentationMarkers {
	// Announcer roles, aria-live / aria-invalid / aria-errormessage, <output> and toast calls, by form.
	announcers: Record<string, number>;
	// References to warning-like icons, status glyphs and the Alert primitive, by identifier.
	icons: Record<string, number>;
	// Class tokens and CSS variables of the error, warning, danger and info families, and props that
	// select such a tone on a primitive (intent="error").
	tones: Record<string, number>;
	// User-facing strings that use status wording, by text.
	copy: Record<string, number>;
	// Reads that put raw error text on the screen (`.message`, `String(error)`, `${error}`).
	rawErrors: number;
	// Reads of the fields that hold passive availability reasons and labels.
	reasonFields: Record<string, number>;
}

export interface ScanOptions {
	// Text of the message descriptor behind `Imported.key`, when the import is a label object declared
	// in another module (`t(ORDERBOOK_LABELS.waiting)`).
	resolveImportedText?: (moduleSpecifier: string, exportName: string, property: string) => string | undefined;
}

const WARNING_ICON =
	/(Warning|XCircle|XSquare|XOctagon|Prohibit|Exclam|Info|Siren|Bug|Skull|SmileySad|Question|Hourglass|Clock(?!wise)|LinkBreak|LightningSlash|CloudX|CloudSlash|CloudWarning|PlugsX|WifiSlash|WifiX|WifiNone|WifiLow|CellSignalSlash|CellSignalX|CellSignalNone)\w*Icon$|^Alert\w*$/;
const STATUS_GLYPH = /^STATUS_GLYPH_(?!SUCCESS$)\w+$|^BRAND_MOTION_\w+$/;
const TONE_TOKEN =
	/^(?:text|bg|border|ring|outline|divide|stroke|fill|from|via|to|decoration|shadow|caret|accent|placeholder)-(?:(?:[a-z0-9]+-)*(?:error|warning|danger|info)(?:-[a-z0-9]+)*|(?:yellow|amber|orange|red)(?:-\d+)?)(?:\/\d+)?$/;
const TONE_VARIABLE = /--(?:[a-z0-9]+-)*(?:error|warning|danger)(?:-[a-z0-9]+)*/g;
const CLASS_TOKEN = /^[!a-z0-9[\]\-:./()%#_&>*,=+'"]+$/;
const WARNING_SYMBOL = /[⚠⛔⏳⌛❗❓❌]/u;
const ERROR_LIKE_NAME = /^(?:e|err|error|cause|reason)$|Error$/;
const REASON_FIELDS = new Set(["unavailableReason", "unavailableLabel"]);
const RAW_ERROR_FIELDS = new Set(["message", "shortMessage", "details"]);
const TONE_VALUES = new Set(["error", "warning", "danger", "attention", "destructive", "critical", "info"]);
const ANNOUNCER_ROLES = new Set(["alert", "status", "log", "marquee", "timer", "alertdialog"]);
const ANNOUNCER_ATTRIBUTES = new Set(["aria-live", "aria-invalid", "aria-errormessage"]);
// Attributes whose value is text for the user even when it is one bare word.
const TEXT_ATTRIBUTES = new Set([
	"placeholder",
	"aria-label",
	"aria-description",
	"aria-valuetext",
	"title",
	"alt",
	"label",
	"description",
	"message",
	"hint",
	"helperText",
	"tooltip",
	"error",
	"zero",
	"one",
	"two",
	"few",
	"many",
	"other",
]);
const UNTONED_ATTRIBUTES = /^(?:class|role|key|id|name|type|href|to|htmlFor|aria-.+|data-.+|.*[cC]lass(?:Name)?)$/;
const LINGUI_TAGS = new Set(["t", "msg", "defineMessage"]);
const TRANSLATE_CALLS = new Set(["t", "_"]);
const COMPARISON_OPERATORS = new Set([
	ts.SyntaxKind.EqualsEqualsEqualsToken,
	ts.SyntaxKind.ExclamationEqualsEqualsToken,
	ts.SyntaxKind.EqualsEqualsToken,
	ts.SyntaxKind.ExclamationEqualsToken,
]);
const BRANCH_OPERATORS = new Set([
	ts.SyntaxKind.AmpersandAmpersandToken,
	ts.SyntaxKind.BarBarToken,
	ts.SyntaxKind.QuestionQuestionToken,
]);

// Words a passive data notice is written with. A covered file may use them (an empty list says
// "No … found", a neutral control says "Retry"), but each string has to be registered with its reason.
const STATUS_WORDING = new RegExp(
	[
		"(?<!\\w)(?:",
		[
			"load(?:s|ed|ing)?",
			"reload(?:s|ed|ing)?",
			"refresh(?:es|ed|ing)?",
			"retry(?:ing)?",
			"retries",
			"try again",
			"try later",
			"hang on",
			"one moment",
			"stale",
			"outdated",
			"out[- ]of[- ]date",
			"cached",
			"last updated",
			"updating",
			"fetch(?:es|ed|ing)?",
			"delay(?:s|ed)?",
			"lag(?:s|ging)?",
			"paus(?:e|es|ed|ing)",
			"interrupt(?:s|ed|ion)?",
			"unavailable",
			"not available",
			"not ready",
			"fail(?:s|ed|ing|ure|ures)?",
			"errors?",
			"errored",
			"went wrong",
			"problems?",
			"issues?",
			"could(?:n't|n’t| not)",
			"unable",
			"cannot",
			"can't",
			"can’t",
			"reconnect(?:s|ed|ing)?",
			"disconnect(?:s|ed|ing)?",
			"connect(?:s|ed|ing)?",
			"connection",
			"offline",
			"online",
			"wait(?:s|ed|ing)?",
			"check(?:s|ed|ing)?",
			"verif(?:y|ies|ied|ying)",
			"pending",
			"sync(?:s|ed|ing)?",
			"unknown",
			"expir(?:e|es|ed|ing)",
			"timed[- ]out",
			"timeout",
			"temporarily",
			"warning",
			"caution",
			"no(?= )",
			"not found",
			"nothing",
			"empty",
			"missing",
			"n/a",
		].join("|"),
		")(?!\\w)",
	].join(""),
	"i",
);

function bump(record: Record<string, number>, key: string) {
	record[key] = (record[key] ?? 0) + 1;
}

function normalize(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function looksLikeClassList(text: string): boolean {
	const tokens = text.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return true;
	return tokens.every((token) => CLASS_TOKEN.test(token)) && tokens.some((token) => /[-:[]/.test(token));
}

function stripVariants(token: string): string {
	let depth = 0;
	let start = 0;
	for (let index = 0; index < token.length; index += 1) {
		const char = token[index];
		if (char === "[") depth += 1;
		else if (char === "]") depth -= 1;
		else if (char === ":" && depth === 0) start = index + 1;
	}
	return token.slice(start).replace(/^!/, "").replace(/!$/, "");
}

function templateText(template: ts.TemplateLiteral): string {
	if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text;
	return template.head.text + template.templateSpans.map((span) => `{…}${span.literal.text}`).join("");
}

function calleeName(expression: ts.Expression): string | null {
	if (ts.isIdentifier(expression)) return expression.text;
	if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
	return null;
}

function unwrap(expression: ts.Expression): ts.Expression {
	let current = expression;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isSatisfiesExpression(current) ||
		ts.isNonNullExpression(current)
	) {
		current = current.expression;
	}
	return current;
}

function isErrorLike(expression: ts.Expression): boolean {
	const target = unwrap(expression);
	if (ts.isIdentifier(target)) return ERROR_LIKE_NAME.test(target.text);
	if (ts.isPropertyAccessExpression(target)) return ERROR_LIKE_NAME.test(target.name.text);
	return false;
}

// The literals an expression can evaluate to. Operands of a comparison select a branch, they are not
// the value; nested elements and callbacks are read where they are rendered, not here.
function valueLiterals(node: ts.Node, visitor: (text: string) => void) {
	function walk(child: ts.Node) {
		if (ts.isBinaryExpression(child) && COMPARISON_OPERATORS.has(child.operatorToken.kind)) return;
		if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) return;
		if (ts.isFunctionLike(child) || ts.isCaseClause(child)) return;
		if (ts.isStringLiteralLike(child)) visitor(child.text);
		ts.forEachChild(child, walk);
	}
	walk(node);
}

// The literals an expression is, directly or as the branch of a conditional: `x ? "Stale" : y`.
function directLiterals(expression: ts.Expression, visitor: (text: string) => void) {
	const target = unwrap(expression);
	if (ts.isStringLiteralLike(target)) {
		visitor(target.text);
	} else if (ts.isConditionalExpression(target)) {
		directLiterals(target.whenTrue, visitor);
		directLiterals(target.whenFalse, visitor);
	} else if (ts.isBinaryExpression(target) && BRANCH_OPERATORS.has(target.operatorToken.kind)) {
		directLiterals(target.left, visitor);
		directLiterals(target.right, visitor);
	}
}

export function scanPresentationMarkers(
	source: string,
	fileName: string,
	options: ScanOptions = {},
): PresentationMarkers {
	const sourceFile = parseSource(source, fileName);
	const markers: PresentationMarkers = {
		announcers: {},
		icons: {},
		tones: {},
		copy: {},
		rawErrors: 0,
		reasonFields: {},
	};
	const imports = new Map<string, { module: string; imported: string }>();
	const iconAliases = new Set<string>();

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
		const bindings = statement.importClause?.namedBindings;
		if (!bindings || !ts.isNamedImports(bindings)) continue;
		for (const element of bindings.elements) {
			const imported = (element.propertyName ?? element.name).text;
			imports.set(element.name.text, { module: statement.moduleSpecifier.text, imported });
			if (WARNING_ICON.test(imported) || STATUS_GLYPH.test(imported)) iconAliases.add(element.name.text);
		}
	}

	function recordTones(text: string) {
		for (const token of text.split(/\s+/)) {
			if (!token || !CLASS_TOKEN.test(token)) continue;
			const bare = stripVariants(token);
			if (TONE_TOKEN.test(bare)) bump(markers.tones, bare);
		}
		for (const match of text.match(TONE_VARIABLE) ?? []) bump(markers.tones, match);
	}

	function recordCopy(text: string, always: boolean) {
		const normalized = normalize(text);
		if (!normalized) return;
		if (WARNING_SYMBOL.test(normalized)) {
			bump(markers.copy, normalized);
			return;
		}
		if (!/[A-Za-z]/.test(normalized)) return;
		if (!always && (!/\s/.test(normalized) || looksLikeClassList(normalized))) return;
		if (STATUS_WORDING.test(normalized)) bump(markers.copy, normalized);
	}

	// A bare word is only text for the user in the positions that call this; a literal with a space in
	// it is read once, where the walk reaches it.
	function recordBareWord(text: string) {
		const normalized = normalize(text);
		if (!/\s/.test(normalized) && !WARNING_SYMBOL.test(normalized)) recordCopy(text, true);
	}

	function recordAttribute(name: string, initializer: ts.Node | undefined) {
		if (ANNOUNCER_ATTRIBUTES.has(name)) bump(markers.announcers, name);
		if (!initializer) return;
		if (name === "role") {
			valueLiterals(initializer, (text) => {
				if (ANNOUNCER_ROLES.has(text)) bump(markers.announcers, `role="${text}"`);
			});
			return;
		}
		if (TEXT_ATTRIBUTES.has(name)) {
			const expression = ts.isJsxExpression(initializer) ? initializer.expression : initializer;
			if (expression && ts.isExpression(expression)) directLiterals(expression, recordBareWord);
			return;
		}
		if (!UNTONED_ATTRIBUTES.test(name)) {
			valueLiterals(initializer, (text) => {
				if (TONE_VALUES.has(text)) bump(markers.tones, `${name}="${text}"`);
			});
		}
	}

	function recordJsxText(children: ts.NodeArray<ts.JsxChild>) {
		if (!children.some((child) => ts.isJsxText(child) && /[A-Za-z]/.test(child.text))) return;
		recordCopy(children.map((child) => (ts.isJsxText(child) ? child.text : "{…}")).join(""), true);
	}

	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
		if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;

		if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
			recordJsxText(node.children);
			if (ts.isJsxElement(node)) visit(node.openingElement);
			for (const child of node.children) {
				if (ts.isJsxText(child)) continue;
				if (ts.isJsxExpression(child) && child.expression) directLiterals(child.expression, recordBareWord);
				visit(child);
			}
			return;
		}

		if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
			if (node.tagName.getText() === "output") bump(markers.announcers, "<output>");
			for (const attribute of node.attributes.properties) {
				if (ts.isJsxAttribute(attribute)) {
					recordAttribute(attribute.name.getText(), attribute.initializer);
				} else if (ts.isObjectLiteralExpression(attribute.expression)) {
					for (const property of attribute.expression.properties) {
						if (!ts.isPropertyAssignment(property)) continue;
						const name = property.name;
						if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) recordAttribute(name.text, property.initializer);
					}
				}
			}
		}

		if (ts.isIdentifier(node) && !ts.isJsxClosingElement(node.parent)) {
			if (WARNING_ICON.test(node.text) || STATUS_GLYPH.test(node.text) || iconAliases.has(node.text)) {
				bump(markers.icons, node.text);
			}
		}

		if (ts.isPropertyAccessExpression(node)) {
			if (RAW_ERROR_FIELDS.has(node.name.text)) markers.rawErrors += 1;
			if (REASON_FIELDS.has(node.name.text)) bump(markers.reasonFields, node.name.text);
			const owner = ts.isIdentifier(node.expression) ? imports.get(node.expression.text) : undefined;
			const text = owner && options.resolveImportedText?.(owner.module, owner.imported, node.name.text);
			if (text) recordCopy(text, true);
		}

		if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
			if (RAW_ERROR_FIELDS.has(node.argumentExpression.text)) markers.rawErrors += 1;
			if (REASON_FIELDS.has(node.argumentExpression.text)) bump(markers.reasonFields, node.argumentExpression.text);
		}

		if (ts.isBindingElement(node)) {
			const property = node.propertyName ?? node.name;
			if (ts.isIdentifier(property)) {
				if (property.text === "message") markers.rawErrors += 1;
				if (REASON_FIELDS.has(property.text)) bump(markers.reasonFields, property.text);
			}
		}

		if (ts.isShorthandPropertyAssignment(node) && REASON_FIELDS.has(node.name.text)) {
			bump(markers.reasonFields, node.name.text);
		}

		if (ts.isCallExpression(node)) {
			const callee = node.expression;
			const [first] = node.arguments;
			if (ts.isIdentifier(callee) && callee.text === "toast") bump(markers.announcers, "toast()");
			if (
				ts.isPropertyAccessExpression(callee) &&
				ts.isIdentifier(callee.expression) &&
				callee.expression.text === "toast" &&
				callee.name.text !== "dismiss"
			) {
				bump(markers.announcers, `toast.${callee.name.text}()`);
			}
			if (first && ts.isIdentifier(callee) && callee.text === "String" && isErrorLike(first)) markers.rawErrors += 1;
			if (ts.isPropertyAccessExpression(callee) && callee.name.text === "toString" && isErrorLike(callee.expression)) {
				markers.rawErrors += 1;
			}
			const name = calleeName(callee);
			if (first && name && TRANSLATE_CALLS.has(name) && ts.isStringLiteralLike(first)) recordBareWord(first.text);
		}

		if (ts.isTaggedTemplateExpression(node)) {
			const tag = calleeName(node.tag);
			const text = templateText(node.template);
			if (tag && LINGUI_TAGS.has(tag)) {
				recordCopy(text, true);
			} else {
				recordTones(text);
				recordCopy(text, false);
			}
			visit(node.tag);
			if (ts.isTemplateExpression(node.template)) {
				for (const span of node.template.templateSpans) visit(span.expression);
			}
			return;
		}

		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
			const parent = node.parent;
			const isMessageProperty =
				ts.isPropertyAssignment(parent) &&
				parent.initializer === node &&
				ts.isIdentifier(parent.name) &&
				parent.name.text === "message";
			recordTones(node.text);
			recordCopy(node.text, isMessageProperty);
			return;
		}

		if (ts.isTemplateExpression(node)) {
			const text = templateText(node);
			recordTones(text);
			recordCopy(text, false);
			for (const span of node.templateSpans) {
				if (isErrorLike(span.expression)) markers.rawErrors += 1;
				visit(span.expression);
			}
			return;
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return markers;
}

// Reads `export const NAME = { key: msg`…` }` (also t`…` and `{ message: "…" }`) from a label module.
export function readDescriptorText(source: string, fileName: string, exportName: string, property: string) {
	const sourceFile = parseSource(source, fileName);
	let found: string | undefined;

	function descriptorText(expression: ts.Expression): string | undefined {
		const target = unwrap(expression);
		if (ts.isTaggedTemplateExpression(target)) return templateText(target.template);
		if (ts.isStringLiteralLike(target)) return target.text;
		if (ts.isCallExpression(target) && target.arguments[0]) return descriptorText(target.arguments[0]);
		if (ts.isObjectLiteralExpression(target)) {
			for (const member of target.properties) {
				if (!ts.isPropertyAssignment(member)) continue;
				if (ts.isIdentifier(member.name) && member.name.text === "message") return descriptorText(member.initializer);
			}
		}
		return undefined;
	}

	function visit(node: ts.Node) {
		if (found !== undefined) return;
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === exportName &&
			node.initializer
		) {
			const value = unwrap(node.initializer);
			if (ts.isObjectLiteralExpression(value)) {
				for (const member of value.properties) {
					if (!ts.isPropertyAssignment(member)) continue;
					const name = member.name;
					if ((ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && name.text === property) {
						found = descriptorText(member.initializer);
					}
				}
			}
			return;
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return found;
}

// Resolves `@/…` label modules under the application source root.
export function createImportedTextResolver(sourceRoot: string): NonNullable<ScanOptions["resolveImportedText"]> {
	const sources = new Map<string, string>();
	return (moduleSpecifier, exportName, property) => {
		if (!moduleSpecifier.startsWith("@/")) return undefined;
		const base = resolve(sourceRoot, moduleSpecifier.slice(2));
		const file = [`${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate));
		if (!file) return undefined;
		let source = sources.get(file);
		if (source === undefined) {
			source = readFileSync(file, "utf8");
			sources.set(file, source);
		}
		return readDescriptorText(source, file, exportName, property);
	};
}

export function isEmptyMarkers(markers: PresentationMarkers): boolean {
	return (
		Object.keys(markers.announcers).length === 0 &&
		Object.keys(markers.icons).length === 0 &&
		Object.keys(markers.tones).length === 0 &&
		Object.keys(markers.copy).length === 0 &&
		Object.keys(markers.reasonFields).length === 0 &&
		markers.rawErrors === 0
	);
}
