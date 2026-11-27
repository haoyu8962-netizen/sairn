import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const translations = {
	ar: { "Distance from mid": "البُعد عن السعر الوسطي", Ask: "بيع", Bid: "شراء", "No orders": "لا توجد أوامر" },
	en: { "Distance from mid": "Distance from mid", Ask: "Ask", Bid: "Bid", "No orders": "No orders" },
	es: { "Distance from mid": "Distancia al precio medio", Ask: "Venta", Bid: "Compra", "No orders": "Sin órdenes" },
	fr: { "Distance from mid": "Écart au prix médian", Ask: "Vente", Bid: "Achat", "No orders": "Aucun ordre" },
	ja: { "Distance from mid": "仲値からの距離", Ask: "売り", Bid: "買い", "No orders": "注文なし" },
	ko: { "Distance from mid": "중간가와의 거리", Ask: "매도 호가", Bid: "매수 호가", "No orders": "주문 없음" },
	vi: { "Distance from mid": "Cách giá giữa", Ask: "Giá bán", Bid: "Giá mua", "No orders": "Không có lệnh" },
	hi: { "Distance from mid": "मध्य मूल्य से दूरी", Ask: "बिक्री", Bid: "खरीद", "No orders": "कोई ऑर्डर नहीं" },
	tr: { "Distance from mid": "Orta fiyata uzaklık", Ask: "Satış", Bid: "Alış", "No orders": "Emir yok" },
	ru: { "Distance from mid": "Расстояние от мида", Ask: "Аск", Bid: "Бид", "No orders": "Нет ордеров" },
	zh: { "Distance from mid": "距中间价", Ask: "卖盘", Bid: "买盘", "No orders": "暂无挂单" },
	"zh-TW": { "Distance from mid": "距中間價", Ask: "賣盤", Bid: "買盤", "No orders": "目前無掛單" },
} as const;

describe("orderbook catalogs", () => {
	for (const [locale, messages] of Object.entries(translations)) {
		const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");

		for (const [message, translation] of Object.entries(messages)) {
			it(`${locale} translates ${message}`, () => {
				expect(catalog).toContain(`msgid "${message}"\nmsgstr "${translation}"`);
			});
		}
	}
});
