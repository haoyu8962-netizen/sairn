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

	it.each([
		["en", "en"],
		["zh", "zh"],
		["zh-TW", "zh_TW"],
		["ja", "ja"],
		["ko", "ko"],
		["vi", "vi"],
		["es", "es"],
		["fr", "fr"],
		["ar", "ar"],
		["hi", "en"],
		["unknown", "en"],
	])("maps %s to %s", (appLocale, chartLocale) => {
		expect(resolveChartLocale(appLocale)).toBe(chartLocale);
	});
});
