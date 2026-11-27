// "Open Book": the hero's Live market view, ported from designs/website-hero-prototype (variant B) as one
// lazy module. It is imported only when a visitor selects the Live market tab, and draws resting BTC orders
// over time (brighter = more size), trades as dots (size = value) and the mid price on a canvas.
//
// Data: one WebSocket to the public Hyperliquid API with l2Book, bbo and trades for one coin; no REST
// request, so it adds nothing to the info-endpoint weight the price strip uses. The socket is open only
// while the tab is selected, the panel is on screen, the document is visible, updates are not paused and
// this browser tab holds the `sairn-site-book` Web Lock. Every frame is validated fail-closed; a channel
// with three invalid frames in a row, or 20 s without valid data, drops the live view back to the recorded
// poster. Connections are budgeted (3 per minute, 6 per 5 minutes) and the view gives up for the visit
// once the budget is spent. Reduced motion and Save-Data keep the poster until the visitor asks for the
// live view. Numbers are shown only while the view is live. The quote follows the newest frame by exchange time:
// a two-sided bbo, a one-sided bbo (no quote, back to the poster), or a newer book that contradicts the bbo.

import Big from "big.js";
import { formatMarkPrice, isPositiveDecimal } from "../lib/markets/live.js";

const WS_URL = "wss://api.hyperliquid.xyz/ws";
const LOCK_NAME = "sairn-site-book";
export const N_SIG_FIGS = 5;
const LIVE_HANDOFF_MS = 15_000;
const SILENT_LIMIT_MS = 20_000;
const BOOK_FRESH_MS = 12_000;
const LOCK_WAIT_NOTE_MS = 2_000;
const IDLE_DISCONNECT_MS = 30_000;
const INVALID_FRAME_LIMIT = 3;
const BUDGET = [
	{ windowMs: 60_000, max: 3 },
	{ windowMs: 300_000, max: 6 },
];
export const MAX_LEVELS = 20;
const MIN_WINDOW_MS = 8_000;

interface Level {
	px: number;
	sz: number;
}
interface Column {
	t: number;
	levels: Level[];
}
interface Trade {
	t: number;
	px: number;
	notional: number;
	buy: boolean;
}
interface Quote {
	bid: string;
	ask: string;
	t: number;
}

type Phase = "recorded" | "live" | "paused" | "unavailable";
type ConnectionState = "idle" | "lock_queued" | "lock_waiting" | "connecting" | "subscribed" | "reconnecting" | "lock_failed";

function isLevelList(value: unknown, descending: boolean): value is { px: string; sz: string }[] {
	if (!Array.isArray(value) || value.length === 0) return false;
	let previous: Big | null = null;
	for (const level of value) {
		if (!isPositiveDecimal(level?.px) || !isPositiveDecimal(level?.sz) || !Number.isInteger(level?.n)) return false;
		const px = new Big(level.px);
		if (previous && (descending ? !px.lt(previous) : !px.gt(previous))) return false;
		previous = px;
	}
	return true;
}

/** l2Book frame for `coin`: bids strictly descending, asks strictly ascending, best bid below best ask. */
export function readBook(data: unknown, coin: string): { t: number; bids: { px: string; sz: string }[]; asks: { px: string; sz: string }[] } | null {
	const frame = data as { coin?: unknown; time?: unknown; levels?: unknown };
	if (frame?.coin !== coin || typeof frame.time !== "number" || !Number.isFinite(frame.time)) return null;
	if (!Array.isArray(frame.levels) || frame.levels.length !== 2) return null;
	const [bids, asks] = frame.levels;
	if (!isLevelList(bids, true) || !isLevelList(asks, false)) return null;
	if (!new Big(bids[0].px).lt(asks[0].px)) return null;
	return { t: frame.time, bids, asks };
}

/**
 * bbo frame for `coin`: `quote` is the two-sided best bid and offer, or null when a side is empty (the book has no
 * quote). Invalid frames, including a crossed quote, are null.
 */
export function readBbo(data: unknown, coin: string): { t: number; quote: Quote | null } | null {
	const frame = data as { coin?: unknown; time?: unknown; bbo?: unknown };
	if (frame?.coin !== coin || typeof frame.time !== "number" || !Number.isFinite(frame.time)) return null;
	if (!Array.isArray(frame.bbo) || frame.bbo.length !== 2) return null;
	const [bid, ask] = frame.bbo as [{ px?: unknown } | null, { px?: unknown } | null];
	if ((bid !== null && !isPositiveDecimal(bid?.px)) || (ask !== null && !isPositiveDecimal(ask?.px))) return null;
	if (bid === null || ask === null) return { t: frame.time, quote: null };
	if (!new Big(bid.px as string).lt(ask.px as string)) return null;
	return { t: frame.time, quote: { bid: bid.px as string, ask: ask.px as string, t: frame.time } };
}

/**
 * Does an l2Book top of book, aggregated to N_SIG_FIGS, show that the true best bid or ask is no longer `quote`?
 * Aggregation moves a price by less than one bucket (10^(e - N_SIG_FIGS + 1) for a price of exponent e) whichever way
 * it rounds, so a difference of a full bucket or more cannot come from aggregation.
 */
export function bookContradictsQuote(book: { bid: string; ask: string }, quote: { bid: string; ask: string }): boolean {
	return [
		[book.bid, quote.bid],
		[book.ask, quote.ask],
	].some(([shown, exact]) => {
		const a = new Big(shown);
		const b = new Big(exact);
		const bucket = new Big(10).pow(Math.max(a.e, b.e) - N_SIG_FIGS + 1);
		return a.minus(b).abs().gte(bucket);
	});
}

/** Trades for `coin`; invalid entries are dropped one by one, never drawn. */
export function readTrades(data: unknown, coin: string): { key: string; t: number; px: string; sz: string; buy: boolean }[] {
	if (!Array.isArray(data)) return [];
	const trades = [];
	for (const trade of data) {
		if (trade?.coin !== coin || (trade.side !== "B" && trade.side !== "A")) continue;
		if (!isPositiveDecimal(trade.px) || !isPositiveDecimal(trade.sz)) continue;
		if (typeof trade.time !== "number" || !Number.isFinite(trade.time) || !Number.isInteger(trade.tid)) continue;
		trades.push({ key: `${trade.time}:${trade.tid}`, t: trade.time, px: trade.px, sz: trade.sz, buy: trade.side === "B" });
	}
	return trades;
}

/** May a new connection open at `now`? Counts every attempt in each rolling window. */
export function connectionAllowed(attempts: readonly number[], now: number): boolean {
	return BUDGET.every(({ windowMs, max }) => attempts.filter((at) => at > now - windowMs).length < max);
}

/** Price gridlines for the visible range: a 1, 2, 2.5 or 5 × 10^n step giving at most `maxTicks` lines. */
export function axisPriceTicks(min: number, max: number, maxTicks: number): { values: number[]; decimals: number } {
	if (!(max > min) || maxTicks < 1) return { values: [], decimals: 0 };
	const rough = (max - min) / maxTicks;
	const power = 10 ** Math.floor(Math.log10(rough));
	const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? 10 * power;
	const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (step / power === 2.5 ? 1 : 0));
	const values: number[] = [];
	for (let value = Math.ceil(min / step) * step; value <= max; value += step) values.push(Number(value.toFixed(decimals)));
	return { values, decimals };
}

/** "79,665" or, for the mid tag, "79,665.5": grouped thousands and the step's decimals (one more for a half tick). */
export function formatAxisPrice(value: number | string, decimals: number, exact = false): string {
	const big = new Big(value);
	const fraction = exact ? (big.toString().split(".")[1]?.length ?? 0) : 0;
	const shown = big.toFixed(Math.min(6, Math.max(decimals, fraction)));
	const [whole, part] = shown.split(".");
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return part ? `${grouped}.${part}` : grouped;
}

const TIME_STEPS_S = [5, 10, 15, 30, 60, 120];

/** Time gridlines as offsets before now (ms), at a 5 s – 2 min step giving at most `maxTicks` intervals. */
export function axisTimeTicks(spanMs: number, maxTicks: number): { offsets: number[] } {
	const stepS = TIME_STEPS_S.find((candidate) => spanMs / (candidate * 1000) <= maxTicks) ?? TIME_STEPS_S.at(-1) ?? 60;
	const offsets: number[] = [];
	for (let offset = 0; offset <= spanMs; offset += stepS * 1000) offsets.push(offset);
	return { offsets };
}

/** "now", "−30 s", "−1 min", "−1.5 min". */
export function formatAgo(offsetMs: number): string {
	if (offsetMs <= 0) return "now";
	const seconds = Math.round(offsetMs / 1000);
	if (seconds < 60) return `\u2212${seconds} s`;
	return `\u2212${Number((seconds / 60).toFixed(1))} min`;
}

function utcTime(ms: number): string {
	return new Date(ms).toISOString().slice(11, 16);
}

interface Elements {
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
	poster: HTMLElement;
	panel: HTMLElement;
	pause: HTMLButtonElement;
	start: HTMLButtonElement;
	state: HTMLElement;
	note: HTMLElement;
	stats: HTMLElement | null;
	slots: Record<"bid" | "ask" | "spread" | "last", HTMLElement | null>;
}

function readElements(root: HTMLElement): Elements | null {
	const canvas = root.querySelector<HTMLCanvasElement>("[data-ob-canvas]");
	const context = canvas?.getContext("2d");
	const poster = root.querySelector<HTMLElement>("[data-ob-poster]");
	const pause = root.querySelector<HTMLButtonElement>("[data-ob-pause]");
	const start = root.querySelector<HTMLButtonElement>("[data-ob-start]");
	const state = root.querySelector<HTMLElement>("[data-ob-state]");
	const note = root.querySelector<HTMLElement>("[data-ob-note]");
	if (!canvas || !context || !poster || !pause || !start || !state || !note) return null;
	return {
		canvas,
		context,
		poster,
		panel: root.closest<HTMLElement>("[data-tabpanel]") ?? root,
		pause,
		start,
		state,
		note,
		stats: root.querySelector<HTMLElement>("[data-ob-stats]"),
		slots: {
			bid: root.querySelector<HTMLElement>("[data-ob-bid]"),
			ask: root.querySelector<HTMLElement>("[data-ob-ask]"),
			spread: root.querySelector<HTMLElement>("[data-ob-spread]"),
			last: root.querySelector<HTMLElement>("[data-ob-last]"),
		},
	};
}

export function startOpenBook(root: HTMLElement): void {
	if (root.dataset.started === "true") return;
	root.dataset.started = "true";
	const coin = root.dataset.coin ?? "BTC";
	const szDecimals = Number(root.dataset.szDecimals ?? "5");
	const recordedNote = root.dataset.recordedNote ?? "";
	const elements = readElements(root);
	if (!elements) return;
	const { canvas, context, poster, panel, pause, start, state, note, stats, slots } = elements;
	if (!("WebSocket" in window) || !("locks" in navigator) || !navigator.locks || !("IntersectionObserver" in window)) {
		stats?.setAttribute("aria-busy", "false");
		note.textContent = `${recordedNote} This browser cannot show the live view.`;
		return;
	}

	const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	const mobileQuery = window.matchMedia("(max-width: 639px)");
	const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
	const styles = getComputedStyle(root);
	const colors = {
		heat: styles.getPropertyValue("--ob-heat").trim() || "rgb(170 180 188)",
		buy: styles.getPropertyValue("--ob-buy").trim() || "rgb(119 199 175)",
		sell: styles.getPropertyValue("--ob-sell").trim() || "rgb(255 156 156)",
		mid: styles.getPropertyValue("--ob-mid").trim() || "rgb(237 238 242)",
		grid: styles.getPropertyValue("--ob-grid").trim() || "rgb(255 255 255 / 6%)",
		axis: styles.getPropertyValue("--ob-axis").trim() || "rgb(255 255 255 / 60%)",
		axisBg: styles.getPropertyValue("--ob-axis-bg").trim() || "rgb(15 26 31)",
	};
	const fontFamily = styles.getPropertyValue("--font-mono").trim() || "ui-monospace, monospace";

	let phase: Phase = "recorded";
	let optedIn = !(reducedQuery.matches || connection?.saveData === true);
	let paused = false;
	let pageHidden = false;
	let onScreen = false;
	let socket: WebSocket | null = null;
	let subscribed = false;
	let socketOpenedAt = 0;
	let connectionState: ConnectionState = "idle";
	let lockQueuedAt = 0;
	let releaseLock: (() => void) | null = null;
	let lockAbort: AbortController | null = null;
	const attempts: number[] = [];
	let liveSince = 0;
	let lastValidAt = 0;
	let lastBookAt = 0;
	let lastBookT = Number.NEGATIVE_INFINITY;
	let invalid = { l2Book: 0, bbo: 0 };
	let columns: Column[] = [];
	let trades: Trade[] = [];
	const seenTrades = new Set<string>();
	let quote: Quote | null = null;
	/**
	 * While true the quote comes from bbo (exact; l2Book levels are aggregated to N_SIG_FIGS). bbo frames arrive only
	 * when the best bid or offer changes, so silence keeps the quote; a newer book that contradicts it hands the quote
	 * back to the book until the next bbo frame.
	 */
	let quoteFromBbo = false;
	/** Exchange time of the frame that set the current quote state; an older frame on either channel cannot replace it. */
	let quoteT = Number.NEGATIVE_INFINITY;
	let mids: { t: number; mid: number }[] = [];
	let firstBookT = 0;
	let lastTrade: { px: string; t: number } | null = null;
	let exchangeNow = 0;
	let exchangeNowAt = 0;
	let frame = 0;
	let lastDraw = 0;
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	let yRange: { min: number; max: number } | null = null;

	function isBookFresh(now: number): boolean {
		return lastBookAt > 0 && now - lastBookAt <= BOOK_FRESH_MS;
	}

	function windowMs(now: number) {
		const full = mobileQuery.matches ? 60_000 : 120_000;
		return firstBookT === 0 ? full : Math.min(full, Math.max(MIN_WINDOW_MS, now - firstBookT));
	}

	function recordMid(t: number) {
		if (!quote) return;
		const mid = (Number(quote.bid) + Number(quote.ask)) / 2;
		if (mids.length > 0 && (mids.at(-1)?.t ?? 0) >= t) return;
		mids.push({ t, mid });
	}

	function setPhase(next: Phase) {
		const activeBefore = document.activeElement;
		const focusedControl = activeBefore === start || activeBefore === pause;
		phase = next;
		root.dataset.phase = next;
		const showCanvas = next === "live" || (next === "paused" && columns.length > 0);
		canvas.hidden = !showCanvas;
		poster.hidden = showCanvas;
		state.textContent = { recorded: "Recorded", live: "Live", paused: "Paused", unavailable: "Recorded" }[next];
		start.hidden = optedIn || next === "unavailable";
		pause.hidden = !optedIn || next === "unavailable";
		pause.textContent = paused ? "Resume" : "Pause";
		pause.setAttribute("aria-pressed", String(paused));
		if (focusedControl && ((activeBefore === start && start.hidden) || (activeBefore === pause && pause.hidden))) {
			if (!pause.hidden) {
				pause.focus();
			} else if (!start.hidden) {
				start.focus();
			} else if (!panel.hidden) {
				panel.tabIndex = 0;
				panel.focus();
			}
		}
		renderNumbers();
		renderNote();
	}

	function renderNote() {
		if (phase === "live") {
			note.textContent = `Live from Hyperliquid public data${lastTrade ? ` · last trade ${utcTime(lastTrade.t)} UTC` : ""}.`;
		} else if (phase === "paused" || paused) {
			note.textContent =
				columns.length > 0 ? "Paused. Nothing updates until you resume." : `${recordedNote} Paused. Nothing updates until you resume.`;
		} else if (phase === "unavailable") {
			note.textContent = `${recordedNote} Live data is unavailable right now.`;
		} else if (!optedIn) {
			note.textContent = `${recordedNote} The live view starts when you ask for it.`;
		} else if (connectionState === "lock_waiting") {
			note.textContent = `${recordedNote} Live view is active in another tab.`;
		} else if (connectionState === "connecting" || connectionState === "subscribed" || connectionState === "reconnecting") {
			note.textContent = `${recordedNote} Switches to live after ${LIVE_HANDOFF_MS / 1000} s of live data.`;
		} else {
			note.textContent = recordedNote;
		}
	}

	function renderNumbers() {
		const now = performance.now();
		const live = phase === "live" && quote !== null && isBookFresh(now) && now - lastValidAt < SILENT_LIMIT_MS;
		const values = { bid: "", ask: "", spread: "", last: "" };
		if (live && quote) {
			values.bid = formatMarkPrice(quote.bid, szDecimals) ?? "";
			values.ask = formatMarkPrice(quote.ask, szDecimals) ?? "";
			const spread = new Big(quote.ask).minus(quote.bid).toFixed();
			values.spread = formatMarkPrice(spread, szDecimals) ?? "";
			if (lastTrade) values.last = formatMarkPrice(lastTrade.px, szDecimals) ?? "";
		}
		for (const [key, slot] of Object.entries(slots)) {
			if (slot) slot.textContent = values[key as keyof typeof values];
		}
		const hasActiveProgress =
			connectionState === "connecting" || connectionState === "subscribed" || connectionState === "reconnecting";
		const waitingForData = !live && phase === "recorded" && wanted() && hasActiveProgress;
		stats?.setAttribute("aria-busy", waitingForData ? "true" : "false");
	}

	function resetData() {
		columns = [];
		trades = [];
		mids = [];
		firstBookT = 0;
		seenTrades.clear();
		quote = null;
		quoteFromBbo = false;
		quoteT = Number.NEGATIVE_INFINITY;
		lastTrade = null;
		liveSince = 0;
		lastValidAt = 0;
		lastBookAt = 0;
		lastBookT = Number.NEGATIVE_INFINITY;
		invalid = { l2Book: 0, bbo: 0 };
		yRange = null;
	}

	function wanted() {
		return optedIn && !paused && !pageHidden && onScreen && !panel.hidden && document.visibilityState === "visible" && phase !== "unavailable";
	}

	function rejectFrame(channel: "l2Book" | "bbo") {
		invalid[channel] += 1;
		if (invalid[channel] >= INVALID_FRAME_LIMIT) dropToRecorded(wanted());
	}

	function withdrawQuote() {
		quote = null;
		mids = [];
		liveSince = 0;
		if (phase === "live") setPhase("recorded");
	}

	function onMessage(ws: WebSocket, event: MessageEvent) {
		if (socket !== ws) return;
		let message: { channel?: string; data?: unknown };
		try {
			message = JSON.parse(String(event.data));
		} catch {
			return;
		}
		const now = performance.now();
		if (message.channel === "l2Book") {
			const book = readBook(message.data, coin);
			if (!book) return rejectFrame("l2Book");
			invalid.l2Book = 0;
			if (book.t > lastBookT) {
				if (phase === "recorded" && lastBookAt > 0 && now - lastBookAt > BOOK_FRESH_MS) liveSince = 0;
				lastBookT = book.t;
				lastBookAt = now;
				lastValidAt = now;
				exchangeNow = Math.max(exchangeNow, book.t);
				exchangeNowAt = now;
				const levels = [...book.bids.slice(0, MAX_LEVELS), ...book.asks.slice(0, MAX_LEVELS)].map((level) => ({
					px: Number(level.px),
					sz: Number(level.sz),
				}));
				columns.push({ t: book.t, levels });
				if (firstBookT === 0) firstBookT = book.t;
				const top = { bid: book.bids[0].px, ask: book.asks[0].px, t: book.t };
				const replacesQuote = quote ? !quoteFromBbo || bookContradictsQuote(top, quote) : !quoteFromBbo || book.t > quoteT;
				if (book.t >= quoteT && replacesQuote) {
					quote = top;
					quoteT = book.t;
					quoteFromBbo = false;
				}
				recordMid(book.t);
			}
		} else if (message.channel === "bbo") {
			const read = readBbo(message.data, coin);
			if (!read) return rejectFrame("bbo");
			invalid.bbo = 0;
			lastValidAt = now;
			if (read.t >= quoteT) {
				quote = read.quote;
				quoteT = read.t;
				quoteFromBbo = true;
				if (quote) recordMid(read.t);
				else withdrawQuote();
			}
			exchangeNow = Math.max(exchangeNow, read.t);
			exchangeNowAt = now;
		} else if (message.channel === "trades") {
			for (const trade of readTrades(message.data, coin)) {
				if (seenTrades.has(trade.key)) continue;
				seenTrades.add(trade.key);
				if (firstBookT === 0 || trade.t < firstBookT) continue;
				trades.push({ t: trade.t, px: Number(trade.px), notional: Number(trade.px) * Number(trade.sz), buy: trade.buy });
				if (!lastTrade || trade.t >= lastTrade.t) lastTrade = { px: trade.px, t: trade.t };
			}
		} else {
			return;
		}
		const bookFresh = isBookFresh(now);
		const quoteFresh = quote !== null && lastValidAt > 0 && now - lastValidAt < SILENT_LIMIT_MS;
		if (phase === "live" && !bookFresh) {
			dropToRecorded(wanted());
			return;
		}
		if (liveSince === 0 && bookFresh && quoteFresh) liveSince = now;
		if (phase === "recorded" && liveSince > 0 && now - liveSince >= LIVE_HANDOFF_MS && bookFresh && quoteFresh) setPhase("live");
		if (phase === "live" && reducedQuery.matches) draw();
	}

	function connect() {
		if (socket || lockAbort || !wanted()) return;
		if (!connectionAllowed(attempts, performance.now())) {
			connectionState = "idle";
			setPhase("unavailable");
			return;
		}
		lockAbort = new AbortController();
		const abort = lockAbort;
		connectionState = "lock_queued";
		lockQueuedAt = performance.now();
		renderNumbers();
		renderNote();
		const onLockFailure = () => {
			if (abort.signal.aborted) return;
			if (lockAbort === abort) lockAbort = null;
			lockQueuedAt = 0;
			connectionState = "lock_failed";
			setPhase("unavailable");
		};
		let pending: Promise<void>;
		try {
			pending = navigator.locks.request(LOCK_NAME, { signal: abort.signal }, () => {
				if (abort.signal.aborted || !wanted()) return;
				const now = performance.now();
				if (!connectionAllowed(attempts, now)) {
					lockQueuedAt = 0;
					connectionState = "idle";
					setPhase("unavailable");
					return;
				}
				attempts.push(now);
				lockQueuedAt = 0;
				return new Promise<void>((resolve) => {
					releaseLock = resolve;
					openSocket();
				});
			});
		} catch {
			onLockFailure();
			return;
		}
		pending
			.catch(() => {
				onLockFailure();
			})
			.finally(() => {
				if (lockAbort === abort) {
					lockAbort = null;
					lockQueuedAt = 0;
					if (!socket && connectionState !== "lock_failed" && connectionState !== "reconnecting") {
						connectionState = "idle";
					}
				}
				renderNumbers();
				renderNote();
			});
	}

	function sendSubscriptions(ws: WebSocket) {
		if (socket !== ws || subscribed || ws.readyState !== WebSocket.OPEN || !wanted()) return;
		subscribed = true;
		connectionState = "subscribed";
		socketOpenedAt = performance.now();
		for (const subscription of [
			{ type: "l2Book", coin, nSigFigs: N_SIG_FIGS },
			{ type: "bbo", coin },
			{ type: "trades", coin },
		]) {
			ws.send(JSON.stringify({ method: "subscribe", subscription }));
		}
		renderNumbers();
		renderNote();
	}

	function openSocket() {
		const ws = new WebSocket(WS_URL);
		socket = ws;
		subscribed = false;
		connectionState = "connecting";
		socketOpenedAt = performance.now();
		ws.addEventListener("open", () => sendSubscriptions(ws));
		ws.addEventListener("message", (event) => onMessage(ws, event));
		ws.addEventListener("close", () => {
			if (socket !== ws) return;
			dropToRecorded(wanted());
		});
		if (ws.readyState === WebSocket.OPEN) sendSubscriptions(ws);
		renderNumbers();
		renderNote();
	}

	function disconnect() {
		clearTimeout(idleTimer);
		idleTimer = undefined;
		clearTimeout(reconnectTimer);
		reconnectTimer = undefined;
		const ws = socket;
		socket = null;
		subscribed = false;
		socketOpenedAt = 0;
		lockQueuedAt = 0;
		if (connectionState !== "lock_failed") connectionState = "idle";
		if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
		lockAbort?.abort();
		lockAbort = null;
		releaseLock?.();
		releaseLock = null;
	}

	function dropToRecorded(reconnect: boolean) {
		disconnect();
		resetData();
		if (reconnect && phase !== "unavailable" && phase !== "paused") connectionState = "reconnecting";
		if (phase !== "unavailable" && phase !== "paused") setPhase("recorded");
		if (reconnect) {
			clearTimeout(reconnectTimer);
			reconnectTimer = setTimeout(() => {
				reconnectTimer = undefined;
				if (connectionState === "reconnecting") connectionState = "idle";
				update();
			}, 1_000);
		}
	}

	function update() {
		clearTimeout(idleTimer);
		idleTimer = undefined;
		if (wanted()) {
			connect();
			if (socket) sendSubscriptions(socket);
			loop();
			renderNumbers();
			renderNote();
			return;
		}
		clearTimeout(reconnectTimer);
		reconnectTimer = undefined;
		if (connectionState === "reconnecting") connectionState = "idle";
		cancelAnimationFrame(frame);
		frame = 0;
		renderNumbers();
		renderNote();
		if (!socket && !lockAbort) return;
		if (paused || !optedIn || pageHidden) {
			disconnect();
			return;
		}
		idleTimer = setTimeout(() => {
			idleTimer = undefined;
			if (!wanted()) dropToRecorded(false);
		}, IDLE_DISCONNECT_MS);
	}

	function isFeedStale(now: number): boolean {
		if (lastBookAt === 0) return socketOpenedAt > 0 && now - socketOpenedAt > SILENT_LIMIT_MS;
		if (phase === "live" && !isBookFresh(now)) return true;
		return now - lastValidAt > SILENT_LIMIT_MS || now - lastBookAt > BOOK_FRESH_MS * 2;
	}

	function tick() {
		const now = performance.now();
		if (connectionState === "lock_queued" && lockQueuedAt > 0 && now - lockQueuedAt >= LOCK_WAIT_NOTE_MS) {
			connectionState = "lock_waiting";
			renderNote();
		}
		if ((phase === "live" || (phase === "recorded" && socket && (subscribed || wanted()))) && isFeedStale(now)) {
			dropToRecorded(wanted());
		}
		renderNumbers();
		if (phase === "live") renderNote();
	}

	function loop() {
		if (frame || reducedQuery.matches) return;
		const step = (time: number) => {
			frame = 0;
			if (!wanted()) return;
			const interval = mobileQuery.matches ? 50 : 33;
			if (phase === "live" && time - lastDraw >= interval) {
				lastDraw = time;
				draw();
			}
			frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
	}

	function draw() {
		if (phase === "live" && !isBookFresh(performance.now())) {
			dropToRecorded(wanted());
			return;
		}
		const mobile = mobileQuery.matches;
		const ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (width === 0 || height === 0) return;
		if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
			canvas.width = Math.round(width * ratio);
			canvas.height = Math.round(height * ratio);
		}
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, width, height);
		const now = exchangeNow + (reducedQuery.matches ? 0 : performance.now() - exchangeNowAt);
		const span = windowMs(now);
		const from = now - span;
		mids = mids.filter((point, index) => point.t >= from || (mids[index + 1]?.t ?? Number.POSITIVE_INFINITY) >= from);
		columns = columns.filter(
			(column, index) => column.t >= from || Math.min(columns[index + 1]?.t ?? now, column.t + BOOK_FRESH_MS, now) > from,
		);
		trades = trades.filter((trade) => trade.t >= from);
		if (seenTrades.size > 5_000) seenTrades.clear();
		if (!quote || columns.length === 0) return;

		const mid = (Number(quote.bid) + Number(quote.ask)) / 2;
		let low = mid;
		let high = mid;
		for (const column of columns) for (const level of column.levels) {
			low = Math.min(low, level.px);
			high = Math.max(high, level.px);
		}
		for (const trade of trades) {
			low = Math.min(low, trade.px);
			high = Math.max(high, trade.px);
		}
		for (const point of mids) {
			low = Math.min(low, point.mid);
			high = Math.max(high, point.mid);
		}
		const pad = Math.max((high - low) * 0.08, mid * 0.00005);
		const target = { min: low - pad, max: high + pad };
		yRange = yRange
			? { min: yRange.min + (target.min - yRange.min) * 0.15, max: yRange.max + (target.max - yRange.max) * 0.15 }
			: target;
		const range = yRange;

		const fontPx = mobile ? 11 : 12;
		context.font = `${fontPx}px ${fontFamily}`;
		context.textBaseline = "middle";
		const priceTicks = axisPriceTicks(range.min, range.max, mobile ? 4 : 6);
		const midText = formatAxisPrice(new Big(quote.bid).plus(quote.ask).div(2).toString(), priceTicks.decimals, true);
		const labelWidth = Math.max(
			context.measureText(midText).width,
			...priceTicks.values.map((value) => context.measureText(formatAxisPrice(value, priceTicks.decimals)).width),
		);
		const plotWidth = Math.max(1, width - Math.ceil(labelWidth) - 18);
		const plotHeight = Math.max(1, height - fontPx - 12);
		const y = (px: number) => plotHeight - ((px - range.min) / (range.max - range.min)) * plotHeight;
		const x = (t: number) => ((t - from) / span) * plotWidth;
		const timeTicks = axisTimeTicks(span, mobile ? 4 : 6);

		context.strokeStyle = colors.grid;
		context.lineWidth = 1;
		context.beginPath();
		for (const value of priceTicks.values) {
			const gy = Math.round(y(value)) + 0.5;
			context.moveTo(0, gy);
			context.lineTo(plotWidth, gy);
		}
		for (const offset of timeTicks.offsets) {
			const gx = Math.round(x(now - offset)) + 0.5;
			context.moveTo(gx, 0);
			context.lineTo(gx, plotHeight);
		}
		context.moveTo(0, plotHeight + 0.5);
		context.lineTo(plotWidth, plotHeight + 0.5);
		context.moveTo(plotWidth + 0.5, 0);
		context.lineTo(plotWidth + 0.5, plotHeight);
		context.stroke();

		context.save();
		context.beginPath();
		context.rect(0, 0, plotWidth, plotHeight);
		context.clip();

		let largest = 0;
		for (const column of columns) for (const level of column.levels) largest = Math.max(largest, level.sz);
		const tickHeight = Math.max(2, Math.abs(y(mid) - y(mid + mid * 0.00001 * 2)));
		context.fillStyle = colors.heat;
		columns.forEach((column, index) => {
			const rightT = Math.min(columns[index + 1]?.t ?? now, column.t + BOOK_FRESH_MS, now);
			if (rightT <= from && column.t < from) return;
			const left = Math.max(0, x(column.t));
			const right = x(rightT);
			if (right < left) return;
			for (const level of column.levels) {
				context.globalAlpha = 0.04 + 0.4 * Math.sqrt(level.sz / (largest || 1));
				context.fillRect(left, y(level.px) - tickHeight / 2, Math.max(1, right - left), tickHeight);
			}
		});
		context.globalAlpha = 1;

		context.strokeStyle = colors.mid;
		context.lineWidth = 1.5;
		context.lineJoin = "round";
		context.beginPath();
		mids.forEach((point, index) => {
			const px = Math.max(0, x(point.t));
			if (index === 0) {
				context.moveTo(px, y(point.mid));
				return;
			}
			context.lineTo(px, y(mids[index - 1]?.mid ?? point.mid));
			context.lineTo(px, y(point.mid));
		});
		context.lineTo(plotWidth, y(mid));
		context.globalAlpha = 0.9;
		context.stroke();
		context.globalAlpha = 1;

		const maxRadius = mobile ? 6 : 8;
		for (const trade of trades) {
			const radius = Math.min(maxRadius, 2 + Math.sqrt(trade.notional) / 60);
			context.beginPath();
			context.arc(x(trade.t), y(trade.px), radius, 0, Math.PI * 2);
			context.globalAlpha = 0.9;
			if (trade.buy) {
				context.fillStyle = colors.buy;
				context.fill();
			} else {
				context.strokeStyle = colors.sell;
				context.lineWidth = 1.5;
				context.stroke();
			}
		}
		context.globalAlpha = 1;
		context.restore();

		const midY = Math.min(plotHeight - fontPx / 2 - 3, Math.max(fontPx / 2 + 3, y(mid)));
		context.fillStyle = colors.axis;
		context.textAlign = "left";
		for (const value of priceTicks.values) {
			const ty = y(value);
			if (ty < fontPx / 2 || ty > plotHeight - fontPx / 2 || Math.abs(ty - midY) < fontPx + 2) continue;
			context.fillText(formatAxisPrice(value, priceTicks.decimals), plotWidth + 9, ty);
		}
		context.fillStyle = colors.mid;
		context.fillRect(plotWidth + 3, midY - fontPx / 2 - 3, width - plotWidth - 3, fontPx + 6);
		context.fillStyle = colors.axisBg;
		context.fillText(midText, plotWidth + 9, midY);

		context.fillStyle = colors.axis;
		context.textBaseline = "alphabetic";
		const baseline = height - 4;
		for (const offset of timeTicks.offsets) {
			const tx = x(now - offset);
			const label = formatAgo(offset);
			if (offset === 0) {
				context.textAlign = "right";
				context.fillText(label, plotWidth, baseline);
			} else if (tx > context.measureText(label).width / 2 + 2) {
				context.textAlign = "center";
				context.fillText(label, tx, baseline);
			}
		}
		context.textAlign = "left";
	}

	pause.addEventListener("click", () => {
		paused = !paused;
		if (paused) {
			const keepFrozenCanvas = phase === "live" && columns.length > 0;
			disconnect();
			if (!keepFrozenCanvas) resetData();
			setPhase("paused");
		} else {
			resetData();
			setPhase("recorded");
		}
		update();
	});
	start.addEventListener("click", () => {
		optedIn = true;
		setPhase(phase);
		update();
		if (!pause.hidden) pause.focus();
	});
	reducedQuery.addEventListener("change", () => {
		if (reducedQuery.matches && !paused) {
			optedIn = false;
			disconnect();
			resetData();
			setPhase("recorded");
		}
		update();
	});
	document.addEventListener("visibilitychange", update);
	new IntersectionObserver((entries) => {
		onScreen = entries.some((entry) => entry.isIntersecting);
		update();
	}).observe(root);
	new MutationObserver(update).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
	window.addEventListener("pagehide", () => {
		pageHidden = true;
		disconnect();
		resetData();
		setPhase(paused ? "paused" : "recorded");
	});
	window.addEventListener("pageshow", () => {
		if (!pageHidden) return;
		pageHidden = false;
		update();
	});
	setInterval(tick, 1_000);
	setPhase("recorded");
	update();
}
