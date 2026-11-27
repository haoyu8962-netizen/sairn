/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const observerState = vi.hoisted(() => {
	const state = { callback: null as ResizeObserverCallback | null };
	class ResizeObserverMock implements ResizeObserver {
		constructor(callback: ResizeObserverCallback) {
			state.callback = callback;
		}
		disconnect() {}
		observe() {}
		unobserve() {}
	}
	vi.stubGlobal("ResizeObserver", ResizeObserverMock);
	return state;
});

import { ScrollArea } from "@/components/ui/scroll-area";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("ScrollArea", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		observerState.callback = null;
		if (typeof Element.prototype.getAnimations !== "function") {
			Object.defineProperty(Element.prototype, "getAnimations", {
				configurable: true,
				value: () => [],
			});
		}
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders a horizontal scrollbar when the viewport overflows horizontally and hides it when content fits", async () => {
		await act(async () => {
			root.render(
				<ScrollArea className="h-40 w-64">
					<div style={{ width: 1200 }}>Wide table content</div>
				</ScrollArea>,
			);
		});

		const viewport = container.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]');
		expect(viewport).not.toBeNull();
		if (!viewport || !observerState.callback) throw new Error("ScrollArea viewport or ResizeObserver not initialized");

		Object.defineProperties(viewport, {
			clientHeight: { configurable: true, value: 160 },
			scrollHeight: { configurable: true, value: 160 },
			clientWidth: { configurable: true, value: 256 },
			scrollWidth: { configurable: true, value: 1200 },
		});

		await act(async () => {
			observerState.callback?.([], {} as ResizeObserver);
			await Promise.resolve();
		});

		const horizontalScrollbar = container.querySelector<HTMLDivElement>(
			'[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]',
		);
		expect(horizontalScrollbar).not.toBeNull();
		expect(horizontalScrollbar?.querySelector('[data-slot="scroll-area-thumb"]')).not.toBeNull();

		Object.defineProperty(viewport, "scrollWidth", { configurable: true, value: 256 });
		await act(async () => {
			observerState.callback?.([], {} as ResizeObserver);
			await Promise.resolve();
		});

		expect(container.querySelector('[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]')).toBeNull();
	});

	it("does not override the vertical track bottom offset with h-full when both axes overflow", async () => {
		await act(async () => {
			root.render(
				<ScrollArea className="h-40 w-64">
					<div style={{ height: 600, width: 1200 }}>Wide and tall table content</div>
				</ScrollArea>,
			);
		});

		const viewport = container.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]');
		expect(viewport).not.toBeNull();
		if (!viewport || !observerState.callback) throw new Error("ScrollArea viewport or ResizeObserver not initialized");

		Object.defineProperties(viewport, {
			clientHeight: { configurable: true, value: 160 },
			scrollHeight: { configurable: true, value: 600 },
			clientWidth: { configurable: true, value: 256 },
			scrollWidth: { configurable: true, value: 1200 },
		});

		await act(async () => {
			observerState.callback?.([], {} as ResizeObserver);
			await Promise.resolve();
		});

		const verticalScrollbar = container.querySelector<HTMLDivElement>(
			'[data-slot="scroll-area-scrollbar"][data-orientation="vertical"]',
		);
		const horizontalScrollbar = container.querySelector<HTMLDivElement>(
			'[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]',
		);
		expect(verticalScrollbar).not.toBeNull();
		expect(horizontalScrollbar).not.toBeNull();
		expect(verticalScrollbar?.className.split(/\s+/)).not.toContain("h-full");
		expect(verticalScrollbar?.style.top).toBe("0px");
		expect(verticalScrollbar?.style.bottom).toContain("--scroll-area-corner-height");
	});

	it("uses thumb tokens with at least 3:1 non-text contrast in light and dark themes", async () => {
		await act(async () => {
			root.render(
				<ScrollArea className="h-40 w-64">
					<div style={{ height: 600, width: 1200 }}>Wide and tall table content</div>
				</ScrollArea>,
			);
		});

		const viewport = container.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]');
		expect(viewport).not.toBeNull();
		if (!viewport || !observerState.callback) throw new Error("ScrollArea viewport or ResizeObserver not initialized");

		Object.defineProperties(viewport, {
			clientHeight: { configurable: true, value: 160 },
			scrollHeight: { configurable: true, value: 600 },
			clientWidth: { configurable: true, value: 256 },
			scrollWidth: { configurable: true, value: 1200 },
		});

		await act(async () => {
			observerState.callback?.([], {} as ResizeObserver);
			await Promise.resolve();
		});

		const thumb = container.querySelector<HTMLDivElement>(
			'[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"] [data-slot="scroll-area-thumb"]',
		);
		expect(thumb).not.toBeNull();

		const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../..", "styles.css"), "utf8");
		const classes = thumb?.className.split(/\s+/) ?? [];
		const baseBgToken = classes.find((token) => token.startsWith("bg-"))?.slice("bg-".length);
		const hoverBgToken = classes.find((token) => token.startsWith("hover:bg-"))?.slice("hover:bg-".length);
		expect(baseBgToken).toBeTruthy();
		expect(hoverBgToken).toBeTruthy();

		const lightSurfaces = [
			"--bg-raised",
			"--bg-alternate",
			"--trading-panel-surface-card",
			"--trading-panel-surface-hover",
		];
		const darkSurfaces = ["--bg-raised", "--bg-overlay"];

		for (const token of [baseBgToken, hoverBgToken]) {
			const themeVariable = readCssVariable(css, "@theme inline", `--color-${token}`);
			expect(themeVariable).toBeTruthy();

			const lightThumb = resolveRgba(css, ":root", themeVariable ?? "");
			for (const surfaceVar of lightSurfaces) {
				const surface = resolveRgba(css, ":root", `var(${surfaceVar})`);
				expect(getContrastRatio(compositeOver(lightThumb, surface), surface)).toBeGreaterThanOrEqual(3);
			}

			const darkThumb = resolveRgba(css, ".dark", themeVariable ?? "");
			for (const surfaceVar of darkSurfaces) {
				const surface = resolveRgba(css, ".dark", `var(${surfaceVar})`);
				expect(getContrastRatio(compositeOver(darkThumb, surface), surface)).toBeGreaterThanOrEqual(3);
			}
		}
	});
});

function readCssVariable(source: string, selector: string, variable: string): string | undefined {
	const selectorStart = source.indexOf(`${selector} {`);
	if (selectorStart === -1) return undefined;
	const blockStart = source.indexOf("{", selectorStart);
	const blockEnd = source.indexOf("}", blockStart);
	if (blockStart === -1 || blockEnd === -1) return undefined;
	const declaration = new RegExp(`${variable}:\\s*([^;]+);`).exec(source.slice(blockStart + 1, blockEnd));
	return declaration?.[1]?.trim();
}

function resolveRgba(source: string, selector: string, initialValue: string): [number, number, number, number] {
	let value: string | undefined = initialValue;
	for (let depth = 0; depth < 5 && value; depth += 1) {
		const reference = /^var\((--[\w-]+)\)$/.exec(value);
		if (!reference) break;
		value = readCssVariable(source, selector, reference[1]);
	}
	if (!value || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) {
		throw new Error(`Could not resolve ${initialValue} in ${selector}, got: ${value}`);
	}
	const hex = value.slice(1);
	const red = Number.parseInt(hex.slice(0, 2), 16);
	const green = Number.parseInt(hex.slice(2, 4), 16);
	const blue = Number.parseInt(hex.slice(4, 6), 16);
	const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
	return [red, green, blue, alpha];
}

function compositeOver(
	foreground: [number, number, number, number],
	background: [number, number, number, number],
): [number, number, number, number] {
	const [r, g, b, a] = foreground;
	const [br, bg, bb] = background;
	return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

function getRelativeLuminance([red, green, blue]: [number, number, number, number]): number {
	const [r, g, b] = [red, green, blue].map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(
	foreground: [number, number, number, number],
	background: [number, number, number, number],
): number {
	const [lighter, darker] = [getRelativeLuminance(foreground), getRelativeLuminance(background)].sort((a, b) => b - a);
	return (lighter + 0.05) / (darker + 0.05);
}
