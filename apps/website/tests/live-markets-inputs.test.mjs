// The 02 runtime script reads its market list from the inline JSON that the build writes. Unreadable JSON
// must leave the static poster in place, as an empty list does, instead of throwing out of the page script.

import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { startLiveMarkets } from "../src/scripts/live-markets.ts";

const MARKUP = `
	<div data-live-strip>static strip</div>
	<ul data-live-list><li>static card</li></ul>
	<button data-live-pause>Pause</button>
	<p data-live-asof hidden>As of <time data-live-asof-time></time></p>
`;

for (const [label, json] of [
	["malformed JSON", '[{"coin":"BTC",'],
	["an empty document", ""],
	["a value that is not a list", '{"coin":"BTC"}'],
]) {
	test(`inline inputs with ${label} leave the static markup untouched`, () => {
		const { window } = new JSDOM(`<body>${MARKUP}<script type="application/json" data-live-inputs>${json}</script></body>`);
		const before = window.document.body.innerHTML;
		assert.doesNotThrow(() => startLiveMarkets(window.document));
		assert.equal(window.document.body.innerHTML, before);
		window.close();
	});
}
