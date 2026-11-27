import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const translations = {
	ar: {
		"Spot Dust Conversion": "تحويل أرصدة التداول الفوري المتبقية",
		"TWAP Slice": "شريحة من أمر TWAP",
		"Vault Close": "إغلاق مركز الخزنة",
	},
	es: {
		"Spot Dust Conversion": "Conversión de saldos residuales spot",
		"TWAP Slice": "Tramo de orden TWAP",
		"Vault Close": "Cierre de posición de la bóveda",
	},
	fr: {
		"Spot Dust Conversion": "Conversion des soldes spot résiduels",
		"TWAP Slice": "Tranche d'ordre TWAP",
		"Vault Close": "Clôture d'une position du coffre",
	},
	"zh-TW": {
		"Spot Dust Conversion": "現貨小額轉換",
		"TWAP Slice": "TWAP 分批委託",
		"Vault Close": "金庫平倉",
	},
	ja: {
		"Spot Dust Conversion": "現物の少額残高を変換",
		"TWAP Slice": "TWAP 分割注文",
		"Vault Close": "ボールトのポジション決済",
	},
	ko: {
		"Spot Dust Conversion": "현물 소액 잔고 전환",
		"TWAP Slice": "TWAP 분할 주문",
		"Vault Close": "볼트 포지션 종료",
	},
	vi: {
		"Spot Dust Conversion": "Quy đổi số dư lẻ giao ngay",
		"TWAP Slice": "Phân lệnh TWAP",
		"Vault Close": "Đóng vị thế Vault",
	},
	hi: {
		"Spot Dust Conversion": "शेष स्पॉट बैलेंस का रूपांतरण",
		"TWAP Slice": "TWAP ऑर्डर का भाग",
		"Vault Close": "वॉल्ट पोज़िशन बंद करना",
	},
	tr: {
		"Spot Dust Conversion": "Spot küçük bakiye dönüşümü",
		"TWAP Slice": "TWAP dilimi",
		"Vault Close": "Kasa kapatma",
	},
	ru: {
		"Spot Dust Conversion": "Конвертация мелких остатков (спот)",
		"TWAP Slice": "Фрагмент TWAP",
		"Vault Close": "Закрытие хранилищем",
	},
} as const;

describe("Hyperliquid order-label catalogs", () => {
	for (const [locale, messages] of Object.entries(translations)) {
		const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");

		for (const [message, translation] of Object.entries(messages)) {
			it(`${locale} translates ${message}`, () => {
				expect(catalog).toContain(`msgid "${message}"\nmsgstr "${translation}"`);
			});
		}
	}
});
