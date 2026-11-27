import type { LocaleCode } from "@/config/i18n";

export const STARTUP_FONT_SPECS = ['400 14px "Inter Variable"', '400 13px "IBM Plex Sans Variable"'];
export const MARKET_CLOSE_FONT_SPECS = ['400 10px "IBM Plex Sans Variable"', '600 13px "IBM Plex Sans Variable"'];
export const LANGUAGE_MENU_FONT_SPECS = ['500 13px "IBM Plex Sans Variable"'];
export const FONT_READY_TIMEOUT_MS = 3000;

// `FontFaceSet.load(spec)` without text loads only the faces that cover a space, i.e. the Latin subset. A language
// whose catalog also draws from other subsets lists one character per such subset here, so the startup wait loads
// them before the first render. `locale-font-subset-contract` derives the subsets from every catalog and fails when
// this list misses one or names one the catalog does not use.
export const LOCALE_FONT_SAMPLES: Readonly<Partial<Record<LocaleCode, string>>> = {
	vi: "ạă",
	tr: "ğ",
	ru: "Ж",
};

export function fontTextForLocale(locale: string): string | undefined {
	if (!Object.hasOwn(LOCALE_FONT_SAMPLES, locale)) return undefined;
	const sample = LOCALE_FONT_SAMPLES[locale as LocaleCode];
	return sample ? ` ${sample}` : undefined;
}

function getFontFaceSet(): FontFaceSet | undefined {
	if (typeof document === "undefined") return undefined;
	return document.fonts ?? undefined;
}

function loadSpec(fonts: FontFaceSet, spec: string, text: string | undefined) {
	return text === undefined ? fonts.load(spec) : fonts.load(spec, text);
}

export function areFontsReady(specs: readonly string[], text?: string): boolean {
	const fonts = getFontFaceSet();
	if (typeof fonts?.check !== "function") return true;
	return specs.every((spec) => (text === undefined ? fonts.check(spec) : fonts.check(spec, text)));
}

export function waitForFonts(
	specs: readonly string[],
	text?: string,
	timeoutMs = FONT_READY_TIMEOUT_MS,
): Promise<void> {
	const fonts = getFontFaceSet();
	if (typeof fonts?.load !== "function" || areFontsReady(specs, text)) return Promise.resolve();
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, timeoutMs);
		const settle = () => {
			clearTimeout(timer);
			resolve();
		};
		Promise.all(specs.map((spec) => loadSpec(fonts, spec, text))).then(settle, settle);
	});
}

export function warmFonts(specs: readonly string[], text: string): void {
	const fonts = getFontFaceSet();
	if (typeof fonts?.load !== "function" || areFontsReady(specs, text)) return;
	for (const spec of specs) loadSpec(fonts, spec, text).catch(() => undefined);
}
