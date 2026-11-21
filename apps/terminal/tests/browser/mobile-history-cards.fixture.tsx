import { i18n } from "@lingui/core";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { MobileFundingTab } from "@/components/trade/mobile/mobile-funding-tab";
import { MobileHistoryTab } from "@/components/trade/mobile/mobile-history-tab";
import { MobileOrdersHistoryTab } from "@/components/trade/mobile/mobile-orders-history-tab";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { messages as en } from "@/locales/en/messages.po";
import { messages as zh } from "@/locales/zh/messages.po";
import "./mobile-history-cards.css";

function Fixture() {
	return (
		<main className="bg-background text-fg">
			<section data-testid="trade-history">
				<MobileHistoryTab scrollMode="page" />
			</section>
			<section data-testid="order-history">
				<MobileOrdersHistoryTab scrollMode="page" />
			</section>
			<section data-testid="funding-history">
				<MobileFundingTab scrollMode="page" />
			</section>
		</main>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
const params = new URLSearchParams(location.search);
const locale = params.get("locale") === "zh" ? "zh" : "en";
i18n.loadAndActivate({ locale, messages: locale === "zh" ? zh : en });
document.documentElement.lang = locale;
document.documentElement.classList.toggle("dark", params.get("theme") !== "light");
const router = createRouter({
	routeTree: createRootRoute({ component: Fixture }),
	history: createMemoryHistory({ initialEntries: ["/"] }),
});
createI18nRoot(root).render(<RouterProvider router={router} />);
