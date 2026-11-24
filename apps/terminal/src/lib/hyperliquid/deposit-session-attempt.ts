import type {
	DepositSessionCheck,
	DepositSessionSettlement,
	DepositSessionWaitResult,
} from "@/lib/hyperliquid/use-deposit";

/** What one commit of the deposit dialog saw of the session a manual deposit belongs to (ADR 0058). */
export interface DepositSessionSnapshot {
	/** The global modal opening shown (`getGlobalModalOpening()`), `null` when no modal is open. */
	opening: string | null;
	/** `useWalletSession().isResolving`. */
	resolving: boolean;
	/** The client key hl-react signs for (`"disconnected"` without a wallet). */
	clientKey: string;
	/** The wallet a deposit in the dialog's current mode signs with. */
	wallet: string | undefined;
}

export interface DepositSessionAttempt {
	/** The session check handed to `useDeposit().deposit()` for this click. */
	readonly check: DepositSessionCheck;
	/** Every commit of the dialog reports what it saw. */
	observe(snapshot: DepositSessionSnapshot): void;
	/** The dialog unmounted (or a newer click replaced this attempt): one-way. */
	invalidate(): void;
}

interface CreateDepositSessionAttemptOptions {
	/** What the dialog saw at the click. */
	clicked: DepositSessionSnapshot;
	/** Reads the opening shown now, synchronously, so a close and reopen merged into one commit still counts. */
	readOpening: () => string | null;
	/** The live session token is still the one captured at the click (no reconnect since). */
	isLiveSessionCurrent: () => boolean;
}

function normalize(value: string | undefined): string | undefined {
	return value?.toLowerCase();
}

/**
 * The wait's limit runs on both clocks, like the signing deadline of ADR 0053: the monotonic age survives a clock set
 * back, the wall-clock age a device sleep that `performance.now()` does not count, and whichever reaches the limit
 * first ends the wait.
 *
 * One click of a manual deposit. It is voided, for good, when the dialog shows another opening (closed, opened
 * again, another modal), unmounts, or the session settles on another wallet or client key; A → B → A stays void.
 * It counts every commit that saw the session anywhere other than settled on the click's identity, so the
 * deposit can tell that a session came back after its wait only by a fresh interruption.
 */
export function createDepositSessionAttempt({
	clicked,
	readOpening,
	isLiveSessionCurrent,
}: CreateDepositSessionAttemptOptions): DepositSessionAttempt {
	const opening = clicked.opening;
	const clientKey = clicked.clientKey.toLowerCase();
	const wallet = normalize(clicked.wallet);
	const listeners = new Set<() => void>();
	let latest = clicked;
	let voided = opening === null;
	let interruptions = 0;

	function isElsewhere(snapshot: DepositSessionSnapshot): boolean {
		if (snapshot.opening !== opening) return true;
		if (snapshot.resolving) return false;
		const snapshotWallet = normalize(snapshot.wallet);
		if (snapshotWallet && snapshotWallet !== wallet) return true;
		const snapshotClientKey = snapshot.clientKey.toLowerCase();
		return snapshotClientKey !== "disconnected" && snapshotClientKey !== clientKey;
	}

	function isOnClick(snapshot: DepositSessionSnapshot): boolean {
		return (
			snapshot.opening === opening &&
			!snapshot.resolving &&
			normalize(snapshot.wallet) === wallet &&
			snapshot.clientKey.toLowerCase() === clientKey
		);
	}

	function readNow(): DepositSessionSnapshot {
		const shown = readOpening();
		return shown === latest.opening ? latest : { ...latest, opening: shown };
	}

	function isVoid(): boolean {
		if (!voided && isElsewhere(readNow())) voided = true;
		return voided;
	}

	function settlement(): DepositSessionSettlement | null {
		if (isVoid()) return "replaced";
		return isOnClick(readNow()) ? "same" : null;
	}

	function decide(): DepositSessionWaitResult | null {
		const decided = settlement();
		return decided ? { settlement: decided, interruptions } : null;
	}

	function notify() {
		for (const listener of [...listeners]) listener();
	}

	const check: DepositSessionCheck = {
		isCurrent: () => !isVoid() && isLiveSessionCurrent(),
		isSettledOnSubmitted: () => !isVoid() && isOnClick(readNow()),
		isVoided: isVoid,
		readInterruptions: () => interruptions,
		waitUntilSettled(timeoutMs) {
			const now = decide();
			if (now) return Promise.resolve(now);
			const startedAt = Date.now();
			const monotonicStartedAt = performance.now();
			function hasTimedOut(): boolean {
				return Math.max(Date.now() - startedAt, performance.now() - monotonicStartedAt) >= timeoutMs;
			}
			function decideInTime(): DepositSessionWaitResult | null {
				const next = decide();
				if (next?.settlement === "replaced") return next;
				if (hasTimedOut()) return { settlement: "timeout", interruptions };
				return next;
			}
			return new Promise((resolve) => {
				function finish(result: DepositSessionWaitResult) {
					clearTimeout(timer);
					listeners.delete(listener);
					resolve(result);
				}
				function listener() {
					const next = decideInTime();
					if (next) finish(next);
				}
				const timer = setTimeout(() => finish(decideInTime() ?? { settlement: "timeout", interruptions }), timeoutMs);
				listeners.add(listener);
			});
		},
	};

	return {
		check,
		observe(snapshot) {
			latest = snapshot;
			if (!voided && isElsewhere(snapshot)) voided = true;
			if (voided || !isOnClick(snapshot)) interruptions += 1;
			notify();
		},
		invalidate() {
			voided = true;
			interruptions += 1;
			notify();
		},
	};
}
