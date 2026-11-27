// Runs src/scripts/open-book.ts on the built home page in jsdom with a fake WebSocket, clock, Web Lock and
// IntersectionObserver, and checks which quote the Live market view shows after each sequence of bbo and l2Book
// frames. Nothing connects to the network. Per the WebSocket subscriptions page, bbo frames are sent only when the
// best bid or offer changes on a block, and either side may be null; l2Book snapshots carry their block time.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { startOpenBook } from "../../src/scripts/open-book.ts";

const HOME_HTML = readFileSync(new URL("../../dist/index.html", import.meta.url), "utf8");

function boot(
	t,
	{ reducedMotion = false, supportsLive = true, initiallyOnScreen = true, initialReadyState = 1, requestLock = null, canvasContext = null } = {},
) {
	const { window } = new JSDOM(HOME_HTML, { pretendToBeVisual: true });
	const root = window.document.querySelector("[data-open-book]");
	const panel = root.closest("[data-tabpanel]");
	panel.hidden = false;
	const canvas = root.querySelector("canvas");
	canvas.getContext = () => canvasContext ?? {};
	const sockets = [];
	const sentMessages = [];
	let socket;
	let elapsed = 1;
	let intersectCallback = null;
	let rafCallback = null;
	class FakeSocket extends EventTarget {
		static CONNECTING = 0;
		static OPEN = 1;
		static CLOSED = 3;
		readyState = initialReadyState;
		sent = [];
		constructor() {
			super();
			socket = this;
			sockets.push(this);
		}
		send(payload) {
			this.sent.push(payload);
			sentMessages.push({ socket: this, payload });
		}
		open() {
			this.readyState = 1;
			this.dispatchEvent(new Event("open"));
		}
		close() {
			this.readyState = 3;
		}
	}
	class Observer {
		constructor(callback) {
			this.callback = callback;
			intersectCallback = callback;
		}
		observe() {
			if (initiallyOnScreen) this.callback([{ isIntersecting: true }]);
		}
	}
	if (supportsLive) {
		window.WebSocket = FakeSocket;
		window.IntersectionObserver = Observer;
	} else {
		delete window.WebSocket;
		delete window.IntersectionObserver;
	}
	window.matchMedia = (query) => ({
		matches: reducedMotion && query.includes("prefers-reduced-motion"),
		addEventListener() {},
	});
	const defaultLocks = { request: (_name, _options, grant) => Promise.resolve(grant()) };
	const globals = {
		window,
		document: window.document,
		WebSocket: supportsLive ? FakeSocket : undefined,
		IntersectionObserver: supportsLive ? Observer : undefined,
		navigator: supportsLive ? { locks: requestLock ? { request: requestLock } : defaultLocks } : {},
		getComputedStyle: window.getComputedStyle.bind(window),
		MutationObserver: window.MutationObserver,
		requestAnimationFrame: (callback) => {
			rafCallback = callback;
			return 1;
		},
		cancelAnimationFrame: () => {
			rafCallback = null;
		},
	};
	for (const [name, value] of Object.entries(globals)) {
		const saved = Object.getOwnPropertyDescriptor(globalThis, name);
		if (value === undefined) delete globalThis[name];
		else Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
		t.after(() => {
			if (saved) Object.defineProperty(globalThis, name, saved);
			else delete globalThis[name];
		});
	}
	t.mock.method(performance, "now", () => elapsed);
	t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
	t.after(() => window.close());
	startOpenBook(root);
	if (supportsLive && !reducedMotion && initiallyOnScreen && !requestLock) assert.ok(socket, "the view opened its socket");

	function send(channel, data) {
		socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ channel, data }) }));
	}
	const level = (px) => ({ px, sz: "1", n: 1 });
	return {
		window,
		root,
		panel,
		canvas,
		sockets,
		sentMessages,
		book(time, bid = "90", ask = "110") {
			send("l2Book", { coin: "BTC", time, levels: [[level(bid)], [level(ask)]] });
		},
		bbo(time, bid, ask) {
			send("bbo", { coin: "BTC", time, bbo: [bid === null ? null : level(bid), ask === null ? null : level(ask)] });
		},
		trade(time, px = "100", sz = "1", tid = 1) {
			send("trades", [{ coin: "BTC", time, px, sz, side: "B", tid }]);
		},
		setIntersecting(isIntersecting) {
			intersectCallback?.([{ isIntersecting }]);
		},
		runFrame() {
			const cb = rafCallback;
			rafCallback = null;
			cb?.(elapsed);
		},
		advance(ms) {
			elapsed += ms;
			t.mock.timers.tick(ms);
		},
		quote() {
			return ["bid", "ask", "spread"].map((key) => root.querySelector(`[data-ob-${key}]`).textContent);
		},
	};
}

/** Books every 5 s for the 15 s handoff, then a two-sided bbo: the view is live and quotes the bbo. */
function liveOnBbo(t) {
	const page = boot(t);
	let time = 1_000;
	page.book(time, "95", "105");
	page.bbo(time, "95", "105");
	for (let i = 0; i < 3; i++) {
		page.advance(5_000);
		time += 5_000;
		page.book(time, "95", "105");
	}
	page.advance(1_000);
	assert.equal(page.root.dataset.phase, "live");
	assert.deepEqual(page.quote(), ["$95", "$105", "$10"]);
	return { page, time };
}

test("an unchanged bbo stays the live quote while consistent books keep arriving", (t) => {
	let { page, time } = liveOnBbo(t);
	for (let i = 0; i < 8; i++) {
		page.advance(5_000);
		time += 5_000;
		page.book(time, "95", "105");
	}
	page.advance(1_000);
	assert.equal(page.root.dataset.phase, "live", "bbo frames come only on a change, so silence alone is not staleness");
	assert.deepEqual(page.quote(), ["$95", "$105", "$10"]);
});

test("a one-sided bbo withdraws the quote at once, and an older frame cannot bring it back", (t) => {
	const { page, time } = liveOnBbo(t);
	page.bbo(time + 100, null, "105");
	assert.deepEqual(page.quote(), ["", "", ""], "no best bid, so no bid, spread or mid");
	assert.notEqual(page.root.dataset.phase, "live");
	page.bbo(time + 50, "94", "105");
	page.book(time + 50, "94", "106");
	page.advance(20_000);
	assert.deepEqual(page.quote(), ["", "", ""]);
});

test("a book from the same block as a one-sided bbo cannot bring the quote back; a newer book can", (t) => {
	const { page, time } = liveOnBbo(t);
	page.bbo(time + 100, null, "105");
	page.book(time + 100, "94", "106");
	assert.deepEqual(page.quote(), ["", "", ""]);
	assert.notEqual(page.root.dataset.phase, "live");
	let at = time + 100;
	for (let i = 0; i < 3; i++) {
		page.advance(5_000);
		at += 5_000;
		page.book(at, "94", "106");
	}
	assert.notEqual(
		page.root.dataset.phase,
		"live",
		"15 s after the same-block book, but only 10 s after the first newer one: the handoff counts from the newer book",
	);
	page.advance(5_000);
	at += 5_000;
	page.book(at, "94", "106");
	assert.equal(page.root.dataset.phase, "live");
	assert.deepEqual(page.quote(), ["$94", "$106", "$12"]);
});

test("a later two-sided bbo restores the live quote after the handoff", (t) => {
	const { page, time } = liveOnBbo(t);
	page.bbo(time + 100, null, "105");
	page.bbo(time + 200, "97", "105");
	let at = time + 200;
	for (let i = 0; i < 3; i++) {
		page.advance(5_000);
		at += 5_000;
		page.book(at, "97", "105");
	}
	page.advance(1_000);
	assert.equal(page.root.dataset.phase, "live");
	assert.deepEqual(page.quote(), ["$97", "$105", "$8"]);
});

test("a newer book that contradicts the last bbo replaces the quote with the book's", (t) => {
	const { page, time } = liveOnBbo(t);
	page.book(time + 500, "99", "101");
	page.advance(1_000);
	assert.deepEqual(page.quote(), ["$99", "$101", "$2"], "the bbo has moved since its last frame");
	page.bbo(time + 400, "95", "105");
	page.advance(1_000);
	assert.deepEqual(page.quote(), ["$99", "$101", "$2"], "a bbo older than the book cannot take the quote back");
	page.bbo(time + 600, "98", "100");
	page.advance(1_000);
	assert.deepEqual(page.quote(), ["$98", "$100", "$2"], "a newer bbo quotes again");
});

test("a book older than the bbo cannot overrule it", (t) => {
	const { page, time } = liveOnBbo(t);
	page.bbo(time + 500, "96", "104");
	page.book(time + 400, "99", "101");
	page.advance(1_000);
	assert.deepEqual(page.quote(), ["$96", "$104", "$8"]);
});

test("a first bbo older than the shown book quote cannot replace it", (t) => {
	const page = boot(t);
	let time = 10_000;
	page.book(time);
	for (let i = 0; i < 3; i++) {
		page.advance(5_000);
		time += 5_000;
		page.book(time);
	}
	page.bbo(time - 1, "95", "105");
	page.advance(1_000);
	assert.equal(page.root.dataset.phase, "live");
	assert.deepEqual(page.quote(), ["$90", "$110", "$20"]);
});

test("G-04: stalling after the first warm-up book resets and reconnects, and a late trade never flips a stale book to Live", (t) => {
	const page = boot(t);
	page.book(1_000, "95", "105");
	assert.equal(page.sockets.length, 1);

	// 16 s after the lone book (past BOOK_FRESH_MS = 12 s), a lone trade must not flip the stale book to Live.
	page.advance(16_000);
	page.trade(17_000, "100", "2", 10);
	assert.equal(page.root.dataset.phase, "recorded", "a lone trade after a stale warm-up book must not enter Live");

	// Past SILENT_LIMIT_MS (20 s total silence since the lone book), warm-up drops and reconnects within budget.
	page.advance(5_000);
	assert.equal(page.sockets[0].readyState, 3, "the stalled warm-up socket is closed");
	page.advance(1_000);
	assert.equal(page.sockets.length, 2, "warm-up opens a fresh socket within the connection budget");

	// A trade on the fresh socket without a fresh book also cannot enter Live.
	page.trade(25_000, "101", "1", 11);
	assert.equal(page.root.dataset.phase, "recorded");
});

test("G-05: pausing during warm-up or returning from bfcache while paused keeps Paused state and never promises auto-switch", (t) => {
	const page = boot(t);
	const pause = page.root.querySelector("[data-ob-pause]");
	const state = page.root.querySelector("[data-ob-state]");
	const note = page.root.querySelector("[data-ob-note]");
	const canvas = page.root.querySelector("[data-ob-canvas]");
	const poster = page.root.querySelector("[data-ob-poster]");

	// Receive one warm-up book (canvas has never been drawn), then pause before 15 s handoff.
	page.book(1_000, "95", "105");
	pause.click();
	assert.equal(page.root.dataset.phase, "paused");
	assert.equal(state.textContent.trim(), "Paused");
	assert.equal(pause.textContent.trim(), "Resume");
	assert.equal(pause.getAttribute("aria-pressed"), "true");
	assert.equal(canvas.hidden, true, "pausing during warm-up keeps the recorded poster instead of an empty canvas");
	assert.equal(poster.hidden, false);
	assert.doesNotMatch(note.textContent, /Switches to live/i);
	assert.match(note.textContent, /Paused\./i);

	// Resume, go live, pause on live canvas, then simulate pagehide (bfcache).
	pause.click();
	assert.equal(page.root.dataset.phase, "recorded");
	let time = 2_000;
	page.book(time, "95", "105");
	for (let i = 0; i < 3; i++) {
		page.advance(5_000);
		time += 5_000;
		page.book(time, "95", "105");
	}
	page.advance(1_000);
	assert.equal(page.root.dataset.phase, "live");
	pause.click();
	assert.equal(page.root.dataset.phase, "paused");
	assert.equal(canvas.hidden, false, "pausing while live freezes the canvas");

	page.window.dispatchEvent(new page.window.Event("pagehide"));
	assert.equal(page.root.dataset.phase, "paused", "pagehide preserves paused state for bfcache restore");
	assert.equal(state.textContent.trim(), "Paused");
	assert.equal(canvas.hidden, true, "pagehide drops stale canvas data and falls back to the poster");
	assert.equal(poster.hidden, false);
	assert.doesNotMatch(note.textContent, /Switches to live/i);
});

test("G-07: aria-busy stays scoped to the live numbers list and clears on recorded, paused, unavailable and unsupported states", async (t) => {
	await t.test("reduced motion keeps neither root nor numbers busy on the recorded poster", (st) => {
		const reduced = boot(st, { reducedMotion: true });
		const reducedStats = reduced.root.querySelector("[data-ob-stats]");
		assert.ok(reducedStats, "live numbers list carries [data-ob-stats]");
		assert.notEqual(reduced.root.getAttribute("aria-busy"), "true", "root never marks controls and notes as busy");
		assert.equal(reducedStats.getAttribute("aria-busy"), "false", "recorded poster waiting for opt-in is not busy");
	});

	await t.test("unsupported browser leaves nothing busy", (st) => {
		const unsupported = boot(st, { supportsLive: false });
		const unsupportedStats = unsupported.root.querySelector("[data-ob-stats]");
		assert.ok(unsupportedStats);
		assert.notEqual(unsupported.root.getAttribute("aria-busy"), "true");
		assert.notEqual(unsupportedStats.getAttribute("aria-busy"), "true");
	});

	await t.test("normal opt-in is busy during warm-up and clears on live, paused and unavailable", (st) => {
		const page = boot(st);
		const stats = page.root.querySelector("[data-ob-stats]");
		assert.ok(stats);
		assert.notEqual(page.root.getAttribute("aria-busy"), "true", "root is never busy during warm-up");
		assert.equal(stats.getAttribute("aria-busy"), "true", "numbers list is busy while waiting for live data");

		let time = 1_000;
		page.book(time, "95", "105");
		for (let i = 0; i < 3; i++) {
			page.advance(5_000);
			time += 5_000;
			page.book(time, "95", "105");
		}
		page.advance(1_000);
		assert.equal(page.root.dataset.phase, "live");
		assert.equal(stats.getAttribute("aria-busy"), "false", "numbers list clears busy once live");

		page.root.querySelector("[data-ob-pause]").click();
		assert.equal(page.root.dataset.phase, "paused");
		assert.notEqual(page.root.getAttribute("aria-busy"), "true");
		assert.equal(stats.getAttribute("aria-busy"), "false", "numbers list is not busy while paused");

		// Resume and exhaust the 3-per-minute connection budget so phase becomes unavailable.
		page.root.querySelector("[data-ob-pause]").click();
		for (let i = 0; i < 3; i++) {
			page.sockets.at(-1).dispatchEvent(new Event("close"));
			page.advance(1_000);
		}
		assert.equal(page.root.dataset.phase, "unavailable");
		assert.notEqual(page.root.getAttribute("aria-busy"), "true");
		assert.equal(stats.getAttribute("aria-busy"), "false", "numbers list clears busy when unavailable");
	});
});

test("I-01: after entering Live, stopping l2Book while bbo continues drops back to recorded once BOOK_FRESH_MS expires instead of drawing stale depth to now", (t) => {
	const rects = [];
	const mockCtx = {
		setTransform() {},
		clearRect() {},
		beginPath() {},
		moveTo() {},
		lineTo() {},
		stroke() {},
		save() {},
		rect() {},
		clip() {},
		fillRect(...args) {
			rects.push(args);
		},
		arc() {},
		fill() {},
		restore() {},
		fillText() {},
		measureText: () => ({ width: 40 }),
	};
	const page = boot(t, { canvasContext: mockCtx });
	Object.defineProperty(page.canvas, "clientWidth", { value: 600, configurable: true });
	Object.defineProperty(page.canvas, "clientHeight", { value: 300, configurable: true });

	let time = 1_000;
	page.book(time, "95", "105");
	page.bbo(time, "95", "105");
	for (let i = 0; i < 3; i++) {
		page.advance(5_000);
		time += 5_000;
		page.book(time, "95", "105");
	}
	page.advance(1_000);
	assert.equal(page.root.dataset.phase, "live");
	assert.deepEqual(page.quote(), ["$95", "$105", "$10"]);

	// Stop l2Book while valid two-sided bbo keeps arriving every 4 s.
	// At 12 s after last l2Book, depth is still fresh; by 13 s (past BOOK_FRESH_MS = 12 s),
	// live view must drop back to recorded rather than keeping Live and extending stale depth to 0 s.
	for (let i = 0; i < 3; i++) {
		page.advance(4_000);
		time += 4_000;
		page.bbo(time, "95", "105");
	}
	rects.length = 0;
	page.advance(1_000);
	page.runFrame();
	assert.equal(page.root.dataset.phase, "recorded", "stale l2Book (> 12 s) must exit Live even while bbo keeps arriving");
	assert.equal(page.canvas.hidden, true, "stale depth canvas must hide back to poster");
	assert.deepEqual(page.quote(), ["", "", ""], "live numbers clear once book depth is stale");
	assert.equal(rects.length, 0, "stale depth must not be drawn to now");
	assert.equal(page.sockets[0].readyState, 3, "stalled socket is closed");
	page.advance(1_000);
	assert.equal(page.sockets.length, 2, "reconnect still follows the existing budget");
});

test("I-02: connection budget counts actual Web Lock grant time, and open callback re-checks socket identity and wanted()", async (t) => {
	await t.test("delayed Web Lock grant still enforces at most 3 real connections per minute", async (st) => {
		const pendingGrants = [];
		const page = boot(st, {
			requestLock: (_name, options, grant) =>
				new Promise((resolve, reject) => {
					const entry = {
						grant: () => Promise.resolve(grant()).then(resolve, reject),
					};
					options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					pendingGrants.push(entry);
				}),
		});
		assert.equal(page.sockets.length, 0, "no socket opened before the lock is granted");

		// Wait 61 s in the lock queue before the lock is granted.
		page.advance(61_000);
		pendingGrants.shift().grant();
		await Promise.resolve();
		assert.equal(page.sockets.length, 1, "first real connection opens at t = 61 s");

		// Three rapid closes within 3 s must exhaust the 3-per-minute budget (never a 4th connection in the same minute).
		for (let i = 0; i < 3; i++) {
			page.sockets.at(-1).dispatchEvent(new Event("close"));
			page.advance(1_000);
			while (pendingGrants.length > 0) {
				pendingGrants.shift().grant();
				await Promise.resolve();
			}
		}
		assert.equal(page.sockets.length, 3, "only 3 real connections allowed within 60 s after lock grant");
		assert.equal(page.root.dataset.phase, "unavailable");
	});

	await t.test("handshake open callback sends no subscriptions while hidden, and subscribes once visible again", async (st) => {
		const page = boot(st, { initialReadyState: 0 });
		assert.equal(page.sockets.length, 1);
		const first = page.sockets[0];
		assert.equal(first.sent.length, 0);

		// Hide the panel while handshake is in flight.
		page.panel.hidden = true;
		await Promise.resolve();
		first.open();
		assert.equal(first.sent.length, 0, "must not send subscriptions while panel is hidden");

		// Returning to the panel before idle disconnect reuses the open socket and subscribes once.
		page.panel.hidden = false;
		await Promise.resolve();
		assert.equal(page.sockets.length, 1, "reuses the already-open socket");
		assert.equal(first.sent.length, 3, "sends the 3 subscriptions once visible again");

		// A stale socket firing open after replacement must send nothing.
		first.dispatchEvent(new Event("close"));
		page.advance(1_000);
		assert.equal(page.sockets.length, 2);
		first.open();
		assert.equal(first.sent.length, 3, "stale socket must not send again");
	});
});

test("I-04: exhausting the connection budget while Pause is focused moves focus to the visible panel and leaves external focus alone", async (t) => {
	await t.test("focus on Pause moves to the active panel when budget runs out", (st) => {
		const page = boot(st);
		const pause = page.root.querySelector("[data-ob-pause]");
		assert.equal(pause.hidden, false);
		pause.focus();
		assert.equal(page.window.document.activeElement, pause);

		for (let i = 0; i < 3; i++) {
			page.sockets.at(-1).dispatchEvent(new Event("close"));
			page.advance(1_000);
		}
		assert.equal(page.root.dataset.phase, "unavailable");
		assert.equal(pause.hidden, true);
		assert.equal(page.panel.getAttribute("tabindex"), "0", "panel becomes keyboard focusable");
		assert.equal(page.window.document.activeElement, page.panel, "focus moves to the visible panel instead of being lost");
	});

	await t.test("focus outside the preview stays untouched when budget runs out", (st) => {
		const page = boot(st);
		const outsideTab = page.window.document.getElementById("preview-tab-live");
		outsideTab.focus();
		assert.equal(page.window.document.activeElement, outsideTab);

		for (let i = 0; i < 3; i++) {
			page.sockets.at(-1).dispatchEvent(new Event("close"));
			page.advance(1_000);
		}
		assert.equal(page.root.dataset.phase, "unavailable");
		assert.equal(page.window.document.activeElement, outsideTab, "external focus must not be stolen");
	});
});

test("I-05: aria-busy tracks active fetch intent and clears before visibility, offscreen idle disconnect, and background tabs", async (t) => {
	await t.test("offscreen at startup is not busy until it enters view", (st) => {
		const page = boot(st, { initiallyOnScreen: false });
		const stats = page.root.querySelector("[data-ob-stats]");
		assert.equal(page.sockets.length, 0);
		assert.equal(stats.getAttribute("aria-busy"), "false", "must not report busy before fetch intent begins");

		page.setIntersecting(true);
		assert.equal(page.sockets.length, 1);
		assert.equal(stats.getAttribute("aria-busy"), "true", "becomes busy once fetching starts");
	});

	await t.test("scrolling offscreen and idling back to recorded clears aria-busy until visible again", (st) => {
		const page = boot(st);
		const stats = page.root.querySelector("[data-ob-stats]");
		assert.equal(stats.getAttribute("aria-busy"), "true");

		page.setIntersecting(false);
		assert.equal(stats.getAttribute("aria-busy"), "false", "clears busy once fetching stops offscreen");

		// After IDLE_DISCONNECT_MS (30 s), dropToRecorded(false) closes the socket; stats must stay non-busy.
		page.advance(31_000);
		assert.equal(page.root.dataset.phase, "recorded");
		assert.equal(page.sockets[0].readyState, 3);
		assert.equal(stats.getAttribute("aria-busy"), "false", "stays non-busy after idle disconnect");

		// Scrolling back into view resumes fetching and marks busy again.
		page.setIntersecting(true);
		assert.equal(page.sockets.length, 2);
		assert.equal(stats.getAttribute("aria-busy"), "true", "sets busy again when fetch resumes");
	});

	await t.test("hiding the document clears aria-busy and restores it when visible again", (st) => {
		const page = boot(st);
		const stats = page.root.querySelector("[data-ob-stats]");
		assert.equal(stats.getAttribute("aria-busy"), "true");

		Object.defineProperty(page.window.document, "visibilityState", { value: "hidden", configurable: true });
		page.window.document.dispatchEvent(new page.window.Event("visibilitychange"));
		assert.equal(stats.getAttribute("aria-busy"), "false", "clears busy in background tab");

		Object.defineProperty(page.window.document, "visibilityState", { value: "visible", configurable: true });
		page.window.document.dispatchEvent(new page.window.Event("visibilitychange"));
		assert.equal(stats.getAttribute("aria-busy"), "true", "restores busy when tab becomes visible again");
	});
});

test("F-03: replayed or older l2Book frames never renew Live depth freshness, and heatmap columns never paint across gaps > BOOK_FRESH_MS", async (t) => {
	await t.test("replaying the last l2Book timestamp while bbo advances still exits Live after BOOK_FRESH_MS", (st) => {
		const { page, time } = liveOnBbo(st);
		let bboTime = time;
		const staleBookTime = time;

		// Replay the same (and an older) l2Book timestamp every 4 s while bbo keeps advancing.
		for (let i = 0; i < 3; i++) {
			page.advance(4_000);
			bboTime += 4_000;
			page.bbo(bboTime, "95", "105");
			page.book(i === 1 ? staleBookTime - 1_000 : staleBookTime, "95", "105");
		}
		// At 13 s since the last advancing book (> BOOK_FRESH_MS = 12 s), Live must end.
		page.advance(1_000);
		bboTime += 1_000;
		page.bbo(bboTime, "95", "105");
		page.book(staleBookTime, "95", "105");

		assert.equal(page.root.dataset.phase, "recorded", "replayed l2Book frames must not keep Live past BOOK_FRESH_MS");
		assert.equal(page.canvas.hidden, true);
		assert.deepEqual(page.quote(), ["", "", ""]);
		assert.equal(page.sockets[0].readyState, 3);
	});

	await t.test("a warm-up depth gap longer than BOOK_FRESH_MS leaves an unpainted gap in the heatmap", (st) => {
		const rects = [];
		const mockCtx = {
			setTransform() {},
			clearRect() {},
			beginPath() {},
			moveTo() {},
			lineTo() {},
			stroke() {},
			save() {},
			rect() {},
			clip() {},
			fillRect(...args) {
				rects.push(args);
			},
			arc() {},
			fill() {},
			restore() {},
			fillText() {},
			measureText: () => ({ width: 40 }),
		};
		const page = boot(st, { canvasContext: mockCtx });
		Object.defineProperty(page.canvas, "clientWidth", { value: 600, configurable: true });
		Object.defineProperty(page.canvas, "clientHeight", { value: 300, configurable: true });

		// First book at t = 1_000, then keep the connection alive with bbo for a 13 s depth gap (> 12 s).
		page.book(1_000, "95", "105");
		for (const offset of [4_000, 8_000, 12_000]) {
			page.advance(4_000);
			page.bbo(1_000 + offset, "95", "105");
		}
		// Resume normal books at t = 14_000 (13 s after t = 1_000) and complete the 15 s warm-up.
		page.advance(1_000);
		let time = 14_000;
		page.book(time, "95", "105");
		for (let i = 0; i < 3; i++) {
			page.advance(5_000);
			time += 5_000;
			page.book(time, "95", "105");
		}
		assert.equal(page.root.dataset.phase, "live");

		rects.length = 0;
		page.advance(100);
		page.runFrame();

		// Plot coordinates: width 600, labelWidth 40 => plotWidth = 542.
		// from = firstBookT = 1_000, now = 29_000 + 100 = 29_100, span = 28_100.
		const plotWidth = 600 - 40 - 18;
		const from = 1_000;
		const span = 28_100;
		const xAt = (t) => ((t - from) / span) * plotWidth;
		const gapStartX = xAt(13_000);
		const gapMidX = xAt(13_500);
		const heatRects = rects.filter(([rx]) => rx < plotWidth);
		assert.ok(heatRects.length > 0, "heatmap columns were drawn");
		const coveringGap = heatRects.filter(([rx, , rw]) => rx < gapMidX && rx + rw > gapMidX);
		assert.deepEqual(coveringGap, [], "no heatmap column may paint across the >12 s depth gap");
		const firstColRects = heatRects.filter(([rx]) => rx < 1);
		assert.ok(firstColRects.length > 0, "the pre-gap column is still drawn up to its 12 s freshness limit");
		for (const [rx, , rw] of firstColRects) {
			assert.ok(rx + rw <= gapStartX + 0.5, `first column right edge ${rx + rw} exceeded 12 s freshness x=${gapStartX}`);
		}
	});
});

test("F-04: closing the active socket while hidden clears warm-up progress and cached snapshots before a new socket connects", async (t) => {
	const page = boot(t);
	let time = 1_000;
	page.book(time, "95", "105");
	page.trade(time + 500, "102", "1", 77);
	for (const step of [5_000, 5_000, 4_000]) {
		page.advance(step);
		time += step;
		page.book(time, "95", "105");
	}
	// 14 s of warm-up accumulated; still recorded.
	assert.equal(page.root.dataset.phase, "recorded");
	const firstSocket = page.sockets[0];

	// Switch to Terminal tab (panel hidden), then the old socket closes while hidden.
	page.panel.hidden = true;
	await Promise.resolve();
	firstSocket.dispatchEvent(new Event("close"));

	// Return within 2 s (well under BOOK_FRESH_MS = 12 s) and feed one frame on the new socket.
	page.advance(2_000);
	assert.equal(page.sockets.length, 1, "no reconnect is scheduled while hidden");
	page.panel.hidden = false;
	await Promise.resolve();
	assert.equal(page.sockets.length, 2, "returning opens a fresh socket");

	time += 2_000;
	page.book(time, "96", "104");
	assert.equal(page.root.dataset.phase, "recorded", "a single frame on the new socket must not inherit old warm-up and enter Live");

	// Must complete a full 15 s warm-up on the new socket before entering Live.
	for (let i = 0; i < 2; i++) {
		page.advance(5_000);
		time += 5_000;
		page.book(time, "96", "104");
	}
	assert.equal(page.root.dataset.phase, "recorded", "still warming up at 10 s on the new socket");

	page.advance(5_000);
	time += 5_000;
	page.book(time, "96", "104");
	assert.equal(page.root.dataset.phase, "live", "enters Live after a full 15 s warm-up on the new socket");
	assert.equal(page.root.querySelector("[data-ob-last]").textContent, "", "stale lastTrade from the closed socket was cleared");
});

test("F-05: waiting on another tab's Web Lock or a rejected lock does not stay aria-busy and leaves a clear exitable poster state", async (t) => {
	await t.test("queued Web Lock held by another tab is never aria-busy, reports another-tab poster state, can pause out, and resumes if granted", async (st) => {
		let abortCount = 0;
		const pendingGrants = [];
		const page = boot(st, {
			requestLock: (_name, options, grant) =>
				new Promise((resolve, reject) => {
					const entry = {
						grant: () => Promise.resolve(grant()).then(resolve, reject),
					};
					options?.signal?.addEventListener(
						"abort",
						() => {
							abortCount += 1;
							reject(new Error("aborted"));
						},
						{ once: true },
					);
					pendingGrants.push(entry);
				}),
		});
		const stats = page.root.querySelector("[data-ob-stats]");
		const note = page.root.querySelector("[data-ob-note]");
		const poster = page.root.querySelector("[data-ob-poster]");
		const pause = page.root.querySelector("[data-ob-pause]");

		assert.equal(page.sockets.length, 0);
		assert.equal(stats.getAttribute("aria-busy"), "false", "queued lock with no socket must not mark numbers aria-busy");
		assert.doesNotMatch(note.textContent, /Switches to live/i, "must not promise a 15 s switch while queued behind another tab");

		page.advance(10_000);
		assert.equal(page.sockets.length, 0);
		assert.equal(page.root.dataset.phase, "recorded");
		assert.equal(poster.hidden, false);
		assert.equal(stats.getAttribute("aria-busy"), "false", "long lock wait must not remain aria-busy");
		assert.doesNotMatch(note.textContent, /Switches to live/i);
		assert.match(note.textContent, /another tab/i, "explains that another tab holds the live view");

		// Visitor can exit the wait via Pause, aborting the queued lock request.
		pause.click();
		await Promise.resolve();
		assert.equal(abortCount, 1, "pausing aborts the queued lock request");
		assert.equal(page.root.dataset.phase, "paused");
		assert.equal(stats.getAttribute("aria-busy"), "false");

		// Resume, wait again, then let the other tab release the lock: once granted, active fetch becomes busy.
		pause.click();
		assert.equal(stats.getAttribute("aria-busy"), "false");
		pendingGrants.at(-1).grant();
		await Promise.resolve();
		assert.equal(page.sockets.length, 1);
		assert.equal(stats.getAttribute("aria-busy"), "true", "marks busy once the lock is granted and the socket opens");
		assert.match(note.textContent, /Switches to live/i);
	});

	await t.test("rejected Web Lock request drops cleanly to an unavailable poster state without lingering aria-busy", async (st) => {
		const page = boot(st, {
			requestLock: () => Promise.reject(new Error("Lock denied")),
		});
		await Promise.resolve();
		await Promise.resolve();

		const stats = page.root.querySelector("[data-ob-stats]");
		const note = page.root.querySelector("[data-ob-note]");
		const poster = page.root.querySelector("[data-ob-poster]");

		assert.equal(page.sockets.length, 0);
		assert.equal(page.root.dataset.phase, "unavailable");
		assert.equal(poster.hidden, false);
		assert.equal(stats.getAttribute("aria-busy"), "false", "rejected lock must clear aria-busy");
		assert.doesNotMatch(note.textContent, /Switches to live/i);
		assert.match(note.textContent, /unavailable/i);
	});
});
