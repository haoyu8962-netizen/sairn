import type { MessageDescriptor } from "@lingui/core";
import type { AmountLimitActionFailure, AmountLimitCode } from "./action-error";

/**
 * An error our own code throws for a user-requested action, carrying the message to show.
 *
 * Build the descriptor with `msg` so the text is translated when it is displayed, not when it is
 * thrown. `message` keeps the source-language text for logs and error reports.
 */
export class LocalizedActionError extends Error {
	readonly descriptor: MessageDescriptor;

	constructor(descriptor: MessageDescriptor, options?: { cause?: unknown }) {
		super(descriptor.message ?? descriptor.id, options);
		this.name = "LocalizedActionError";
		this.descriptor = descriptor;
	}
}

/**
 * An error our own code throws when an amount is above a fixed limit. It keeps the limit as a plain
 * decimal string, so the message formats it with the number-format setting when it is displayed
 * instead of when it is thrown. `message` names the limit in English for logs and error reports.
 */
export class AmountLimitActionError extends Error {
	readonly failure: AmountLimitActionFailure;

	constructor(code: AmountLimitCode, amount: string, options?: { cause?: unknown }) {
		super(`Amount limit ${code}: ${amount}`, options);
		this.name = "AmountLimitActionError";
		this.failure = { kind: "action-error", code, amount };
	}
}

export function isLocalizedActionError(error: unknown): error is LocalizedActionError {
	return error instanceof LocalizedActionError;
}
