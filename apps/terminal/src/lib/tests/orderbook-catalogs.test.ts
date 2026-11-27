import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ORDERBOOK_LABELS } from "@/config/orderbook-labels";
import { TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";

const translations = {
	ar: { "Distance from mid": "البُعد عن السعر الوسطي", Ask: "بيع", Bid: "شراء", "No orders": "لا توجد أوامر" },
	en: { "Distance from mid": "Distance from mid", Ask: "Ask", Bid: "Bid", "No orders": "No orders" },
	es: { "Distance from mid": "Distancia al precio medio", Ask: "Venta", Bid: "Compra", "No orders": "Sin órdenes" },
	pt: { "Distance from mid": "Distância do preço mid", Ask: "Venda", Bid: "Compra", "No orders": "Sem ordens" },
	fr: { "Distance from mid": "Écart au prix médian", Ask: "Vente", Bid: "Achat", "No orders": "Aucun ordre" },
	ja: { "Distance from mid": "仲値からの距離", Ask: "売り", Bid: "買い", "No orders": "注文なし" },
	ko: { "Distance from mid": "중간가와의 거리", Ask: "매도 호가", Bid: "매수 호가", "No orders": "주문 없음" },
	vi: { "Distance from mid": "Cách giá giữa", Ask: "Giá bán", Bid: "Giá mua", "No orders": "Không có lệnh" },
	id: { "Distance from mid": "Jarak dari harga tengah", Ask: "Ask", Bid: "Bid", "No orders": "Tidak ada order" },
	hi: { "Distance from mid": "मध्य मूल्य से दूरी", Ask: "बिक्री", Bid: "खरीद", "No orders": "कोई ऑर्डर नहीं" },
	tr: { "Distance from mid": "Orta fiyata uzaklık", Ask: "Satış", Bid: "Alış", "No orders": "Emir yok" },
	ru: { "Distance from mid": "Расстояние от мида", Ask: "Аск", Bid: "Бид", "No orders": "Нет ордеров" },
	zh: { "Distance from mid": "距中间价", Ask: "卖盘", Bid: "买盘", "No orders": "暂无挂单" },
	"zh-TW": { "Distance from mid": "距中間價", Ask: "賣盤", Bid: "買盤", "No orders": "目前無掛單" },
} as const;

const sizeTranslations = {
	ar: { form: "الحجم", column: "الحجم" },
	en: { form: "Size", column: "Size" },
	es: { form: "Tamaño", column: "Tamaño" },
	pt: { form: "Tamanho", column: "Tam." },
	fr: { form: "Taille", column: "Taille" },
	ja: { form: "数量", column: "数量" },
	ko: { form: "수량", column: "수량" },
	vi: { form: "Số lượng", column: "Lượng" },
	id: { form: "Ukuran", column: "Ukuran" },
	hi: { form: "आकार", column: "आकार" },
	tr: { form: "Miktar", column: "Miktar" },
	ru: { form: "Размер", column: "Размер" },
	zh: { form: "数量", column: "数量" },
	"zh-TW": { form: "數量", column: "數量" },
} as const;

function sizeEntries(catalog: string) {
	return catalog
		.split(/\n{2,}/)
		.map((block) => block.split("\n").filter((line) => !line.startsWith("#")))
		.filter((lines) => lines.includes('msgid "Size"'))
		.map((lines) => lines.join("\n"));
}

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

describe("order book size column heading", () => {
	it("does not share its message with the order form size label", () => {
		expect(ORDERBOOK_LABELS.size.id).not.toBe(TRADE_PANEL_LABELS.size.id);
	});

	for (const [locale, { form, column }] of Object.entries(sizeTranslations)) {
		const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");

		it(`${locale} keeps the shared Size and translates the column heading`, () => {
			expect(sizeEntries(catalog)).toEqual([
				`msgid "Size"\nmsgstr "${form}"`,
				`msgctxt "Order book column"\nmsgid "Size"\nmsgstr "${column}"`,
			]);
		});
	}
});
