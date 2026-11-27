import { describe, expect, it } from "vitest";
import { resolveChartLocale } from "@/config/chart";
import { isRtlLocale, languageToIntlLocale } from "@/config/i18n";

describe("TradingView locale mapping", () => {
	it("uses Traditional Chinese dates and left-to-right presentation", () => {
		expect(languageToIntlLocale["zh-TW"]).toBe("zh-TW");
		expect(isRtlLocale("zh-TW")).toBe(false);
	});

	it("uses Japanese dates and left-to-right presentation", () => {
		expect(languageToIntlLocale.ja).toBe("ja-JP");
		expect(isRtlLocale("ja")).toBe(false);
	});

	it("uses Korean dates and left-to-right presentation", () => {
		expect(languageToIntlLocale.ko).toBe("ko-KR");
		expect(isRtlLocale("ko")).toBe(false);
	});

	it("uses Vietnamese dates and left-to-right presentation", () => {
		expect(languageToIntlLocale.vi).toBe("vi-VN");
		expect(isRtlLocale("vi")).toBe(false);
	});

	it("uses Indonesian dates and left-to-right presentation", () => {
		expect(languageToIntlLocale.id).toBe("id-ID");
		expect(isRtlLocale("id")).toBe(false);
	});

	it("uses Turkish dates and left-to-right presentation", () => {
		expect(languageToIntlLocale.tr).toBe("tr-TR");
		expect(isRtlLocale("tr")).toBe(false);
	});

	it("uses Russian dates and left-to-right presentation", () => {
		expect(languageToIntlLocale.ru).toBe("ru-RU");
		expect(isRtlLocale("ru")).toBe(false);
	});

	it("uses Portuguese dates and left-to-right presentation", () => {
		expect(languageToIntlLocale.pt).toBe("pt-BR");
		expect(isRtlLocale("pt")).toBe(false);
	});

	it.each([
		["en", "en"],
		["zh", "zh"],
		["zh-TW", "zh_TW"],
		["ja", "ja"],
		["ko", "ko"],
		["vi", "vi"],
		["id", "id_ID"],
		["es", "es"],
		["pt", "pt"],
		["fr", "fr"],
		["tr", "tr"],
		["ru", "ru"],
		["ar", "ar"],
		["hi", "en"],
		["unknown", "en"],
	])("maps %s to %s", (appLocale, chartLocale) => {
		expect(resolveChartLocale(appLocale)).toBe(chartLocale);
	});
});
