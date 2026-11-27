// @vitest-environment jsdom

import {
	AdaptiveModal,
	Modal,
	ModalHeader,
	ModalPopup,
	ModalTitle,
	Pagination,
	RadioGroup,
	RadioGroupItem,
	SearchInput,
	SegmentedControlItem,
	SegmentedControls,
	Tabs,
	TabsList,
	TabsTrigger,
	Toggle,
} from "@sairn/ui";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderFundsModalBackButton } from "@/components/trade/components/funds-modal-back-button";
import { FundsModalShell } from "@/components/trade/components/funds-modal-shell";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("Shared UI primitives accessibility and RTL contracts", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				matches: false,
				removeEventListener: vi.fn(),
			}),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	it("mirrors checked Toggle thumb translation in RTL for every size", () => {
		const sizes = [
			["xxs", "translate-x-4"],
			["xs", "translate-x-5"],
			["sm", "translate-x-6"],
			["md", "translate-x-8"],
			["lg", "translate-x-10"],
		] as const;

		for (const [size, shift] of sizes) {
			act(() => root.render(<Toggle size={size} defaultChecked aria-label={`Toggle ${size}`} />));
			const thumb = container.querySelector('[role="switch"] > span');
			expect(thumb?.className, size).toContain(`data-checked:${shift}`);
			expect(thumb?.className, size).toContain(`rtl:data-checked:-${shift}`);
		}
	});

	it("mirrors Pagination arrows and logical spacing in RTL and gives mobile nav buttons an adequate width", () => {
		act(() => root.render(<Pagination currentPage={2} totalPages={5} variant="desktop" />));
		const desktopPrev = container.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]');
		const desktopNext = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');

		expect(desktopPrev?.className).toContain("pe-4");
		expect(desktopPrev?.className).not.toContain("pr-4");
		expect(desktopNext?.className).toContain("ps-4");
		expect(desktopNext?.className).not.toContain("pl-4");
		expect(desktopPrev?.querySelector("svg")?.getAttribute("class")).toContain("rtl:rotate-180");
		expect(desktopNext?.querySelector("svg")?.getAttribute("class")).toContain("rtl:rotate-180");

		act(() => root.render(<Pagination currentPage={2} totalPages={5} variant="mobile" />));
		const mobilePrev = container.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]');
		const mobileNext = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');

		expect(mobilePrev?.querySelector("svg")?.getAttribute("class")).toContain("rtl:rotate-180");
		expect(mobileNext?.querySelector("svg")?.getAttribute("class")).toContain("rtl:rotate-180");
		expect(mobilePrev?.className).toContain("justify-center");
		expect(mobilePrev?.className).toContain("size-8");
		expect(mobilePrev?.className).toContain("before:-inset-2");
		expect(mobilePrev?.className).not.toContain("before:inset-x-0");
		expect(mobileNext?.className).toContain("justify-center");
		expect(mobileNext?.className).toContain("size-8");
		expect(mobileNext?.className).toContain("before:-inset-2");
	});

	it("applies focus-visible directly to RadioGroupItem's focusable radio element", () => {
		act(() =>
			root.render(
				<RadioGroup defaultValue="7d">
					<RadioGroupItem value="7d" label="7 days" />
					<RadioGroupItem value="30d" label="30 days" />
				</RadioGroup>,
			),
		);
		const radio = container.querySelector<HTMLElement>('[role="radio"]');
		expect(radio).not.toBeNull();
		expect(radio?.className).toContain("focus-visible:outline-2");
		expect(radio?.className).toContain("focus-visible:outline-stroke-focus");
		expect(radio?.className).not.toContain("[&:has(:focus-visible)]");
	});

	it("keeps SearchInput's clear button in Tab order with focus styles and restores focus to the input on clear", () => {
		function ControlledSearch() {
			const [value, setValue] = useState("btc");
			return (
				<SearchInput
					aria-label="Search markets"
					value={value}
					onChange={(event) => setValue(event.target.value)}
					onClear={() => setValue("")}
				/>
			);
		}

		act(() => root.render(<ControlledSearch />));
		const input = container.querySelector<HTMLInputElement>('input[type="search"]');
		const clearButton = container.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]');

		expect(input).not.toBeNull();
		expect(clearButton).not.toBeNull();
		expect(clearButton?.tabIndex).toBe(0);
		expect(clearButton?.className).toContain("focus-visible:outline-2");

		act(() => {
			clearButton?.focus();
			clearButton?.click();
		});

		expect(input?.value).toBe("");
		expect(document.activeElement).toBe(input);
	});

	it("preserves React 19 callback ref cleanup functions on SearchInput and releases refs on unmount", () => {
		const mountedNodes: Array<HTMLInputElement | null> = [];
		const cleanup = vi.fn();

		function SearchWithCleanupRef({ query }: { query: string }) {
			return (
				<SearchInput
					aria-label="Search markets"
					value={query}
					onChange={() => {}}
					ref={(node) => {
						mountedNodes.push(node);
						return cleanup;
					}}
				/>
			);
		}

		const stableAttached: Array<HTMLInputElement | null> = [];
		const stableCleanup = vi.fn();
		const stableRef = (node: HTMLInputElement | null) => {
			stableAttached.push(node);
			return stableCleanup;
		};

		function StableRefHarness({ query }: { query: string }) {
			return <SearchInput ref={stableRef} aria-label="Stable search" value={query} onChange={() => {}} />;
		}

		act(() => root.render(<StableRefHarness query="a" />));
		const input = container.querySelector<HTMLInputElement>('input[type="search"]');
		expect(stableAttached).toEqual([input]);
		expect(stableCleanup).not.toHaveBeenCalled();

		act(() => root.render(<StableRefHarness query="ab" />));
		expect(stableAttached).toEqual([input]);
		expect(stableCleanup).not.toHaveBeenCalled();

		act(() => root.unmount());
		expect(stableCleanup).toHaveBeenCalledTimes(1);
		expect(stableAttached).toEqual([input]);

		root = createI18nRoot(container);
		const legacyCalls: Array<HTMLInputElement | null> = [];
		const legacyRef = (node: HTMLInputElement | null) => {
			legacyCalls.push(node);
		};
		act(() => root.render(<SearchInput ref={legacyRef} aria-label="Legacy search" />));
		const legacyInput = container.querySelector<HTMLInputElement>('input[type="search"]');
		expect(legacyCalls).toEqual([legacyInput]);
		act(() => root.unmount());
		expect(legacyCalls).toEqual([legacyInput, null]);

		root = createI18nRoot(container);
		act(() => root.render(<SearchWithCleanupRef query="x" />));
		expect(mountedNodes).toHaveLength(1);
		act(() => root.unmount());
		expect(cleanup).toHaveBeenCalledTimes(1);
		root = createI18nRoot(container);
	});

	it("uses an inset focus outline on SegmentedControls items inside their overflow-hidden list", () => {
		act(() =>
			root.render(
				<SegmentedControls defaultValue="buy">
					<SegmentedControlItem value="buy">Buy</SegmentedControlItem>
					<SegmentedControlItem value="sell">Sell</SegmentedControlItem>
				</SegmentedControls>,
			),
		);

		const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
		expect(tabs).toHaveLength(2);
		for (const tab of tabs) {
			expect(tab.className).toContain("focus-visible:-outline-offset-2");
			expect(tab.className).not.toContain("focus-visible:outline-offset-2");
		}
	});

	it("keeps Tabs underline indicator inside the scroll box and uses an inset focus outline on triggers", () => {
		act(() =>
			root.render(
				<Tabs defaultValue="first">
					<TabsList className="overflow-x-auto">
						<TabsTrigger value="first">First</TabsTrigger>
						<TabsTrigger value="second">Second</TabsTrigger>
					</TabsList>
				</Tabs>,
			),
		);

		const tablist = container.querySelector<HTMLElement>('[role="tablist"]');
		const indicator = container.querySelector<HTMLElement>("[style*='--active-tab-left']");
		const trigger = container.querySelector<HTMLElement>('[role="tab"]');

		expect(tablist?.className).toContain("overflow-y-hidden");
		expect(indicator?.className).toContain("bottom-0");
		expect(indicator?.className).not.toContain("-bottom-px");
		expect(trigger?.className).toContain("focus-visible:-outline-offset-2");
		expect(trigger?.className).not.toContain("focus-visible:outline-offset-2");
	});

	it("preserves baseline LTR geometry and focus outline on default non-scrolling Tabs", () => {
		act(() =>
			root.render(
				<Tabs defaultValue="first">
					<TabsList>
						<TabsTrigger value="first">First</TabsTrigger>
						<TabsTrigger value="second">Second</TabsTrigger>
					</TabsList>
				</Tabs>,
			),
		);

		const tablist = container.querySelector<HTMLElement>('[role="tablist"]');
		const indicator = container.querySelector<HTMLElement>("[style*='--active-tab-left']");
		const trigger = container.querySelector<HTMLElement>('[role="tab"]');

		expect(tablist?.className).not.toContain("overflow-y-hidden");
		expect(tablist?.className).not.toContain("overflow-x-auto");
		expect(indicator?.className).toContain("-bottom-px");
		expect(indicator?.className).not.toMatch(/(?:^|\s)bottom-0(?:\s|$)/);
		expect(trigger?.className).toContain("focus-visible:outline-offset-2");
		expect(trigger?.className).not.toContain("focus-visible:-outline-offset-2");
	});

	it("applies scroll clipping, bottom-0 underline, and inset focus outline when TabsList scrollable is true", () => {
		act(() =>
			root.render(
				<Tabs defaultValue="first">
					<TabsList scrollable>
						<TabsTrigger value="first">First</TabsTrigger>
						<TabsTrigger value="second">Second</TabsTrigger>
					</TabsList>
				</Tabs>,
			),
		);

		const tablist = container.querySelector<HTMLElement>('[role="tablist"]');
		const indicator = container.querySelector<HTMLElement>("[style*='--active-tab-left']");
		const trigger = container.querySelector<HTMLElement>('[role="tab"]');

		expect(tablist?.className).toContain("overflow-x-auto");
		expect(tablist?.className).toContain("overflow-y-hidden");
		expect(indicator?.className).toContain("bottom-0");
		expect(indicator?.className).not.toContain("-bottom-px");
		expect(trigger?.className).toContain("focus-visible:-outline-offset-2");
		expect(trigger?.className).not.toContain("focus-visible:outline-offset-2");
	});

	it("positions Modal and Drawer close controls, ModalHeader padding, and FundsModal controls logically for RTL", () => {
		act(() =>
			root.render(
				<Modal open>
					<ModalPopup>
						<ModalHeader>
							<ModalTitle>Modal Title</ModalTitle>
						</ModalHeader>
					</ModalPopup>
				</Modal>,
			),
		);
		const modalClose = document.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
		const modalHeader = document.querySelector<HTMLElement>("h2")?.parentElement;
		expect(modalClose?.className).toContain("end-4");
		expect(modalClose?.className).not.toContain("right-4");
		expect(modalHeader?.className).toContain("pe-14");
		expect(modalHeader?.className).not.toContain("pr-14");

		act(() =>
			root.render(
				<AdaptiveModal open onOpenChange={() => {}} presentation="drawer">
					<ModalHeader>
						<ModalTitle>Drawer Title</ModalTitle>
					</ModalHeader>
				</AdaptiveModal>,
			),
		);
		const drawerClose = document.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
		expect(drawerClose?.className).toContain("end-4");
		expect(drawerClose?.className).not.toContain("right-4");

		act(() =>
			root.render(
				<FundsModalShell
					open
					onOpenChange={() => {}}
					isPending={false}
					presentation="modal"
					tab="deposit"
					headerStart={renderFundsModalBackButton({ label: "Back", onClick: () => {} })}
				>
					<div>Body</div>
				</FundsModalShell>,
			),
		);
		const backButton = document.querySelector<HTMLButtonElement>('button[aria-label="Back"]');
		const fundsPopup = document.querySelector<HTMLElement>('[role="dialog"]');
		const fundsHeader = document.querySelector<HTMLElement>("h2")?.parentElement;

		expect(backButton?.className).toContain("start-4");
		expect(backButton?.className).toContain("min-[1001px]:start-6");
		expect(backButton?.className).not.toContain("left-4");
		expect(backButton?.className).not.toContain("min-[1001px]:left-6");
		expect(backButton?.querySelector("svg")?.getAttribute("class")).toContain("rtl:rotate-180");

		expect(fundsPopup?.className).toContain("[&>button]:!end-4");
		expect(fundsPopup?.className).toContain("min-[1001px]:[&>button]:!end-6");
		expect(fundsPopup?.className).not.toContain("!right-4");
		expect(fundsPopup?.className).not.toContain("!right-6");

		expect(fundsHeader?.className).toContain("pe-14");
		expect(fundsHeader?.className).not.toContain("pr-14");
	});
});
