import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Messages } from "@lingui/core";

const LOCALES_ROOT = resolve(__dirname, "../../../locales");

// One catalog entry: the source message and its `msgctxt`, or "" for a message without context.
export type CatalogEntry = readonly [message: string, context: string];

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Reads a single-line translation from the production catalog. Without a context it only matches the entry that has
// no `msgctxt`, so a test cannot pass by reading the contextual message of the same text.
export function readCatalogTranslation(locale: string, [message, context]: CatalogEntry): string {
	const catalog = readFileSync(resolve(LOCALES_ROOT, `${locale}/messages.po`), "utf8");
	const msgid = `msgid ${escapeRegExp(JSON.stringify(message))}`;
	const entry = context
		? `(?:^|\\n)msgctxt ${escapeRegExp(JSON.stringify(context))}\\n${msgid}`
		: `(?:^|\\n\\n)(?:#[^\\n]*\\n)*${msgid}`;
	const match = catalog.match(new RegExp(`${entry}\\nmsgstr (".*")\\n`));
	const translation = match ? (JSON.parse(match[1]) as string) : "";
	if (!translation) throw new Error(`No ${locale} translation for ${context ? `${context}:` : ""}${message}`);
	return translation;
}

// Lingui's generated message ID: the first six base64 characters of SHA-256 over message, unit separator and context.
export function getCatalogMessageId([message, context]: CatalogEntry): string {
	return createHash("sha256").update(`${message}\x1f${context}`).digest("base64").slice(0, 6);
}

export function loadCatalogMessages(locale: string, entries: readonly CatalogEntry[]): Messages {
	return Object.fromEntries(
		entries.map((entry) => [getCatalogMessageId(entry), readCatalogTranslation(locale, entry)]),
	);
}
