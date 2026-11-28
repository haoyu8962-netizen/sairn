import { i18n } from "@lingui/core";
import { useEffect } from "react";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { ReferralCodeCard } from "@/components/referrals/referral-code-card";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { type NumberFormatLocale, numberFormatLocales } from "@/config/i18n";
import { createI18nRoot } from "@/lib/tests/harness/react";
import type { ReferralData } from "@/lib/trade/referral";
import { messages as ar } from "@/locales/ar/messages.po";
import { messages as en } from "@/locales/en/messages.po";
import { messages as es } from "@/locales/es/messages.po";
import { messages as fr } from "@/locales/fr/messages.po";
import { messages as hi } from "@/locales/hi/messages.po";
import { messages as id } from "@/locales/id/messages.po";
import { messages as ja } from "@/locales/ja/messages.po";
import { messages as ko } from "@/locales/ko/messages.po";
import { messages as pt } from "@/locales/pt/messages.po";
import { messages as ru } from "@/locales/ru/messages.po";
import { messages as tr } from "@/locales/tr/messages.po";
import { messages as vi } from "@/locales/vi/messages.po";
import { messages as zh } from "@/locales/zh/messages.po";
import { messages as zhTW } from "@/locales/zh-TW/messages.po";
import { useGlobalSettingsActions } from "@/stores/use-global-settings-store";
import "./referral-code-card.css";

const catalogs = { en, zh, "zh-TW": zhTW, ja, ko, vi, id, pt, fr, es, hi, tr, ru, ar };
const params = new URLSearchParams(location.search);

const DATA: ReferralData = {
	referredBy: null,
	cumVlm: "25000",
	unclaimedRewards: "0",
	claimedRewards: "0",
	builderRewards: "0",
	referrerState: {
		stage: "ready",
		data: { code: params.get("code") ?? "SAIRN", nReferrals: 0, referralStates: [] },
	},
	rewardHistory: [],
	tokenToState: [],
};

const requestedNumberFormat = params.get("numberFormat");
if (requestedNumberFormat !== null && !Object.hasOwn(numberFormatLocales, requestedNumberFormat)) {
	throw new Error(`Fixture has no number format ${requestedNumberFormat}`);
}

function NumberFormatParameter({ value }: { value: NumberFormatLocale }) {
	const { setNumberFormatLocale } = useGlobalSettingsActions();
	useEffect(() => setNumberFormatLocale(value), [setNumberFormatLocale, value]);
	return null;
}

function Fixture() {
	return (
		<>
			{requestedNumberFormat === null ? null : (
				<NumberFormatParameter value={requestedNumberFormat as NumberFormatLocale} />
			)}
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/referrals"]}
				header={null}
				headerOffset={false}
				main={
					<section className="overflow-hidden rounded-24 bg-surface shadow-raised">
						<div className="grid grid-cols-1 gap-3 px-4 pb-4 min-[1001px]:grid-cols-[minmax(0,560px)_minmax(0,1fr)] min-[1001px]:gap-4 min-[1001px]:px-5 min-[1001px]:pb-0">
							<div className="order-1">
								<ReferralCodeCard
									actionsDisabled={false}
									data={DATA}
									onApplyCode={() => undefined}
									onCreateCode={() => undefined}
								/>
							</div>
						</div>
					</section>
				}
			/>
		</>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
const requested = params.get("locale") ?? "en";
if (!Object.hasOwn(catalogs, requested)) throw new Error(`Fixture has no catalog for ${requested}`);
const locale = requested as keyof typeof catalogs;
i18n.loadAndActivate({ locale, messages: catalogs[locale] });
document.documentElement.lang = locale;
document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
createI18nRoot(root).render(<Fixture />);
