/** @vitest-environment jsdom */

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TwapSubview, TwapSubviewPanel, TwapSubviewTabs } from "@/components/trade/twap/twap-subview-tabs";

function TestHarness({ direction = "ltr", mobile = false }: { direction?: "ltr" | "rtl"; mobile?: boolean }) {
	const [value, setValue] = useState<TwapSubview>("current");
	return (
		<I18nProvider i18n={i18n}>
			<DirectionProvider direction={direction}>
				<div dir={direction}>
					<TwapSubviewTabs mobile={mobile} value={value} onValueChange={setValue}>
						<TwapSubviewPanel value="current">
							Current panel
							<button type="button">Current action</button>
						</TwapSubviewPanel>
						<TwapSubviewPanel value="history">
							History panel
							<button type="button">History action</button>
						</TwapSubviewPanel>
						<TwapSubviewPanel value="fills">
							Fills panel
							<button type="button">Fills action</button>
						</TwapSubviewPanel>
					</TwapSubviewTabs>
				</div>
			</DirectionProvider>
		</I18nProvider>
	);
}

describe("TwapSubviewTabs accessibility and scroll contract", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.load("en", {});
		i18n.activate("en");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("moves to the next tab on ArrowLeft in RTL", async () => {
		act(() => {
			root.render(<TestHarness direction="rtl" />);
		});

		const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
		expect(tabs.map((tab) => tab.textContent)).toEqual(["Current", "History", "Fill History"]);
		await act(async () => {
			tabs[0]?.focus();
			await Promise.resolve();
		});
		await act(async () => {
			tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
			await Promise.resolve();
		});

		expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
		expect(document.activeElement).toBe(tabs[1]);
	});

	it("never leaves an aria-controls reference pointing to a missing element", () => {
		act(() => {
			root.render(<TestHarness />);
		});

		const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
		expect(tabs).toHaveLength(3);
		for (const tab of tabs) {
			const controls = tab.getAttribute("aria-controls");
			if (controls !== null) {
				expect(document.getElementById(controls), `missing panel for ${tab.textContent}: ${controls}`).not.toBeNull();
			}
		}
	});

	it("prevents vertical overflow on both desktop and mobile tab lists", () => {
		act(() => {
			root.render(<TestHarness mobile={false} />);
		});
		const desktopList = container.querySelector<HTMLElement>('[role="tablist"]');
		expect(desktopList?.className).toContain("overflow-y-hidden");
		for (const tab of container.querySelectorAll<HTMLElement>('[role="tab"]')) {
			expect(tab.className).not.toContain("min-h-10");
		}

		act(() => {
			root.render(<TestHarness mobile />);
		});
		const mobileList = container.querySelector<HTMLElement>('[role="tablist"]');
		expect(mobileList?.className).toContain("overflow-y-hidden");
	});

	it("keeps a visible focus-visible outline on desktop and mobile TWAP sub-tabs", () => {
		for (const mobile of [false, true]) {
			act(() => {
				root.render(<TestHarness mobile={mobile} />);
			});
			const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
			expect(tabs).toHaveLength(3);
			for (const tab of tabs) {
				const suppressesOutlineStyle =
					tab.classList.contains("outline-none") && !tab.classList.contains("focus-visible:outline-solid");
				expect(suppressesOutlineStyle, `mobile=${mobile} ${tab.textContent}`).toBe(false);
				expect(tab.className).toContain("focus-visible:outline-2");
				expect(tab.className).toContain("focus-visible:outline-market-close-focus");
				expect(tab.className).toMatch(/focus-visible:(?:-outline-offset-2|outline-offset-\[-2px\])/);
			}
		}
	});

	it("binds each selected TWAP tab bidirectionally to its active panel and excludes inactive content from Tab order", async () => {
		act(() => {
			root.render(<TestHarness />);
		});

		const expectedStates = [
			{ actionText: "Current action", label: "Current", panelText: "Current panel" },
			{ actionText: "History action", label: "History", panelText: "History panel" },
			{ actionText: "Fills action", label: "Fill History", panelText: "Fills panel" },
		] as const;

		for (const [index, expected] of expectedStates.entries()) {
			const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
			expect(tabs).toHaveLength(3);
			if (index > 0) {
				await act(async () => {
					tabs[index - 1]?.focus();
					await Promise.resolve();
				});
				await act(async () => {
					tabs[index - 1]?.dispatchEvent(
						new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
					);
					await Promise.resolve();
				});
			}

			const selectedTabs = tabs.filter((tab) => tab.getAttribute("aria-selected") === "true");
			expect(selectedTabs).toHaveLength(1);
			const activeTab = selectedTabs[0];
			expect(activeTab?.textContent).toBe(expected.label);
			expect(activeTab?.id).toBeTruthy();
			expect(activeTab?.tabIndex).toBe(0);

			const controlsId = activeTab?.getAttribute("aria-controls");
			expect(controlsId, `selected tab ${expected.label} must expose aria-controls`).toBeTruthy();
			const activePanel = controlsId ? document.getElementById(controlsId) : null;
			expect(activePanel, `panel #${controlsId} must exist for ${expected.label}`).not.toBeNull();
			expect(activePanel?.getAttribute("role")).toBe("tabpanel");
			expect(activePanel?.getAttribute("aria-labelledby")).toBe(activeTab?.id);
			expect(activePanel?.textContent).toContain(expected.panelText);

			const renderedPanels = Array.from(container.querySelectorAll<HTMLElement>('[role="tabpanel"]')).filter(
				(panel) => !panel.hidden,
			);
			expect(renderedPanels).toEqual([activePanel]);

			for (const tab of tabs) {
				if (tab === activeTab) continue;
				expect(tab.getAttribute("aria-selected")).toBe("false");
				expect(tab.tabIndex).toBe(-1);
				const inactiveControls = tab.getAttribute("aria-controls");
				if (inactiveControls !== null) {
					expect(document.getElementById(inactiveControls)).not.toBeNull();
				}
			}

			const tabbablePanelActions = Array.from(
				container.querySelectorAll<HTMLButtonElement>('[role="tabpanel"] button'),
			).filter((button) => button.tabIndex >= 0 && !button.closest("[hidden]"));
			expect(tabbablePanelActions.map((button) => button.textContent)).toEqual([expected.actionText]);
		}
	});
});
