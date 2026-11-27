import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MESSAGE = "{requestedPercent}% requested; {effectivePercent}% after size precision";
const EXPECTED_TRANSLATIONS = {
	"zh-TW": "已指定 {requestedPercent}%；受數量精度限制，實際為 {effectivePercent}%",
	ja: "指定 {requestedPercent}%、数量精度の適用後 {effectivePercent}%",
	ko: "{requestedPercent}% 요청; 수량 정밀도 적용 후 {effectivePercent}%",
	vi: "Yêu cầu {requestedPercent}%; thực tế {effectivePercent}% theo độ chính xác số lượng",
	ar: "طُلب {requestedPercent}٪؛ {effectivePercent}٪ بعد تطبيق دقة الحجم",
	es: "Se solicitó el {requestedPercent} %; queda en el {effectivePercent} % tras aplicar la precisión del tamaño",
	pt: "{requestedPercent}% solicitado; {effectivePercent}% após precisão de tamanho",
	fr: "{requestedPercent} % demandé ; {effectivePercent} % après application de la précision de taille",
	hi: "{requestedPercent}% अनुरोध किया गया; साइज़ की सटीकता लागू करने के बाद {effectivePercent}%",
	tr: "{requestedPercent}% istendi; miktar hassasiyetinden sonra {effectivePercent}%",
	ru: "Запрошено {requestedPercent}%; с учетом точности размера — {effectivePercent}%",
} as const;

const LEVERAGE_SUCCESS_MESSAGE = "Leverage updated to {leverage}x";
const EXPECTED_LEVERAGE_SUCCESS_TRANSLATIONS = {
	"zh-TW": "槓桿已更新為 {leverage}x",
	ja: "レバレッジを {leverage}x に更新しました",
	ko: "레버리지가 {leverage}x로 업데이트되었습니다",
	vi: "Đã cập nhật đòn bẩy thành {leverage}x",
	ar: "تم تحديث الرافعة المالية إلى {leverage}x",
	es: "Apalancamiento actualizado a {leverage}x",
	pt: "Alavancagem atualizada para {leverage}x",
	fr: "Effet de levier mis à jour à {leverage}x",
	hi: "लीवरेज {leverage}x पर अपडेट किया गया",
	tr: "Kaldıraç {leverage}x olarak güncellendi",
	ru: "Плечо обновлено до {leverage}x",
	zh: "杠杆已更新为 {leverage}x",
} as const;

describe("position-close effective-percent catalogs", () => {
	it.each(Object.entries(EXPECTED_TRANSLATIONS))(
		"keeps the %s translation and both placeholders",
		(locale, expected) => {
			const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");
			expect(catalog).toContain(`msgid "${MESSAGE}"\nmsgstr "${expected}"`);
			expect(expected).toContain("{requestedPercent}");
			expect(expected).toContain("{effectivePercent}");
		},
	);
});

describe("leverage-success catalogs", () => {
	it.each(Object.entries(EXPECTED_LEVERAGE_SUCCESS_TRANSLATIONS))(
		"keeps the %s translation and leverage placeholder",
		(locale, expected) => {
			const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");
			expect(catalog).toContain(`msgid "${LEVERAGE_SUCCESS_MESSAGE}"\nmsgstr "${expected}"`);
			expect(expected).toContain("{leverage}");
		},
	);
});
