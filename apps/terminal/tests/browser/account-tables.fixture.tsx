import { i18n } from "@lingui/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { Responsive, useContainerWidth } from "react-grid-layout";
import { useDesktopGridLayout } from "@/components/trade/layout/use-desktop-grid-layout";
import { MobilePositionsView } from "@/components/trade/mobile/mobile-positions-view";
import { PositionsPanel } from "@/components/trade/positions/positions-panel";
import { useIsMobile } from "@/hooks/use-mobile";
import { createI18nRoot } from "@/lib/tests/harness/react";
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
import "react-grid-layout/css/styles.css";
import "./account-tables.css";

const catalogs = { en, zh, "zh-TW": zhTW, ja, ko, vi, id, hi, es, pt, fr, tr, ru, ar };

function DesktopWorkspace() {
	const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
	const { gridProps } = useDesktopGridLayout(width, mounted);
	return (
		<main ref={containerRef} className="min-h-svh bg-grid-container">
			{mounted && (
				<Responsive className="desktop-terminal-grid" {...gridProps}>
					<div key="favoriteCoins" className="desktop-grid-panel overflow-hidden bg-surface" />
					<div key="coinInfo" className="desktop-grid-panel overflow-hidden bg-surface" />
					<div key="chart" className="desktop-grid-panel overflow-hidden bg-surface" />
					<div key="marketData" className="desktop-grid-panel overflow-hidden bg-surface" />
					<div key="tradingInterface" className="desktop-grid-panel overflow-hidden bg-surface" />
					<div key="accountTable" data-panel="accountTable" className="desktop-grid-panel overflow-hidden bg-surface">
						<PositionsPanel />
					</div>
					<div key="accountInfo" className="account-panel-container desktop-grid-panel overflow-hidden bg-surface" />
				</Responsive>
			)}
		</main>
	);
}

function Fixture() {
	const mobile = useIsMobile();
	if (!mobile) return <DesktopWorkspace />;
	return (
		<main data-panel="mobileAccount" className="min-h-svh bg-background text-fg">
			<MobilePositionsView scrollMode="page" includeBottomNavSpacer={false} />
		</main>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
const params = new URLSearchParams(location.search);
const locale = params.get("locale") ?? "en";
if (!Object.hasOwn(catalogs, locale)) throw new Error(`Fixture has no catalog for ${locale}`);
i18n.loadAndActivate({ locale, messages: catalogs[locale as keyof typeof catalogs] });
document.documentElement.lang = locale;
document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
document.documentElement.classList.toggle("dark", params.get("theme") !== "light");
const router = createRouter({
	routeTree: createRootRoute({ component: Fixture }),
	history: createMemoryHistory({ initialEntries: ["/"] }),
});
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
createI18nRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<RouterProvider router={router} />
	</QueryClientProvider>,
);
