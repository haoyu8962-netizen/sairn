// Built-page browser checks for G-01 (ticker mirror pointer clicks without keyboard/SR duplication)
// and G-03 (44px touch targets under pointer: coarse at >=640/768px while preserving desktop sizes).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { launch, openPage } from "./browser.mjs";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
function fixtureBody(dex) {
	return readFileSync(resolve(FIXTURES, `meta-and-asset-ctxs-${dex === "" ? "main" : dex}.json`), "utf8");
}

let browser;
before(async () => {
	browser = await launch();
});
after(async () => {
	await browser?.close();
});

test("G-01: moving ticker mirror links receive pointer clicks while staying hidden from keyboard and screen readers", async () => {
	const { context, page } = await openPage(browser, "/", {
		viewport: { width: 1280, height: 900 },
		reducedMotion: "no-preference",
		block: [/\/_astro\/LiveMarkets\.astro_[\w.-]+\.js$/],
	});
	try {
		await page.goto("https://site.test/", { waitUntil: "load" });
		const state = await page.evaluate(() => {
			const strip = document.querySelector("[data-live-strip]");
			strip.dataset.ticker = "moving";
			const mirror = document.querySelector(".ticker-mirror");
			const links = [...mirror.querySelectorAll("a[data-live-mirror]")];
			return {
				inert: mirror.hasAttribute("inert"),
				ariaHidden: mirror.getAttribute("aria-hidden"),
				display: getComputedStyle(mirror).display,
				linkCount: links.length,
				allNegativeTabindex: links.every((link) => link.getAttribute("tabindex") === "-1"),
				allHaveHref: links.every((link) => Boolean(link.getAttribute("href"))),
			};
		});
		assert.equal(state.inert, false, "mirror list must not use inert, which blocks pointer clicks");
		assert.equal(state.ariaHidden, "true", "mirror list stays hidden from screen readers");
		assert.equal(state.display, "flex", "mirror list displays while moving");
		assert.ok(state.linkCount >= 10);
		assert.equal(state.allNegativeTabindex, true, "mirror links stay out of keyboard Tab order");
		assert.equal(state.allHaveHref, true);

		// Position the marquee so a mirror card sits inside the viewport, pause via hover, and click it.
		const clickedHref = await page.evaluate(() => {
			const track = document.querySelector(".ticker-track");
			const animation = track.getAnimations()[0];
			if (animation) {
				animation.pause();
				animation.currentTime = (animation.effect?.getTiming().duration ?? 0) * 0.55;
			}
			const link = document.querySelector(".ticker-mirror a[data-live-mirror]");
			window.__mirrorClicked = null;
			link.addEventListener("click", (event) => {
				event.preventDefault();
				window.__mirrorClicked = link.getAttribute("href");
			});
			return link.getAttribute("href");
		});
		const firstMirrorLink = page.locator(".ticker-mirror a[data-live-mirror]").first();
		await firstMirrorLink.scrollIntoViewIfNeeded();
		await firstMirrorLink.click();
		const received = await page.evaluate(() => window.__mirrorClicked);
		assert.equal(received, clickedHref, "pointer click reaches the mirror card link");
	} finally {
		await context.close();
	}
});

test("G-03: coarse-pointer touch devices at 640px and 768px keep at least 44px hit targets", async () => {
	for (const width of [640, 768]) {
		const { context, page } = await openPage(browser, "/", {
			viewport: { width, height: 1024 },
			hasTouch: true,
			isMobile: true,
		});
		try {
			await page.goto("https://site.test/", { waitUntil: "load" });
			const report = await page.evaluate(() => {
				const coarse = matchMedia("(pointer: coarse)").matches;
				// Reveal hidden pause controls so their heights are measured too.
				for (const button of document.querySelectorAll("[data-live-pause]")) button.hidden = false;
				const checks = [
					["header Open terminal (.btn-md)", "header a.btn-md"],
					["header anchor links", "header nav ul a"],
					["hero market (.btn-sm)", 'section[aria-labelledby="hero-title"] a.btn-sm'],
					["hero preview tabs", ".preview-tab"],
					["stats method summary", ".stats-method summary"],
					["ticker pause (.btn-sm)", "#markets-now [data-live-pause]"],
					["markets table Trade (.btn-sm)", "#markets [data-tabpanel]:not([hidden]) a.btn-sm"],
					["Pre-IPO market links", '#markets ul a[href*="/trade/"]'],
					["Pre-IPO docs links", '#markets ul a[rel="noopener"]'],
					["footer column links", "footer ul a"],
					["footer pause (.btn-sm)", "footer [data-live-pause]"],
				];
				const failures = [];
				const missing = [];
				for (const [label, selector] of checks) {
					let visibleCount = 0;
					for (const el of document.querySelectorAll(selector)) {
						if (!el.checkVisibility()) continue;
						visibleCount += 1;
						const height = el.getBoundingClientRect().height;
						if (height < 44 - 0.5) {
							failures.push(`${label} (${el.textContent.replace(/\s+/g, " ").trim().slice(0, 30)}): ${height.toFixed(1)}px`);
						}
					}
					const hiddenBelowMd = selector === "header nav ul a" && window.innerWidth < 768;
					if (!hiddenBelowMd && visibleCount === 0) missing.push(label);
				}
				return { coarse, failures, missing };
			});
			assert.equal(report.coarse, true, `${width}px: test context must match (pointer: coarse)`);
			assert.deepEqual(report.missing, [], `${width}px coarse-pointer: every target class must have at least one visible control`);
			assert.deepEqual(report.failures, [], `${width}px coarse-pointer targets below 44px`);
		} finally {
			await context.close();
		}
	}

	// Desktop fine-pointer keeps its existing compact sizes.
	const desktop = await openPage(browser, "/", {
		viewport: { width: 1280, height: 900 },
		hasTouch: false,
		isMobile: false,
	});
	try {
		await desktop.page.goto("https://site.test/", { waitUntil: "load" });
		const sizes = await desktop.page.evaluate(() => ({
			coarse: matchMedia("(pointer: coarse)").matches,
			headerBtn: Math.round(document.querySelector("header a.btn-md").getBoundingClientRect().height),
			headerAnchor: Math.round(document.querySelector("header nav ul a").getBoundingClientRect().height),
			previewTab: Math.round(document.querySelector(".preview-tab").getBoundingClientRect().height),
			heroMarket: Math.round(document.querySelector('section[aria-labelledby="hero-title"] a.btn-sm').getBoundingClientRect().height),
			footerLink: Math.round(document.querySelector("footer ul a").getBoundingClientRect().height),
		}));
		assert.equal(sizes.coarse, false);
		assert.deepEqual(sizes, {
			coarse: false,
			headerBtn: 40,
			headerAnchor: 40,
			previewTab: 32,
			heroMarket: 36,
			footerLink: 36,
		});
	} finally {
		await desktop.context.close();
	}
});

test("I-03: clicking or focusing a moving ticker mirror link preserves pointer click without leaving focus in aria-hidden", async () => {
	const { context, page } = await openPage(browser, "/", {
		viewport: { width: 1280, height: 900 },
		reducedMotion: "no-preference",
	});
	try {
		// Fulfill Hyperliquid public info requests with recorded fixtures so live-markets.ts naturally starts the marquee.
		await context.route("https://api.hyperliquid.xyz/info", async (route) => {
			const body = route.request().postDataJSON();
			const dex = body?.dex ?? "";
			const parsed = JSON.parse(fixtureBody(dex));
			await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(parsed.body) });
		});
		await page.goto("https://site.test/", { waitUntil: "load" });
		await page.locator("[data-live-strip]").scrollIntoViewIfNeeded();
		await page.waitForSelector('[data-live-strip][data-ticker="moving"]', { timeout: 10_000 });

		const expected = await page.evaluate(() => {
			const track = document.querySelector(".ticker-track");
			const animation = track.getAnimations()[0];
			if (animation) {
				animation.pause();
				animation.currentTime = (animation.effect?.getTiming().duration ?? 0) * 0.55;
			}
			const mirrorLink = document.querySelector(".ticker-mirror a[data-live-mirror]");
			window.__mirrorClicks = [];
			mirrorLink.addEventListener("click", (event) => {
				event.preventDefault();
				window.__mirrorClicks.push(mirrorLink.getAttribute("href"));
			});
			return {
				href: mirrorLink.getAttribute("href"),
				coin: mirrorLink.dataset.liveMirror,
			};
		});

		const firstMirrorLink = page.locator(".ticker-mirror a[data-live-mirror]").first();
		await firstMirrorLink.scrollIntoViewIfNeeded();
		await firstMirrorLink.click();

		const afterClick = await page.evaluate(() => ({
			clicks: window.__mirrorClicks,
			activeTag: document.activeElement?.tagName ?? null,
			inMirror: Boolean(document.activeElement?.closest(".ticker-mirror")),
			inAriaHidden: Boolean(document.activeElement?.closest('[aria-hidden="true"]')),
		}));
		assert.deepEqual(afterClick.clicks, [expected.href], "pointer click reaches the mirror link");
		assert.equal(afterClick.inMirror, false, "clicking a mirror link must not leave focus inside .ticker-mirror");
		assert.equal(afterClick.inAriaHidden, false, "clicking a mirror link must not leave focus inside aria-hidden");

		// Even programmatic focus on a mirror link must redirect out of aria-hidden to the matching primary card.
		const afterFocus = await page.evaluate(() => {
			const mirrorLink = document.querySelector(".ticker-mirror a[data-live-mirror]");
			mirrorLink.focus();
			return {
				inMirror: Boolean(document.activeElement?.closest(".ticker-mirror")),
				inAriaHidden: Boolean(document.activeElement?.closest('[aria-hidden="true"]')),
				activeCard: document.activeElement?.getAttribute("data-live-card") ?? null,
			};
		});
		assert.equal(afterFocus.inMirror, false, "programmatic focus must not stay inside .ticker-mirror");
		assert.equal(afterFocus.inAriaHidden, false, "programmatic focus must not stay inside aria-hidden");
		assert.equal(afterFocus.activeCard, expected.coin, "focus redirects to the matching primary market card");

		await page.keyboard.press("Tab");
		const afterTab = await page.evaluate(() => ({
			inMirror: Boolean(document.activeElement?.closest(".ticker-mirror")),
			inAriaHidden: Boolean(document.activeElement?.closest('[aria-hidden="true"]')),
		}));
		assert.equal(afterTab.inMirror, false, "subsequent Tab must stay out of .ticker-mirror");
		assert.equal(afterTab.inAriaHidden, false, "subsequent Tab must stay out of aria-hidden");
	} finally {
		await context.close();
	}
});

test("I-06: hybrid fine+coarse input devices keep >=44px touch targets and direct links/disclosures show active press feedback", async () => {
	// Emulate a hybrid device whose primary pointer is fine (trackpad/mouse) with a coarse touch input available:
	// Blink PointerType: COARSE = 2, FINE = 4 -> primaryPointerType=4 (fine), availablePointerTypes=6 (fine|coarse).
	const hybridBrowser = await launch({ args: ["--blink-settings=primaryPointerType=4,availablePointerTypes=6"] });
	try {
		for (const width of [768, 1024]) {
			const { context, page } = await openPage(hybridBrowser, "/", {
				viewport: { width, height: 1024 },
				hasTouch: false,
				isMobile: false,
			});
			try {
				await page.goto("https://site.test/", { waitUntil: "load" });
				const report = await page.evaluate(() => {
					const fine = matchMedia("(pointer: fine)").matches;
					const primaryCoarse = matchMedia("(pointer: coarse)").matches;
					const anyCoarse = matchMedia("(any-pointer: coarse)").matches;
					for (const button of document.querySelectorAll("[data-live-pause]")) button.hidden = false;
					const checks = [
						["header Open terminal (.btn-md)", "header a.btn-md"],
						["header anchor links", "header nav ul a"],
						["hero market (.btn-sm)", 'section[aria-labelledby="hero-title"] a.btn-sm'],
						["hero preview tabs", ".preview-tab"],
						["stats method summary", ".stats-method summary"],
						["ticker pause (.btn-sm)", "#markets-now [data-live-pause]"],
						["markets table Trade (.btn-sm)", "#markets [data-tabpanel]:not([hidden]) a.btn-sm"],
						["Pre-IPO market links", '#markets ul a[href*="/trade/"]'],
						["Pre-IPO docs links", '#markets ul a[rel="noopener"]'],
						["footer column links", "footer ul a"],
						["footer pause (.btn-sm)", "footer [data-live-pause]"],
					];
					const failures = [];
					const missing = [];
					for (const [label, selector] of checks) {
						let visibleCount = 0;
						for (const el of document.querySelectorAll(selector)) {
							if (!el.checkVisibility()) continue;
							visibleCount += 1;
							const height = el.getBoundingClientRect().height;
							if (height < 44 - 0.5) {
								failures.push(`${label} (${el.textContent.replace(/\s+/g, " ").trim().slice(0, 30)}): ${height.toFixed(1)}px`);
							}
						}
						if (visibleCount === 0) missing.push(label);
					}
					return { fine, primaryCoarse, anyCoarse, failures, missing };
				});
				assert.equal(report.fine, true, `${width}px hybrid: primary pointer should be fine`);
				assert.equal(report.primaryCoarse, false, `${width}px hybrid: primary pointer should not be coarse`);
				assert.equal(report.anyCoarse, true, `${width}px hybrid: any-pointer must be coarse`);
				assert.deepEqual(report.missing, [], `${width}px hybrid: every target class must have at least one visible control`);
				assert.deepEqual(report.failures, [], `${width}px hybrid targets below 44px`);

				// Verify page-owned :active press feedback and real hit/delivery on direct links and disclosure controls.
				await assertActivePressFeedback(context, page, `${width}px`);
			} finally {
				await context.close();
			}
		}
	} finally {
		await hybridBrowser.close();
	}

	// Desktop fine-pointer (without coarse input) also shows visible :active press feedback and real hit/delivery.
	const desktop = await openPage(browser, "/", {
		viewport: { width: 1280, height: 900 },
		hasTouch: false,
		isMobile: false,
	});
	try {
		await desktop.page.goto("https://site.test/", { waitUntil: "load" });
		await assertActivePressFeedback(desktop.context, desktop.page, "1280px desktop");

		// F-06 self-check: pointer-events: none on .stats-method summary must fail the real press check.
		await desktop.page.evaluate(() => {
			document.querySelector(".stats-method summary").style.pointerEvents = "none";
		});
		await assert.rejects(
			() => assertRealPointerPress(desktop.page, "stats method summary", ".stats-method summary", "pointer-events-none mutation"),
			/hit|active|toggle/i,
			"the real press check must fail when pointer-events: none blocks the control",
		);
		await desktop.page.evaluate(() => {
			document.querySelector(".stats-method summary").style.pointerEvents = "";
		});
	} finally {
		await desktop.context.close();
	}
});

async function assertRealPointerPress(page, label, selector, viewportLabel) {
	const locator = page.locator(selector).first();
	const prepared = await locator.evaluate((el) => {
		if (!el.checkVisibility()) return { visible: false };
		if (!el.closest("header")) el.scrollIntoView({ block: "center", inline: "center" });
		const rect = el.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const hit = document.elementFromPoint(cx, cy);
		const isSummary = el.tagName === "SUMMARY";
		const details = isSummary ? el.closest("details") : null;
		const beforeStyle = (() => {
			const s = getComputedStyle(el);
			return { bg: s.backgroundColor, color: s.color, opacity: s.opacity, transform: s.transform };
		})();
		window.__pressClicks = 0;
		if (!isSummary) {
			el.addEventListener(
				"click",
				(event) => {
					event.preventDefault();
					window.__pressClicks += 1;
				},
				{ once: true },
			);
		}
		return {
			visible: true,
			cx,
			cy,
			width: rect.width,
			height: rect.height,
			hitSelf: Boolean(hit && el.contains(hit)),
			hitTag: hit?.tagName ?? null,
			isSummary,
			initialOpen: details?.open ?? null,
			beforeStyle,
		};
	});
	assert.equal(prepared.visible, true, `${viewportLabel} ${label}: control must be visible`);
	assert.ok(prepared.width > 0 && prepared.height > 0, `${viewportLabel} ${label}: control must have non-zero size`);
	assert.equal(
		prepared.hitSelf,
		true,
		`${viewportLabel} ${label}: pointer hit test at center must reach the control (hit ${prepared.hitTag})`,
	);

	await page.mouse.move(prepared.cx, prepared.cy);
	await page.mouse.down();
	try {
		const pressed = await locator.evaluate(async (el) => {
			void getComputedStyle(el).backgroundColor;
			void getComputedStyle(el).color;
			void getComputedStyle(el).opacity;
			await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
			const s = getComputedStyle(el);
			return {
				matchesActive: el.matches(":active"),
				style: { bg: s.backgroundColor, color: s.color, opacity: s.opacity, transform: s.transform },
			};
		});
		assert.equal(pressed.matchesActive, true, `${viewportLabel} ${label}: real pointer press must activate :active`);
		const changed =
			prepared.beforeStyle.bg !== pressed.style.bg ||
			prepared.beforeStyle.color !== pressed.style.color ||
			prepared.beforeStyle.opacity !== pressed.style.opacity ||
			prepared.beforeStyle.transform !== pressed.style.transform;
		assert.equal(changed, true, `${viewportLabel} ${label}: real pointer press must show visible feedback`);
	} finally {
		await page.mouse.up();
	}

	if (prepared.isSummary) {
		const openAfter = await locator.evaluate((el) => el.closest("details")?.open ?? null);
		assert.equal(
			openAfter,
			!prepared.initialOpen,
			`${viewportLabel} ${label}: real press/release must toggle the disclosure state`,
		);
		// Restore the disclosure state with a second real click so subsequent checks see a clean page.
		await page.mouse.click(prepared.cx, prepared.cy);
		const openRestored = await locator.evaluate((el) => el.closest("details")?.open ?? null);
		assert.equal(openRestored, prepared.initialOpen, `${viewportLabel} ${label}: second click restores disclosure state`);
	} else {
		const clicks = await page.evaluate(() => window.__pressClicks);
		assert.equal(clicks, 1, `${viewportLabel} ${label}: real press/release must deliver a click to the link`);
	}
	await page.mouse.move(0, 0);
	await locator.evaluate(async (el) => {
		void getComputedStyle(el).backgroundColor;
		void getComputedStyle(el).color;
		void getComputedStyle(el).opacity;
		await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
	});
}

async function assertActivePressFeedback(context, page, viewportLabel) {
	const cdp = await context.newCDPSession(page);
	await cdp.send("DOM.enable");
	await cdp.send("CSS.enable");
	const { root } = await cdp.send("DOM.getDocument");
	for (const [label, selector] of [
		["header anchor link", "header nav ul a"],
		["footer column link", "footer ul a"],
		["stats method summary", ".stats-method summary"],
		["Pre-IPO market link", '#markets ul a[href*="/trade/"]'],
		["Pre-IPO docs link", '#markets ul a[rel="noopener"]'],
	]) {
		const beforeStyle = await page.locator(selector).first().evaluate((el) => {
			const s = getComputedStyle(el);
			return { bg: s.backgroundColor, color: s.color, opacity: s.opacity, transform: s.transform };
		});
		const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
		assert.ok(nodeId > 0, `${viewportLabel} ${label}: element found`);
		await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] });
		// Under reducedMotion, global.css sets transition-duration: 0.01ms on *, so flush style first
		// to start any 0.01ms CSS transition, then await Web Animations completion before reading style.
		const activeStyle = await page.locator(selector).first().evaluate(async (el) => {
			void getComputedStyle(el).backgroundColor;
			void getComputedStyle(el).color;
			void getComputedStyle(el).opacity;
			await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
			const s = getComputedStyle(el);
			return { bg: s.backgroundColor, color: s.color, opacity: s.opacity, transform: s.transform };
		});
		await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
		await page.locator(selector).first().evaluate(async (el) => {
			void getComputedStyle(el).backgroundColor;
			void getComputedStyle(el).color;
			void getComputedStyle(el).opacity;
			await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
		});
		const changed =
			beforeStyle.bg !== activeStyle.bg ||
			beforeStyle.color !== activeStyle.color ||
			beforeStyle.opacity !== activeStyle.opacity ||
			beforeStyle.transform !== activeStyle.transform;
		assert.equal(changed, true, `${viewportLabel} ${label}: must show visible :active press feedback`);

		await assertRealPointerPress(page, label, selector, viewportLabel);
	}
	await cdp.detach();
}
