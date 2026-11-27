import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface PoEntry {
	context: string;
	message: string;
	translation: string;
	references: string[];
	flags: string[];
}

const FIELD = /^(msgctxt|msgid|msgstr) (".*")$/;

export function readPoEntries(locale: string): PoEntry[] {
	const catalog = readFileSync(resolve(process.cwd(), `src/locales/${locale}/messages.po`), "utf8");
	return catalog.split(/\n{2,}/).flatMap((block) => {
		const lines = block.split("\n");
		const fields = new Map<string, string>();
		let current: string | undefined;
		for (const line of lines) {
			const field = line.match(FIELD);
			if (field) {
				current = field[1];
				fields.set(current, JSON.parse(field[2]) as string);
			} else if (current !== undefined && line.startsWith('"')) {
				fields.set(current, `${fields.get(current)}${JSON.parse(line) as string}`);
			} else {
				current = undefined;
			}
		}
		const message = fields.get("msgid");
		if (!message) return [];
		return [
			{
				context: fields.get("msgctxt") ?? "",
				message,
				translation: fields.get("msgstr") ?? "",
				references: lines.filter((line) => line.startsWith("#: ")).map((line) => line.slice(3)),
				flags: lines.filter((line) => line.startsWith("#, ")).map((line) => line.slice(3)),
			},
		];
	});
}

export function linguiMessageId(message: string, context = ""): string {
	return createHash("sha256").update(`${message}\x1f${context}`).digest("base64").slice(0, 6);
}
