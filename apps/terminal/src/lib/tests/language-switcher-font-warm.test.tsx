// @vitest-environment jsdom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "@/components/trade/header/language-switcher";
import { localeList } from "@/config/i18n";
import { LANGUAGE_MENU_FONT_SPECS } from "@/lib/fonts/font-readiness";

const i18nMocks = vi.hoisted(() => ({ dynamicActivate: vi.fn((_locale: string) => Promise.resolve(true)) }));
vi.mock("@/lib/i18n", () => i18nMocks);

let host: HTMLDivElement;
let root: Root;
let load: ReturnType<typeof vi.fn>;

function pointerEvent(type: string) {
	const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 4, clientY: 4 });
	Object.defineProperties(event, {
		isPrimary: { value: true },
		pointerId: { value: 1 },
		pointerType: { value: "mouse" },
	});
	return event;
}

function trigger() {
	const button = host.querySelector("button");
	if (!button) throw new Error("language trigger missing");
	return button;
}

beforeEach(() => {
	i18nMocks.dynamicActivate.mockClear();
	i18n.loadAndActivate({ locale: "en", messages: {} });
	load = vi.fn(() => Promise.resolve([]));
	Object.defineProperty(document, "fonts", { configurable: true, value: { check: () => false, load } });
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	act(() =>
		root.render(
			<I18nProvider i18n={i18n}>
				<LanguageSwitcher />
			</I18nProvider>,
		),
	);
});

afterEach(() => {
	act(() => root.unmount());
	host.remove();
	Reflect.deleteProperty(document, "fonts");
});

it("loads nothing for the menu before the user reaches its trigger", () => {
	expect(load).not.toHaveBeenCalled();
});

it.each([
	["a pointer entering", () => trigger().dispatchEvent(pointerEvent("pointerover"))],
	["a press", () => trigger().dispatchEvent(pointerEvent("pointerdown"))],
	["keyboard focus", () => trigger().focus()],
])("warms the menu font for every native language name on %s", (_intent, act_) => {
	act(() => act_());
	expect(load).toHaveBeenCalled();
	for (const [spec, text] of load.mock.calls as Array<[string, string]>) {
		expect(spec).toBe(LANGUAGE_MENU_FONT_SPECS[0]);
		for (const { name } of localeList) expect(text).toContain(name);
	}
});

it("still opens the menu from the keyboard after warming and switches language", async () => {
	act(() => trigger().focus());
	await act(async () => trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
	expect(trigger().getAttribute("aria-expanded")).toBe("true");
	const item = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(
		(element) => element.textContent?.trim() === "Tiếng Việt",
	);
	expect(item).toBeDefined();
	await act(async () => item?.click());
	expect(i18nMocks.dynamicActivate).toHaveBeenCalledWith("vi");
});

// jsdom cannot replay a real pointer press: synthetic pointerdown/pointerup keep this Base UI menu closed with or
// without the warm handlers, so the press path is checked in a browser (ADR 0059) and this case uses a mouse click.
it("still opens the menu on a mouse click after a pointer entering warmed it", async () => {
	await act(async () => {
		trigger().dispatchEvent(pointerEvent("pointerover"));
		trigger().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
		trigger().dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
		trigger().click();
	});
	expect(load).toHaveBeenCalled();
	expect(trigger().getAttribute("aria-expanded")).toBe("true");
	expect(document.body.textContent).toContain("Tiếng Việt");
});
