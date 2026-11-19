import { toBig } from "@/lib/trade/numbers";
import { normalizePreTransferCheck, type PreTransferCheck, PreTransferCheckExecutionError } from "./pre-transfer-check";

/**
 * What a Send does after `preTransferCheck`, as on the official terminal: a sanctioned destination
 * is refused; an activation fee, or a destination that has never sent a transaction on
 * Hyperliquid, needs an explicit confirmation; anything else sends at once. A response that does
 * not have the documented shape sends nothing.
 */
export type SendDestinationVerdict =
	| { kind: "send" }
	| { kind: "review"; fee: string; feeDue: boolean; destinationHasSentTx: boolean }
	| { kind: "sanctioned" }
	| { kind: "unavailable" };

/** What the user saw about the destination when they confirmed the Send. */
export interface SendDestinationReview {
	fee: string;
	destinationHasSentTx: boolean;
}

/** A Send that needed no review was shown no fee and no loss warning. */
export const UNREVIEWED_SEND_DESTINATION: SendDestinationReview = { fee: "0", destinationHasSentTx: true };

function readPreTransferCheck(check: unknown): PreTransferCheck | null {
	try {
		return normalizePreTransferCheck(check);
	} catch {
		return null;
	}
}

export function getSendDestinationVerdict(check: unknown): SendDestinationVerdict {
	const current = readPreTransferCheck(check);
	if (!current) return { kind: "unavailable" };
	if (current.isSanctioned) return { kind: "sanctioned" };
	const feeDue = toBig(current.fee)?.gt(0) ?? false;
	if (!feeDue && current.userHasSentTx) return { kind: "send" };
	return { kind: "review", fee: current.fee, feeDue, destinationHasSentTx: current.userHasSentTx };
}

/**
 * The destination check is asked again inside the funds lock, right before signing, because the
 * answer can change while the review stays open or while another tab holds the lock. The Send goes
 * ahead only when the fresh answer asks for nothing the user has not seen: the same activation fee,
 * and a loss warning only if the user was shown one.
 */
export function assertSendDestinationUnchanged(reviewed: SendDestinationReview, check: unknown): void {
	const current = readPreTransferCheck(check);
	if (!current) throw new PreTransferCheckExecutionError("unavailable");
	if (current.isSanctioned) throw new PreTransferCheckExecutionError("sanctioned");
	const currentFee = toBig(current.fee);
	const reviewedFee = toBig(reviewed.fee);
	if (!currentFee || !reviewedFee) throw new PreTransferCheckExecutionError("unavailable");
	if (!currentFee.eq(reviewedFee)) throw new PreTransferCheckExecutionError("changed");
	if (!current.userHasSentTx && reviewed.destinationHasSentTx) {
		throw new PreTransferCheckExecutionError("unavailable");
	}
}
