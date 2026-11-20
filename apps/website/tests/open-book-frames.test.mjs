// The Live market view's bbo reader and its cross-check against the aggregated l2Book top of book.

import assert from "node:assert/strict";
import test from "node:test";
import { bookContradictsQuote, readBbo } from "../src/scripts/open-book.ts";

const level = (px) => ({ px, sz: "1", n: 1 });

test("readBbo keeps a two-sided quote, reports an empty side as no quote and rejects invalid frames", () => {
	assert.deepEqual(readBbo({ coin: "BTC", time: 5, bbo: [level("95"), level("105")] }, "BTC"), {
		t: 5,
		quote: { bid: "95", ask: "105", t: 5 },
	});
	assert.deepEqual(readBbo({ coin: "BTC", time: 6, bbo: [null, level("105")] }, "BTC"), { t: 6, quote: null });
	assert.deepEqual(readBbo({ coin: "BTC", time: 7, bbo: [level("95"), null] }, "BTC"), { t: 7, quote: null });
	assert.deepEqual(readBbo({ coin: "BTC", time: 8, bbo: [null, null] }, "BTC"), { t: 8, quote: null });
	for (const frame of [
		{ coin: "ETH", time: 1, bbo: [level("95"), level("105")] },
		{ coin: "BTC", time: Number.NaN, bbo: [level("95"), level("105")] },
		{ coin: "BTC", time: 1, bbo: [level("105"), level("95")] },
		{ coin: "BTC", time: 1, bbo: [null, level("-1")] },
		{ coin: "BTC", time: 1, bbo: [{ px: 95 }, null] },
		{ coin: "BTC", time: 1, bbo: [level("95")] },
	]) {
		assert.equal(readBbo(frame, "BTC"), null, JSON.stringify(frame));
	}
});

test("a book contradicts the bbo only by at least one five-significant-figure bucket", () => {
	assert.equal(bookContradictsQuote({ bid: "95", ask: "105" }, { bid: "95", ask: "105" }), false);
	assert.equal(bookContradictsQuote({ bid: "95.001", ask: "105" }, { bid: "95", ask: "105" }), true);
	assert.equal(bookContradictsQuote({ bid: "94999", ask: "95001" }, { bid: "94999", ask: "95000" }), true);
	assert.equal(
		bookContradictsQuote({ bid: "100010", ask: "100020" }, { bid: "100013", ask: "100014" }),
		false,
		"above 100,000 a level is a 10-wide bucket, so a 3 or 6 difference can be rounding",
	);
	assert.equal(bookContradictsQuote({ bid: "100030", ask: "100040" }, { bid: "100013", ask: "100014" }), true);
	assert.equal(bookContradictsQuote({ bid: "99990", ask: "100010" }, { bid: "99990", ask: "100001" }), false);
});
