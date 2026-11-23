import type { Hash } from "viem";

/**
 * Provider error codes (EIP-1193 and JSON-RPC 2.0) that a wallet returns before it broadcasts
 * anything: the request was rejected, unauthorized, unsupported or malformed. Disconnection
 * (4900, 4901) is not listed, because EIP-1193 only says the provider cannot answer, not that
 * the transaction it was asked to send never left; generic server errors (-32000, -32603) are
 * not listed either, because nodes use them for "already known" and timeouts too.
 */
const DEFINITIVE_WALLET_SUBMISSION_ERROR_CODES = new Set([4001, 4100, 4200, -32003, -32600, -32601, -32602]);
const MAX_CAUSE_DEPTH = 6;

export function getWalletErrorCode(error: unknown): number | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH && current && typeof current === "object"; depth += 1) {
		const code = (current as { code?: unknown }).code;
		if (typeof code === "number" && Number.isInteger(code)) return code;
		current = (current as { cause?: unknown }).cause;
	}
	return undefined;
}

/**
 * A provider code decides on its own: a rejection-like message never overrides a code such as
 * 4900, whose transaction may already have been broadcast. The message is used only when the
 * error carries no code at all.
 */
export function isDefinitiveWalletSubmissionFailure(error: unknown, userRejected: boolean): boolean {
	const code = getWalletErrorCode(error);
	if (code === undefined) return userRejected;
	return DEFINITIVE_WALLET_SUBMISSION_ERROR_CODES.has(code);
}

interface DepositSubmissionOutcomeInput {
	/**
	 * The sponsored flow called Privy's Smart Wallet `sendTransaction` with its authorization: Privy prepares, signs
	 * and sends the UserOperation to the bundler inside the SDK, so no failure there proves nothing was broadcast.
	 */
	sponsoredSubmissionStarted: boolean;
	/**
	 * The external wallet was asked to broadcast the deposit transaction and the attempt's forwarding ledger cannot
	 * rule out that it did: some send it was handed was answered, or failed with anything other than a refusal
	 * that means nothing was broadcast (ADR 0058). The final error does not decide this, because viem
	 * may fall back to a second send after an unclear first answer.
	 */
	directSubmissionUncertain: boolean;
	hash: Hash | undefined;
}

/**
 * Whether a failed deposit attempt may still have reached the chain. A hash answers the question on its own;
 * without one, a sponsored submission counts as unknown, and an external-wallet one as the ledger says.
 */
export function isDepositSubmissionOutcomeUnknown({
	sponsoredSubmissionStarted,
	directSubmissionUncertain,
	hash,
}: DepositSubmissionOutcomeInput): boolean {
	if (hash) return false;
	return sponsoredSubmissionStarted || directSubmissionUncertain;
}
