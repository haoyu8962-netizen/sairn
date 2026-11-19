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

function boot(t) {
	const { window } = new JSDOM(HOME_HTML, { pretendToBeVisual: true });
	const root = window.document.querySelector("[data-open-book]");
	root.closest("[data-tabpanel]").hidden = false;
	root.querySelector("canvas").getContext = () => ({});
	let socket;
	let elapsed = 1;
	class FakeSocket extends EventTarget {
		static OPEN = 1;
		readyState = 1;
		constructor() {
			super();
			socket = this;
		}
		send() {}
		close() {
			this.readyState = 3;
		}
	}
	class Observer {
		constructor(callback) {
			this.callback = callback;
		}
		observe() {
			this.callback([{ isIntersecting: true }]);
		}
	}
	window.WebSocket = FakeSocket;
	window.IntersectionObserver = Observer;
	window.matchMedia = () => ({ matches: false, addEventListener() {} });
	const globals = {
		window,
		document: window.document,
		WebSocket: FakeSocket,
		IntersectionObserver: Observer,
		navigator: { locks: { request: (_name, _options, grant) => Promise.resolve(grant()) } },
		getComputedStyle: window.getComputedStyle.bind(window),
		MutationObserver: window.MutationObserver,
		requestAnimationFrame: () => 1,
		cancelAnimationFrame: () => {},
	};
	for (const [name, value] of Object.entries(globals)) {
		const saved = Object.getOwnPropertyDescriptor(globalThis, name);
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
		t.after(() => {
			if (saved) Object.defineProperty(globalThis, name, saved);
			else delete globalThis[name];
		});
	}
	t.mock.method(performance, "now", () => elapsed);
	t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
	t.after(() => window.close());
	startOpenBook(root);
	assert.ok(socket, "the view opened its socket");

	function send(channel, data) {
		socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ channel, data }) }));
	}
	const level = (px) => ({ px, sz: "1", n: 1 });
	return {
		root,
		book(time, bid = "90", ask = "110") {
			send("l2Book", { coin: "BTC", time, levels: [[level(bid)], [level(ask)]] });
		},
		bbo(time, bid, ask) {
			send("bbo", { coin: "BTC", time, bbo: [bid === null ? null : level(bid), ask === null ? null : level(ask)] });
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
