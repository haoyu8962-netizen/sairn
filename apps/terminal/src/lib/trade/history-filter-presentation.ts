export type FilteredHistoryEmptyPresentation = "loading" | "offline" | "retry" | "noMatch" | "noMatchWithinLimit";

export interface HistorySnapshotState {
	/** An Info snapshot has loaded for the current owner and network. */
	hasData: boolean;
	/** The latest snapshot request failed, whether or not an earlier snapshot is kept. */
	failed: boolean;
	/** A snapshot request is on its way. */
	fetching: boolean;
	offline: boolean;
	/** The snapshot returned the endpoint's item limit, so older records were not searched. */
	reachedLimit: boolean;
	/** No record can fall between the snapshot and the live records held (`historySnapshotReachesLive`). */
	reachesLive: boolean;
}

/**
 * Whether an Info snapshot and the live records a subscription still holds leave no gap. A
 * subscription keeps a bounded number of records, so after enough new ones its oldest record can be
 * newer than anything the snapshot covered, and records in between are in neither. `snapshotCoversUntil`
 * is the newest time the snapshot is known to cover (its newest record, or the end of a time window it
 * read completely); a snapshot that covers nothing reaches only a subscription that holds nothing.
 */
export function historySnapshotReachesLive(
	snapshotCoversUntil: number | null,
	oldestLiveRecordTime: number | null,
): boolean {
	if (oldestLiveRecordTime === null) return true;
	return snapshotCoversUntil !== null && oldestLiveRecordTime <= snapshotCoversUntil;
}

/**
 * What a phone or desktop history list shows when no record matches the active filters while an Info
 * snapshot backs them (docs/mobile-data-presentation.md). A no-match conclusion needs a snapshot whose
 * latest request succeeded, is not being replaced and reaches the live records, and live records that
 * are current; otherwise the list stays quiet, and a failed request or a gap between the snapshot and
 * the live records offers a neutral retry.
 */
export function getFilteredHistoryEmptyPresentation({
	liveCurrent,
	snapshot,
}: {
	liveCurrent: boolean;
	snapshot: HistorySnapshotState;
}): FilteredHistoryEmptyPresentation {
	if (snapshot.offline) return "offline";
	if (snapshot.fetching) return "loading";
	if (snapshot.failed) return "retry";
	if (!snapshot.hasData || !liveCurrent) return "loading";
	if (!snapshot.reachesLive) return "retry";
	return snapshot.reachedLimit ? "noMatchWithinLimit" : "noMatch";
}
