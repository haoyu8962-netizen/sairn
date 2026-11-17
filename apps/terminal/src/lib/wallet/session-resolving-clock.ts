/**
 * One clock for "the wallet session is still resolving", shared by every `useWalletSession()` caller so
 * that all surfaces stop waiting at the same moment.
 *
 * A wait opens when the session becomes unsettled (Privy or its wallet directory initialising, wagmi
 * connecting or reconnecting, the expected wallet not activated yet) and expires
 * `WALLET_SESSION_RESOLVING_MAX_MS` later: after that the session is presented as what it currently is,
 * so a wallet that never connects is reported instead of waited on. The wait closes only once the session
 * has stayed settled for `SETTLED_AFTER_MS`; `@privy-io/wagmi` marks a wallet connected for an instant
 * before every reconnect, and that instant must not start a new wait for a wallet that keeps failing.
 */
export const WALLET_SESSION_RESOLVING_MAX_MS = 10_000;
const SETTLED_AFTER_MS = 2_000;

let waiting = false;
let expired = false;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function setExpired(next: boolean): void {
	if (expired === next) return;
	expired = next;
	for (const listener of listeners) listener();
}

function closeWait(): void {
	clearTimeout(expiryTimer);
	clearTimeout(settleTimer);
	expiryTimer = undefined;
	settleTimer = undefined;
	waiting = false;
	setExpired(false);
}

export function reportWalletSessionUnsettled(unsettled: boolean): void {
	if (!unsettled) {
		if (waiting && settleTimer === undefined) settleTimer = setTimeout(closeWait, SETTLED_AFTER_MS);
		return;
	}
	clearTimeout(settleTimer);
	settleTimer = undefined;
	if (waiting) return;
	waiting = true;
	expiryTimer = setTimeout(() => setExpired(true), WALLET_SESSION_RESOLVING_MAX_MS);
}

export function subscribeWalletSessionResolvingExpiry(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function hasWalletSessionResolvingExpired(): boolean {
	return expired;
}

/** @internal — tests start each case without a wait left open by the previous one. */
export function resetWalletSessionResolvingClock(): void {
	closeWait();
}
