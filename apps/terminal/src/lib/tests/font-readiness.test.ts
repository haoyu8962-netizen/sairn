// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	areFontsReady,
	FONT_READY_TIMEOUT_MS,
	fontTextForLocale,
	LANGUAGE_MENU_FONT_SPECS,
	MARKET_CLOSE_FONT_SPECS,
	STARTUP_FONT_SPECS,
	waitForFonts,
	warmFonts,
} from "@/lib/fonts/font-readiness";

function installFontFaceSet(fonts: Partial<FontFaceSet>) {
	Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
}

afterEach(() => {
	Reflect.deleteProperty(document, "fonts");
	vi.useRealTimers();
});

describe("areFontsReady", () => {
	it("treats a browser without the CSS Font Loading API as ready", () => {
		expect(areFontsReady(STARTUP_FONT_SPECS)).toBe(true);
	});

	it("requires every spec to be loaded", () => {
		installFontFaceSet({ check: (spec) => spec.includes("Inter") });
		expect(areFontsReady(STARTUP_FONT_SPECS)).toBe(false);
		installFontFaceSet({ check: () => true });
		expect(areFontsReady(STARTUP_FONT_SPECS)).toBe(true);
	});
});

describe("waitForFonts", () => {
	it("resolves immediately when the faces are already loaded", async () => {
		const load = vi.fn();
		installFontFaceSet({ check: () => true, load });
		await expect(waitForFonts(STARTUP_FONT_SPECS)).resolves.toBeUndefined();
		expect(load).not.toHaveBeenCalled();
	});

	it("loads every spec and resolves once all of them settle", async () => {
		const resolvers: Array<() => void> = [];
		const load = vi.fn(
			(_spec: string) =>
				new Promise<FontFace[]>((resolve) => {
					resolvers.push(() => resolve([]));
				}),
		);
		installFontFaceSet({ check: () => false, load });
		let settled = false;
		const wait = waitForFonts(MARKET_CLOSE_FONT_SPECS).then(() => {
			settled = true;
		});
		expect(load.mock.calls.map(([spec]) => spec)).toEqual(MARKET_CLOSE_FONT_SPECS);
		resolvers[0]?.();
		await Promise.resolve();
		expect(settled).toBe(false);
		resolvers[1]?.();
		await wait;
		expect(settled).toBe(true);
	});

	it("resolves when a face fails to load", async () => {
		installFontFaceSet({ check: () => false, load: () => Promise.reject(new Error("blocked")) });
		await expect(waitForFonts(STARTUP_FONT_SPECS)).resolves.toBeUndefined();
	});

	it("gives up after the block timeout so a stalled font never holds the page", async () => {
		vi.useFakeTimers();
		installFontFaceSet({ check: () => false, load: () => new Promise(() => {}) });
		let settled = false;
		const wait = waitForFonts(STARTUP_FONT_SPECS).then(() => {
			settled = true;
		});
		await vi.advanceTimersByTimeAsync(FONT_READY_TIMEOUT_MS - 1);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await wait;
		expect(settled).toBe(true);
	});
});

describe("fontTextForLocale", () => {
	it("adds the language's samples after a space so the Latin faces stay included", () => {
		expect(fontTextForLocale("vi")).toBe(" ạă");
	});

	it("passes no text for a language that draws only on the Latin faces", () => {
		for (const locale of ["en", "zh", "fr", "toString", "__proto__", "constructor"]) {
			expect(fontTextForLocale(locale), locale).toBeUndefined();
		}
	});
});

describe("font text", () => {
	it("checks and loads every spec with the given text", async () => {
		const check = vi.fn(() => false);
		const load = vi.fn(() => Promise.resolve([] as FontFace[]));
		installFontFaceSet({ check, load });
		expect(areFontsReady(STARTUP_FONT_SPECS, " ạă")).toBe(false);
		await waitForFonts(STARTUP_FONT_SPECS, " ạă");
		expect(check.mock.calls[0]).toStrictEqual([STARTUP_FONT_SPECS[0], " ạă"]);
		expect(load.mock.calls).toStrictEqual(STARTUP_FONT_SPECS.map((spec) => [spec, " ạă"]));
	});

	it("passes no text argument when none is given, so the browser checks a space", async () => {
		const check = vi.fn(() => false);
		const load = vi.fn(() => Promise.resolve([] as FontFace[]));
		installFontFaceSet({ check, load });
		await waitForFonts(STARTUP_FONT_SPECS);
		expect(check.mock.calls[0]).toStrictEqual([STARTUP_FONT_SPECS[0]]);
		expect(load.mock.calls).toStrictEqual(STARTUP_FONT_SPECS.map((spec) => [spec]));
	});
});

describe("warmFonts", () => {
	it("starts loading the faces for the text without waiting and ignores failures", () => {
		const load = vi.fn(() => Promise.reject(new Error("blocked")));
		installFontFaceSet({ check: () => false, load });
		expect(() => warmFonts(LANGUAGE_MENU_FONT_SPECS, "Tiếng Việt")).not.toThrow();
		expect(load.mock.calls).toStrictEqual([[LANGUAGE_MENU_FONT_SPECS[0], "Tiếng Việt"]]);
	});

	it("does nothing once the faces are loaded or without the CSS Font Loading API", () => {
		expect(() => warmFonts(LANGUAGE_MENU_FONT_SPECS, "Tiếng Việt")).not.toThrow();
		const load = vi.fn();
		installFontFaceSet({ check: () => true, load });
		warmFonts(LANGUAGE_MENU_FONT_SPECS, "Tiếng Việt");
		expect(load).not.toHaveBeenCalled();
	});
});
