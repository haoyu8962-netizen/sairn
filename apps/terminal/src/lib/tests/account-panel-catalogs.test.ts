import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const EXPECTED_TRANSLATIONS = {
	en: {
		"Cross Maintenance Margin": "Cross Maintenance Margin",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"Transfers between Spot and Perps are unavailable in shared-balance account modes.",
	},
	zh: {
		"Cross Maintenance Margin": "全仓维持保证金",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"共享余额账户模式下无法在现货与永续之间划转。",
	},
	"zh-TW": {
		"Cross Maintenance Margin": "全倉維持保證金",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"在共享餘額帳戶模式下，無法於現貨與永續之間劃轉。",
	},
	es: {
		"Cross Maintenance Margin": "Margen de mantenimiento cruzado",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"Las transferencias entre Spot y Perps no están disponibles en los modos de cuenta con saldo compartido.",
	},
	pt: {
		"Cross Maintenance Margin": "Margem de manutenção cruzada",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"Transferências entre spot e perpétuos não estão disponíveis em modos de conta com saldo compartilhado.",
	},
	fr: {
		"Cross Maintenance Margin": "Marge de maintenance croisée",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"Les transferts entre Spot et Perps ne sont pas disponibles pour les comptes à solde partagé.",
	},
	ar: {
		"Cross Maintenance Margin": "هامش الصيانة المتقاطع",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"لا تتوفر التحويلات بين Spot وPerps في أوضاع الحساب ذات الرصيد المشترك.",
	},
	ja: {
		"Cross Maintenance Margin": "クロス維持証拠金",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"残高共有型のアカウントモードでは、現物と無期限先物の間で振替できません。",
	},
	ko: {
		"Cross Maintenance Margin": "교차 유지 증거금",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"공유 잔고 계정 모드에서는 현물과 무기한 선물 간 이체를 사용할 수 없습니다.",
	},
	vi: {
		"Cross Maintenance Margin": "Ký quỹ duy trì chéo",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"Không thể chuyển giữa giao ngay và vĩnh cửu ở các chế độ tài khoản dùng chung số dư.",
	},
	id: {
		"Cross Maintenance Margin": "Margin pemeliharaan cross",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"Transfer antara Spot dan Perps tidak tersedia dalam mode akun saldo bersama.",
	},
	hi: {
		"Cross Maintenance Margin": "क्रॉस मेंटेनेंस मार्जिन",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"साझा-बैलेंस खाता मोड में Spot और Perps के बीच ट्रांसफ़र उपलब्ध नहीं हैं।",
	},
	tr: {
		"Cross Maintenance Margin": "Çapraz sürdürme marjini",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"Ortak bakiyeli hesap modlarında Spot ve Vadeli arasında transfer yapılamaz.",
	},
	ru: {
		"Cross Maintenance Margin": "Поддерживающая кросс-маржа",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"Переводы между спотом и фьючерсами недоступны в режимах аккаунта с общим балансом.",
	},
} as const;

describe("account panel catalogs", () => {
	for (const [locale, messages] of Object.entries(EXPECTED_TRANSLATIONS)) {
		it(`keeps whole account-risk phrases translated in ${locale}`, () => {
			const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");
			for (const [message, translation] of Object.entries(messages)) {
				expect(catalog).toContain(`msgid "${message}"\nmsgstr "${translation}"`);
			}
		});
	}
});
