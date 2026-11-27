// @vitest-environment jsdom
import { i18n } from "@lingui/core";
import { act, type ComponentType, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { StartupFallback } from "@/components/startup-fallback";
import { Route } from "@/routes/__root";

const state = vi.hoisted(() => ({
	pathname: "/trade/BTC",
	gateReady: false,
	runtimeReady: false,
	persistedLocale: "zh",
	finishLocale: () => {},
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	useRouterState: () => state.pathname,
	Outlet: () => <header>交易</header>,
}));
vi.mock("@/providers/root", () => ({
	ClientRuntimeGate: ({ children, fallback }: { children: ReactNode; fallback: ReactNode }) =>
		state.gateReady ? children : fallback,
}));
vi.mock("@/providers/client-runtime", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/providers/client-runtime")>()),
	useClientRuntimeReady: () => state.runtimeReady,
}));
vi.mock("@/providers/exchange-scope", () => ({
	ExchangeScopeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/hyperliquid/hooks/MarketsInfoProvider", () => ({
	MarketsInfoProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/i18n", () => ({
	LOCALE_CATALOG_READY_TIMEOUT_MS: 3000,
	getPersistedLocale: () => state.persistedLocale,
	i18nReady: {
		finally: (callback: () => void) => {
			state.finishLocale = callback;
		},
	},
}));
vi.mock("@/bones/registry", () => ({}));
vi.mock("@/components/app-runtime-overlays", () => ({ AppRuntimeOverlays: () => null, DocumentOverlays: () => null }));
const RootComponent = Route.options.component as ComponentType;

beforeEach(() => {
	state.gateReady = false;
	state.runtimeReady = false;
	state.persistedLocale = "zh";
	i18n.loadAndActivate({ locale: "en", messages: {} });
});

it.each(["/trade/BTC", "/portfolio", "/vaults"])(
	"hydrates the identical empty application fallback at %s without recoverable errors",
	async (pathname) => {
		state.pathname = pathname;
		const host = document.createElement("div");
		const html = renderToString(<RootComponent />);
		expect(html).toBe(renderToString(<StartupFallback />));
		host.innerHTML = html;
		expect(host.querySelector('header,nav,footer,button,input,svg,img,[role="img"]')).toBeNull();
		expect(host.querySelectorAll("output")).toHaveLength(1);
		expect(host.querySelector("output")?.className).toBe("sr-only");
		expect(host.firstElementChild?.getAttribute("aria-busy")).toBe("true");
		const onRecoverableError = vi.fn();
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			await act(async () => {
				root = hydrateRoot(host, <RootComponent />, { onRecoverableError });
			});
			expect(onRecoverableError).not.toHaveBeenCalled();
			expect(host.innerHTML).toBe(html);
		} finally {
			act(() => root?.unmount());
		}
	},
);

it.each(["/trade/BTC", "/portfolio", "/vaults"])(
	"keeps %s empty through all gates and reveals only the persisted locale",
	(pathname) => {
		state.pathname = pathname;
		const host = document.createElement("div");
		const root = createRoot(host);
		function render() {
			act(() => root.render(<RootComponent key={`${state.gateReady}:${state.runtimeReady}`} />));
		}
		function expectEmpty() {
			expect(host.innerHTML).toBe(renderToString(<StartupFallback />));
			expect(host.querySelector("nav,header,footer")).toBeNull();
		}
		try {
			render();
			expectEmpty();
			state.gateReady = true;
			render();
			expectEmpty();
			state.runtimeReady = true;
			render();
			expectEmpty();
			act(() => {
				i18n.loadAndActivate({ locale: "zh", messages: {} });
				state.finishLocale();
			});
			render();
			expect(host.textContent).toBe("交易");
			expect(host.textContent).not.toContain("Trade");
		} finally {
			act(() => root.unmount());
		}
	},
);

it("reveals /trade/BTC when the locale and fonts became usable between the first render and its effect", () => {
	state.pathname = "/trade/BTC";
	state.gateReady = true;
	state.runtimeReady = true;
	i18n.loadAndActivate({ locale: "zh", messages: {} });
	let checks = 0;
	const load = vi.fn(() => new Promise<void>(() => {}));
	Object.defineProperty(document, "fonts", {
		configurable: true,
		value: {
			check: () => {
				checks += 1;
				return checks > 1;
			},
			load,
		},
	});
	const host = document.createElement("div");
	const root = createRoot(host);
	try {
		act(() => root.render(<RootComponent />));
		expect(host.textContent).toBe("交易");
		expect(load).not.toHaveBeenCalled();
	} finally {
		act(() => root.unmount());
		Reflect.deleteProperty(document, "fonts");
	}
});

it("keeps /trade/BTC empty until the persisted locale and the startup fonts are both usable", async () => {
	state.pathname = "/trade/BTC";
	state.gateReady = true;
	state.runtimeReady = true;
	const resolvers: Array<() => void> = [];
	const load = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				resolvers.push(resolve);
			}),
	);
	Object.defineProperty(document, "fonts", { configurable: true, value: { check: () => false, load } });
	const host = document.createElement("div");
	const root = createRoot(host);
	try {
		act(() => root.render(<RootComponent />));
		expect(host.innerHTML).toBe(renderToString(<StartupFallback />));
		expect(load.mock.calls).toStrictEqual([['400 14px "Inter Variable"'], ['400 13px "IBM Plex Sans Variable"']]);
		act(() => {
			i18n.loadAndActivate({ locale: "zh", messages: {} });
			state.finishLocale();
		});
		expect(host.innerHTML).toBe(renderToString(<StartupFallback />));
		await act(async () => {
			for (const resolve of resolvers) resolve();
		});
		expect(host.textContent).toBe("交易");
	} finally {
		act(() => root.unmount());
		Reflect.deleteProperty(document, "fonts");
	}
});

it("also waits for the font subsets the persisted language draws beyond Latin", async () => {
	state.pathname = "/trade/BTC";
	state.gateReady = true;
	state.runtimeReady = true;
	state.persistedLocale = "vi";
	const resolvers: Array<() => void> = [];
	const loaded = new Set<string>();
	const load = vi.fn(
		(spec: string, text?: string) =>
			new Promise<void>((resolve) => {
				resolvers.push(() => {
					loaded.add(`${spec}|${text}`);
					resolve();
				});
			}),
	);
	const check = vi.fn((spec: string, text?: string) => text === undefined || loaded.has(`${spec}|${text}`));
	Object.defineProperty(document, "fonts", { configurable: true, value: { check, load } });
	const host = document.createElement("div");
	const root = createRoot(host);
	try {
		act(() => root.render(<RootComponent />));
		expect(load.mock.calls).toEqual([
			['400 14px "Inter Variable"', " ạă"],
			['400 13px "IBM Plex Sans Variable"', " ạă"],
		]);
		act(() => {
			i18n.loadAndActivate({ locale: "vi", messages: {} });
			state.finishLocale();
		});
		expect(host.innerHTML).toBe(renderToString(<StartupFallback />));
		await act(async () => {
			resolvers[0]?.();
		});
		expect(host.innerHTML).toBe(renderToString(<StartupFallback />));
		await act(async () => {
			resolvers[1]?.();
		});
		expect(host.textContent).toBe("交易");
	} finally {
		act(() => root.unmount());
		Reflect.deleteProperty(document, "fonts");
	}
});

it("does not skip the subset wait when the persisted catalog and the Latin faces are already usable", async () => {
	state.pathname = "/trade/BTC";
	state.gateReady = true;
	state.runtimeReady = true;
	state.persistedLocale = "vi";
	i18n.loadAndActivate({ locale: "vi", messages: {} });
	const resolvers: Array<() => void> = [];
	const load = vi.fn(
		(_spec: string, _text?: string) =>
			new Promise<void>((resolve) => {
				resolvers.push(resolve);
			}),
	);
	Object.defineProperty(document, "fonts", {
		configurable: true,
		value: { check: (_spec: string, text?: string) => text === undefined, load },
	});
	const host = document.createElement("div");
	const root = createRoot(host);
	try {
		act(() => root.render(<RootComponent />));
		expect(host.innerHTML).toBe(renderToString(<StartupFallback />));
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => {
			for (const resolve of resolvers) resolve();
		});
		expect(host.textContent).toBe("交易");
	} finally {
		act(() => root.unmount());
		Reflect.deleteProperty(document, "fonts");
	}
});

it("reveals /trade/BTC in English when the persisted catalog does not arrive within its cap, and keeps it revealed when it does", () => {
	vi.useFakeTimers();
	state.pathname = "/trade/BTC";
	state.gateReady = true;
	state.runtimeReady = true;
	const host = document.createElement("div");
	const root = createRoot(host);
	try {
		act(() => root.render(<RootComponent />));
		expect(host.innerHTML).toBe(renderToString(<StartupFallback />));
		act(() => {
			vi.advanceTimersByTime(2999);
		});
		expect(host.innerHTML).toBe(renderToString(<StartupFallback />));
		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(i18n.locale).toBe("en");
		expect(host.textContent).toBe("交易");
		const revealed = host.firstElementChild;
		act(() => {
			i18n.loadAndActivate({ locale: "zh", messages: {} });
			state.finishLocale();
		});
		expect(host.textContent).toBe("交易");
		expect(host.firstElementChild).toBe(revealed);
	} finally {
		act(() => root.unmount());
		vi.useRealTimers();
	}
});
