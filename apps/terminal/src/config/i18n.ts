export const locales = {
	en: "English",
	zh: "简体中文",
	"zh-TW": "繁體中文",
	ja: "日本語",
	ko: "한국어",
	vi: "Tiếng Việt",
	hi: "हिन्दी",
	es: "Español",
	fr: "Français",
	tr: "Türkçe",
	ru: "Русский",
	ar: "العربية",
} as const;

export type LocaleCode = keyof typeof locales;

export const localeList = Object.entries(locales).map(([code, name]) => ({
	code: code as LocaleCode,
	name,
}));

export const numberFormatLocales = {
	"en-US": "1,234.56",
	"de-DE": "1.234,56",
	"fr-FR": "1 234,56",
} as const;

export type NumberFormatLocale = keyof typeof numberFormatLocales;

export const numberFormatLocaleList = Object.entries(numberFormatLocales).map(([code, name]) => ({
	code: code as NumberFormatLocale,
	name,
}));

export const defaultNumberFormatLocale: NumberFormatLocale = "en-US";

export const numberSeparatorsByFormatLocale = {
	"en-US": { group: ",", decimal: "." },
	"de-DE": { group: ".", decimal: "," },
	"fr-FR": { group: " ", decimal: "," },
} as const satisfies Record<NumberFormatLocale, { group: string; decimal: string }>;

const legacyNumberFormatLocaleMap: Readonly<Record<string, NumberFormatLocale>> = {
	auto: "en-US",
	"en-US": "en-US",
	"en-GB": "en-US",
	"zh-CN": "en-US",
	"ja-JP": "en-US",
	"hi-IN": "en-US",
	"ar-SA": "en-US",
	"de-DE": "de-DE",
	"es-ES": "de-DE",
	"pt-BR": "de-DE",
	"fr-FR": "fr-FR",
	"ru-RU": "fr-FR",
};

/** Normalizes settings written by the previous locale-based number formatter. */
export function normalizeNumberFormatLocale(value: unknown): NumberFormatLocale {
	return typeof value === "string"
		? (legacyNumberFormatLocaleMap[value] ?? defaultNumberFormatLocale)
		: defaultNumberFormatLocale;
}

export const languageToIntlLocale: Record<LocaleCode, string> = {
	en: "en-US",
	zh: "zh-CN",
	"zh-TW": "zh-TW",
	ja: "ja-JP",
	ko: "ko-KR",
	vi: "vi-VN",
	hi: "hi-IN",
	es: "es-ES",
	fr: "fr-FR",
	tr: "tr-TR",
	ru: "ru-RU",
	ar: "ar-SA",
};

export const defaultLocale: LocaleCode = "en";

export const rtlLocales: ReadonlySet<LocaleCode> = new Set<LocaleCode>(["ar"]);

export function isRtlLocale(locale: string): boolean {
	return rtlLocales.has(locale as LocaleCode);
}

export function isValidLocale(locale: string): locale is LocaleCode {
	return Object.hasOwn(locales, locale);
}

const TRADITIONAL_CHINESE_SUBTAGS: ReadonlySet<string> = new Set(["hant", "tw", "hk", "mo"]);

/**
 * Whether a BCP 47 tag names Chinese written in Traditional characters (`zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant`, …).
 * Case and `_` separators are ignored, and an explicit Simplified script (`zh-Hans-HK`) wins over the region.
 */
export function isTraditionalChineseTag(tag: string): boolean {
	const [language, ...subtags] = tag.trim().toLowerCase().split(/[-_]/);
	if (language !== "zh" || subtags.includes("hans")) return false;
	return subtags.some((subtag) => TRADITIONAL_CHINESE_SUBTAGS.has(subtag));
}

export function resolveNumberFormatLocale(
	formatLocale: NumberFormatLocale,
	_activeLocale: LocaleCode = defaultLocale,
): string {
	return formatLocale;
}
