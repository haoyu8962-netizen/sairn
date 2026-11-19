import {
	type FilteredHistoryEmptyPresentation,
	getFilteredHistoryEmptyPresentation,
	type HistorySnapshotState,
	historySnapshotReachesLive,
} from "@/lib/trade/history-filter-presentation";

export type FilteredFillsEmptyPresentation = FilteredHistoryEmptyPresentation;

/** `HistorySnapshotState` of the `userFills` snapshot; `reachedLimit` is its 2,000-fill limit. */
export type FillSnapshotState = HistorySnapshotState;

/**
 * Whether a `userFills` snapshot and the live fills the subscription still holds leave no gap. Both
 * times count TWAP fills, which the lists leave out. A snapshot without fills reaches only a
 * subscription that holds none: every live fill is newer than such a snapshot, and the subscription may
 * already have dropped some.
 */
export function fillSnapshotReachesLiveFills(
	newestSnapshotFillTime: number | null,
	oldestLiveFillTime: number | null,
): boolean {
	return historySnapshotReachesLive(newestSnapshotFillTime, oldestLiveFillTime);
}

/** The phone trade history's filtered empty state (`getFilteredHistoryEmptyPresentation`). */
export function getFilteredFillsEmptyPresentation(options: {
	liveCurrent: boolean;
	snapshot: FillSnapshotState;
}): FilteredFillsEmptyPresentation {
	return getFilteredHistoryEmptyPresentation(options);
}
