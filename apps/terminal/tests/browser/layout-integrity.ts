import type { Page } from "@playwright/test";

/**
 * Deterministic layout-integrity probe for browser fixtures (docs/layout-integrity.md).
 *
 * A whole-page check can pass while one badge, value or label is cut off. This probe judges every
 * rendered element on its own and reports two kinds of defect:
 *
 * - `truncated`: an element with its own text whose content is wider (or taller) than its box while
 *   its overflow hides the rest (`overflow` other than visible, `text-overflow: ellipsis` or a
 *   line clamp). Content that only wraps is not a finding.
 * - `clipped`: rendered text or a media element (svg, img, canvas) that extends beyond the padding box
 *   of an ancestor whose overflow is `hidden` or `clip`, below the probe root. Ancestors that scroll
 *   (`auto`, `scroll`) are skipped, because their hidden part is reachable.
 *
 * Elements that are not rendered (display none, visibility hidden, zero size) and screen-reader-only
 * content (a 1px clipped box) are ignored with their descendants. Exceptions are listed by the
 * caller as CSS selectors, each with a reason, so every accepted truncation stays visible in review.
 * The probe measures what the browser rendered; it says nothing about whether a wrapped layout is
 * pleasant, and a defect it reports must still be reproduced at the reported width before a fix.
 */
export interface LayoutIntegrityException {
	selector: string;
	reason: string;
}

export interface LayoutIntegrityFinding {
	kind: "truncated" | "clipped";
	path: string;
	text: string;
	detail: string;
}

export interface LayoutIntegrityOptions {
	root: string;
	exceptions?: readonly LayoutIntegrityException[];
	/** Pixels of rounding tolerated before a difference counts. */
	tolerance?: number;
}

export async function findLayoutIntegrityIssues(
	page: Page,
	{ root, exceptions = [], tolerance = 1 }: LayoutIntegrityOptions,
): Promise<LayoutIntegrityFinding[]> {
	return page.evaluate(
		({ rootSelector, allowSelectors, slack }) => {
			const rootElement = document.querySelector(rootSelector);
			if (!rootElement) throw new Error(`Missing layout-integrity root ${rootSelector}`);
			const findings: { kind: "truncated" | "clipped"; path: string; text: string; detail: string }[] = [];

			const isAllowed = (element: Element) => allowSelectors.some((selector) => element.closest(selector));

			const isScreenReaderOnly = (element: Element, style: CSSStyleDeclaration) => {
				const box = element.getBoundingClientRect();
				const clipped = style.clip !== "auto" && style.clip !== "" ? true : style.clipPath.startsWith("inset(50%");
				return clipped && box.width <= 1 && box.height <= 1;
			};

			const isRendered = (element: Element, style: CSSStyleDeclaration) => {
				if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
				const box = element.getBoundingClientRect();
				return box.width > 0 || box.height > 0;
			};

			const describe = (element: Element) => {
				const region = element.closest("[data-testid], [data-slot]");
				const regionName =
					region && rootElement.contains(region)
						? (region.getAttribute("data-testid") ?? region.getAttribute("data-slot") ?? "")
						: "";
				const stop = region && rootElement.contains(region) ? region : rootElement;
				let label = "";
				for (let current: Element | null = element; current && current !== stop; current = current.parentElement) {
					const previous = current.previousElementSibling;
					const previousText = previous?.textContent?.trim() ?? "";
					const visible = previous ? previous.getClientRects().length > 0 : false;
					if (previous && visible && previousText && previousText.length <= 40 && !previous.querySelector("button, a, input")) {
						label = previousText;
						break;
					}
				}
				return [regionName, label ? `«${label}»` : "", element.tagName.toLowerCase()].filter(Boolean).join(" › ");
			};

			const ownText = (element: Element) =>
				[...element.childNodes]
					.filter((node) => node.nodeType === Node.TEXT_NODE)
					.map((node) => node.textContent ?? "")
					.join("")
					.trim();

			const textRect = (element: Element) => {
				const range = document.createRange();
				let rect: DOMRect | null = null;
				for (const node of element.childNodes) {
					if (node.nodeType !== Node.TEXT_NODE || !(node.textContent ?? "").trim()) continue;
					range.selectNodeContents(node);
					const box = range.getBoundingClientRect();
					if (box.width === 0 && box.height === 0) continue;
					rect = rect
						? new DOMRect(
								Math.min(rect.left, box.left),
								Math.min(rect.top, box.top),
								Math.max(rect.right, box.right) - Math.min(rect.left, box.left),
								Math.max(rect.bottom, box.bottom) - Math.min(rect.top, box.top),
							)
						: box;
				}
				return rect;
			};

			const clippingAncestors = (element: Element) => {
				const result: Element[] = [];
				let current = element.parentElement;
				while (current && rootElement.contains(current)) {
					const style = getComputedStyle(current);
					const hides = (value: string) => value === "hidden" || value === "clip";
					if (hides(style.overflowX) || hides(style.overflowY)) result.push(current);
					if (current === rootElement) break;
					current = current.parentElement;
				}
				return result;
			};

			const paddingBox = (element: Element) => {
				const box = element.getBoundingClientRect();
				const style = getComputedStyle(element);
				const left = box.left + Number.parseFloat(style.borderLeftWidth);
				const top = box.top + Number.parseFloat(style.borderTopWidth);
				return {
					left,
					top,
					right: left + element.clientWidth,
					bottom: top + element.clientHeight,
					hidesX: ["hidden", "clip"].includes(style.overflowX),
					hidesY: ["hidden", "clip"].includes(style.overflowY),
				};
			};

			const visit = (element: Element) => {
				const style = getComputedStyle(element);
				if (!isRendered(element, style) || isScreenReaderOnly(element, style)) return;
				if (isAllowed(element)) return;
				const text = ownText(element);
				if (text) {
					const hidesX = style.overflowX !== "visible" || style.textOverflow === "ellipsis";
					const lineClamp = style.getPropertyValue("-webkit-line-clamp");
					const hidesY = style.overflowY !== "visible" || (lineClamp !== "" && lineClamp !== "none");
					const scrolls = ["auto", "scroll"].includes(style.overflowX) || ["auto", "scroll"].includes(style.overflowY);
					if (!scrolls && hidesX && element.scrollWidth > element.clientWidth + slack) {
						findings.push({
							kind: "truncated",
							path: describe(element),
							text,
							detail: `content ${element.scrollWidth}px wide in a ${element.clientWidth}px box`,
						});
					} else if (!scrolls && hidesY && element.scrollHeight > element.clientHeight + slack) {
						findings.push({
							kind: "truncated",
							path: describe(element),
							text,
							detail: `content ${element.scrollHeight}px tall in a ${element.clientHeight}px box`,
						});
					}
				}
				const isMedia = ["svg", "img", "canvas", "video"].includes(element.tagName.toLowerCase());
				const rect = isMedia ? element.getBoundingClientRect() : text ? textRect(element) : null;
				if (rect && (rect.width > 0 || rect.height > 0)) {
					for (const ancestor of clippingAncestors(element)) {
						if (isAllowed(ancestor)) break;
						const box = paddingBox(ancestor);
						const overflowX = box.hidesX ? Math.max(box.left - rect.left, rect.right - box.right) : 0;
						const overflowY = box.hidesY ? Math.max(box.top - rect.top, rect.bottom - box.bottom) : 0;
						const overflow = Math.max(overflowX, overflowY);
						if (overflow > slack) {
							findings.push({
								kind: "clipped",
								path: describe(element),
								text: text || element.tagName.toLowerCase(),
								detail: `extends ${Math.round(overflow)}px beyond ${describe(ancestor) || ancestor.tagName.toLowerCase()}`,
							});
							break;
						}
					}
				}
				for (const child of element.children) visit(child);
			};

			for (const child of rootElement.children) visit(child);
			return findings;
		},
		{ rootSelector: root, allowSelectors: exceptions.map((exception) => exception.selector), slack: tolerance },
	);
}
