import { STORAGE_KEYS } from "@/config/app";
import { defaultLocale, isRtlLocale, isValidLocale, type LocaleCode } from "@/config/i18n";

export interface TerminalFatalCopy {
	description: string;
	heading: string;
	reload: string;
}

const BOOTSTRAP_FATAL_COPY: Readonly<Record<LocaleCode, TerminalFatalCopy>> = {
	en: {
		heading: "Something went wrong",
		description: "The terminal could not start safely. Reload it before trading.",
		reload: "Reload terminal",
	},
	zh: {
		heading: "出错了",
		description: "交易终端无法安全启动。请重新加载后再交易。",
		reload: "重新加载交易终端",
	},
	"zh-TW": {
		heading: "發生錯誤",
		description: "交易終端無法安全啟動。請重新載入後再交易。",
		reload: "重新載入交易終端",
	},
	ja: {
		heading: "エラーが発生しました",
		description: "取引ターミナルを安全に起動できませんでした。取引する前に再読み込みしてください。",
		reload: "ターミナルを再読み込み",
	},
	ko: {
		heading: "문제가 발생했습니다",
		description: "터미널을 안전하게 시작할 수 없습니다. 거래하기 전에 새로고침하세요.",
		reload: "터미널 새로고침",
	},
	vi: {
		heading: "Đã xảy ra lỗi",
		description: "Nền tảng giao dịch không thể khởi động an toàn. Hãy tải lại trước khi giao dịch.",
		reload: "Tải lại nền tảng giao dịch",
	},
	id: {
		heading: "Terjadi kesalahan",
		description: "Terminal tidak dapat dimulai secara aman. Muat ulang sebelum trading.",
		reload: "Muat ulang terminal",
	},
	hi: {
		heading: "कुछ गलत हो गया",
		description: "टर्मिनल सुरक्षित रूप से शुरू नहीं हो सका। ट्रेडिंग से पहले इसे फिर से लोड करें।",
		reload: "टर्मिनल फिर से लोड करें",
	},
	es: {
		heading: "Algo salió mal",
		description: "El terminal no pudo iniciarse de forma segura. Vuelva a cargarlo antes de operar.",
		reload: "Volver a cargar el terminal",
	},
	pt: {
		heading: "Algo deu errado",
		description: "Não foi possível iniciar o terminal com segurança. Recarregue-o antes de negociar.",
		reload: "Recarregar terminal",
	},
	fr: {
		heading: "Une erreur s'est produite",
		description: "Le terminal n’a pas pu démarrer en toute sécurité. Rechargez-le avant de trader.",
		reload: "Recharger le terminal",
	},
	tr: {
		heading: "Bir sorun oluştu",
		description: "Terminal güvenli bir şekilde başlatılamadı. İşlem yapmadan önce sayfayı yenileyin.",
		reload: "Terminali yenile",
	},
	ru: {
		heading: "Что-то пошло не так",
		description: "Не удалось безопасно запустить терминал. Перезагрузите его перед началом торговли.",
		reload: "Перезагрузить терминал",
	},
	ar: {
		heading: "حدث خطأ ما",
		description: "تعذّر تشغيل المنصة بأمان. أعد تحميلها قبل التداول.",
		reload: "إعادة تحميل المنصة",
	},
};

export function getBootstrapFatalCopy(locale: LocaleCode): TerminalFatalCopy {
	return BOOTSTRAP_FATAL_COPY[locale];
}

export function getBootstrapFatalLocale(storage: Pick<Storage, "getItem"> | null = getBrowserStorage()): LocaleCode {
	try {
		const stored = storage?.getItem(STORAGE_KEYS.LOCALE);
		return stored && isValidLocale(stored) ? stored : defaultLocale;
	} catch {
		return defaultLocale;
	}
}

export function getBootstrapFatalDirection(locale: LocaleCode): "ltr" | "rtl" {
	return isRtlLocale(locale) ? "rtl" : "ltr";
}

function getBrowserStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
