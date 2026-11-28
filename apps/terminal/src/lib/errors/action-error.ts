import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { REFERRAL_APPLY_VOLUME_LIMIT } from "@/config/referral";
import type { NumberFormatters } from "@/lib/format";
import {
	type DefinitiveDepositSourceFailureCode,
	DefinitiveDepositSourceFailureError,
} from "@/lib/hyperliquid/deposit-source-error";
import type { Translate } from "@/lib/translate";
import {
	describeExchangeErrorText,
	type ExchangeErrorEntry,
	formatExchangeErrorEntries,
	type InsufficientMarginHint,
	parseExchangeErrorText,
} from "./exchange-error-text";
import { AmountLimitActionError, LocalizedActionError } from "./localized-action-error";

/** Stable, language-independent reasons for failures that are not exchange rejection texts. */
export type ActionErrorCode =
	| "access-blocked"
	| "access-unavailable"
	| "coordination-unavailable"
	| "device-clock"
	| "funds-coordination-unavailable"
	| "funds-operation-busy"
	| "identity-changed"
	| "rate-limited"
	| "request-invalid"
	| "request-rejected"
	| "request-unconfirmed"
	| "signing-failed"
	| "terms-required"
	| "trading-authorization"
	| "unknown"
	| "wallet-approval-timeout"
	| "wallet-mismatch"
	| "wallet-rejected"
	| "wallet-unavailable";

export interface ExchangeActionFailure {
	kind: "exchange-error";
	entries: ExchangeErrorEntry[];
	hint?: InsufficientMarginHint;
}

export interface CodedActionFailure {
	kind: "action-error";
	code: ActionErrorCode;
}

/** Fixed limits our own checks enforce on an amount. */
export type AmountLimitCode =
	| "cctp-mainnet-deposit-limit"
	| "cctp-testnet-deposit-limit"
	| "referral-apply-volume-limit";

/** A limit failure keeps the limit itself, so it is formatted with the number-format setting when displayed. */
export interface AmountLimitActionFailure {
	kind: "action-error";
	code: AmountLimitCode;
	/** The limit as a plain decimal string, such as "10000000". */
	amount: string;
}

/**
 * What to show for a failed user action, stored instead of an `Error.message` string so the text
 * is produced in the active language when it is displayed. A bare descriptor is our own message.
 */
export type ActionFailure = ExchangeActionFailure | CodedActionFailure | AmountLimitActionFailure | MessageDescriptor;

/** The number formatters a failure needs to show its amount: `useNumberFormat()` during render (ADR 0036). */
export type ActionFailureNumberFormat = Pick<NumberFormatters, "formatDecimalString" | "isolateNumber">;

const ACTION_ERROR_MESSAGES: Record<Exclude<ActionErrorCode, "unknown">, MessageDescriptor> = {
	"access-blocked": msg`This account is not currently permitted to perform trading actions on Hyperliquid.`,
	"access-unavailable": msg`Unable to verify regional availability. Trading is temporarily unavailable.`,
	"coordination-unavailable": msg`This browser could not coordinate the request safely across tabs. Close other tabs and try again.`,
	"device-clock": msg`Your device clock is out of sync. Correct the date and time, then try again.`,
	"funds-coordination-unavailable": msg`This browser cannot safely coordinate funds operations across tabs. Use a supported browser.`,
	"funds-operation-busy": msg`Another funds operation is still in progress for this account. Try again after it finishes.`,
	"identity-changed": msg`The active wallet or network changed. Review the account and try again.`,
	"rate-limited": msg`Too many requests. Wait a moment and try again.`,
	"request-invalid": msg`The request could not be prepared. Refresh the page and try again.`,
	"request-rejected": msg`The server rejected the request. Try again later.`,
	"request-unconfirmed": msg`The request status could not be confirmed. Review your account before retrying.`,
	"signing-failed": msg`The wallet could not sign the request. Try again.`,
	"terms-required": msg`Accept the Hyperliquid terms before continuing.`,
	"trading-authorization": msg`Trading could not be enabled. Try again.`,
	"wallet-approval-timeout": msg`Wallet approval timed out. Check your wallet and try again.`,
	"wallet-mismatch": msg`Selected wallet does not match the connected account. Reconnect your wallet and try again.`,
	"wallet-rejected": msg`Transaction was rejected`,
	"wallet-unavailable": msg`Wallet connection failed. Unlock your wallet, approve the connection, then retry.`,
};

const AMOUNT_LIMIT_MESSAGES: Record<AmountLimitCode, (limit: string) => MessageDescriptor> = {
	"cctp-mainnet-deposit-limit": (limit) => msg`Circle CCTP deposits are limited to ${limit} USDC per transfer.`,
	"cctp-testnet-deposit-limit": (limit) => msg`Circle testnet deposits are limited to ${limit} USDC per transfer.`,
	"referral-apply-volume-limit": (limit) =>
		msg`Referral codes cannot be applied after cumulative volume exceeds $${limit}.`,
};

const GENERIC_FAILURE = msg`The request could not be completed. Try again.`;

const DEPOSIT_SOURCE_FAILURE_MESSAGES: Record<DefinitiveDepositSourceFailureCode, MessageDescriptor> = {
	"source-receipt-mismatch": msg`The Arbitrum transaction did not match the reviewed deposit. Check your wallet activity before retrying.`,
	"source-transaction-reverted": msg`Transaction reverted on Arbitrum`,
};

const SMART_WALLET_NONCE_CONFLICT_PATTERN = /\bAA25\b(?: invalid account nonce)?/i;

interface MessageRule {
	pattern: RegExp;
	failure: ActionFailure;
}

function coded(code: ActionErrorCode): CodedActionFailure {
	return { kind: "action-error", code };
}

/**
 * Plain `Error` messages from wallets, providers, hl-react and older app code that have a known
 * meaning. Keep the English texts identical to the product copy they replace so the existing
 * translations stay in use.
 */
const MESSAGE_RULES: readonly MessageRule[] = [
	{ pattern: /hyperliquid access could not be verified before this action/i, failure: coded("access-unavailable") },
	{ pattern: /this account is not permitted to perform this hyperliquid action/i, failure: coded("access-blocked") },
	{ pattern: /hyperliquid terms must be accepted before this action/i, failure: coded("terms-required") },
	{
		pattern: /referral request was submitted but its final status could not be confirmed/i,
		failure: msg`The request was submitted, but its final status is still updating. Check referral data and claim history before retrying.`,
	},
	{
		pattern: /wallet or network changed before the referral request could be confirmed/i,
		failure: msg`Wallet or network changed before the referral request could be confirmed. Reopen the action and review the current account.`,
	},
	{
		pattern: /referral codes must be between 1 and 20 characters/i,
		failure: msg`Referral codes must be between 1 and 20 characters.`,
	},
	{
		pattern: /this account already has a referral code/i,
		failure: msg`This account already has a referral code and cannot apply another one.`,
	},
	{
		pattern: /referral codes cannot be applied after cumulative volume exceeds \$10,000/i,
		failure: { kind: "action-error", code: "referral-apply-volume-limit", amount: REFERRAL_APPLY_VOLUME_LIMIT },
	},
	{
		pattern: /not currently eligible to create a referral code/i,
		failure: msg`Hyperliquid does not currently show this account as eligible to create a referral code.`,
	},
	{
		pattern: /there are no (?:eligible|unclaimed) rewards available to claim/i,
		failure: msg`There are no unclaimed rewards available to claim.`,
	},
	{
		pattern: /referral access could not be verified for this account/i,
		failure: msg`Referral access could not be verified for this account. Refresh access status before retrying.`,
	},
	{ pattern: /connect the selected owner wallet before continuing/i, failure: coded("wallet-unavailable") },
	{
		pattern: /the active (?:embedded |external )?wallet does not match (?:this|the selected) hyperliquid account/i,
		failure: coded("wallet-mismatch"),
	},
	{ pattern: /selected wallet does not match/i, failure: coded("wallet-mismatch") },
	{ pattern: /another funds operation is still in progress/i, failure: coded("funds-operation-busy") },
	{
		pattern: /secure cross-tab funds coordination requires web locks support/i,
		failure: coded("funds-coordination-unavailable"),
	},
	{ pattern: /wallet approval timed out/i, failure: coded("wallet-approval-timeout") },
	{
		pattern:
			/trading authorization could not be confirmed|builder fee approval could not be confirmed|builder fee configuration is unavailable|could not load builder fee status|agent (?:registration|verification) is disabled for owner-wallet trading/i,
		failure: coded("trading-authorization"),
	},
	{
		pattern: /trading connection is already being established in another tab/i,
		failure: msg`A trading connection is already being established in another tab. Finish or cancel it there before trying again.`,
	},
	{
		pattern: /secure agent registration requires web locks support/i,
		failure: msg`This browser cannot safely coordinate the trading connection across tabs. Use a supported browser.`,
	},
	{
		pattern: /stored agent key is invalid/i,
		failure: msg`The trading key stored in this browser is invalid. Reset the trading connection before trying again.`,
	},
	{
		pattern:
			/agent key storage could not be verified|agent private key could not be stored securely|agent storage unavailable|secure agent registration session is unavailable|agent registration cleanup could not be verified|agent approval submission (?:state|coordination)/i,
		failure: msg`This browser could not store the trading key safely. Check that site storage is available, then try again.`,
	},
	{
		pattern: /agent approval could not be confirmed|agent registration session changed/i,
		failure: msg`The connection could not be completed. It may already be approved; wait a moment and try again.`,
	},
	{
		pattern:
			/exchange request was cancelled because the active signing identity changed|wallet changed during builder fee approval|wallet or network changed/i,
		failure: coded("identity-changed"),
	},
	{
		pattern:
			/local clock cannot produce a safe hyperliquid nonce|persisted hyperliquid nonce is outside the allowed future window/i,
		failure: coded("device-clock"),
	},
	{ pattern: /hyperliquid nonce/i, failure: coded("coordination-unavailable") },
	{ pattern: /user rejected|user denied/i, failure: coded("wallet-rejected") },
	{ pattern: /wallet connection request was rejected/i, failure: msg`Wallet connection request was rejected.` },
	{
		pattern:
			/wallet connection failed|failed to connect|restore.*session|unlock your wallet|wallet client not ready|wallet provider unavailable|^no wallet connected$|wallet is required for exchange actions/i,
		failure: coded("wallet-unavailable"),
	},
	{ pattern: /arbitrum network switch was rejected/i, failure: msg`Arbitrum network switch was rejected.` },
	{
		pattern: /unable to switch wallet to arbitrum|wallet is not connected to arbitrum/i,
		failure: msg`Unable to switch wallet to Arbitrum. Switch networks in your wallet and retry.`,
	},
	{ pattern: /insufficient funds/i, failure: msg`Insufficient funds for gas` },
	{
		pattern: /wallet did not return a transaction hash/i,
		failure: msg`Wallet did not return a transaction hash. Check your wallet activity before retrying to avoid sending the deposit twice.`,
	},
	{
		pattern: /wallet returned a transaction hash.*not visible on arbitrum/i,
		failure: msg`Wallet returned a transaction hash, but it is not visible on Arbitrum yet. Check your wallet activity or Arbiscan before retrying to avoid sending the deposit twice.`,
	},
	{ pattern: /not broadcast/i, failure: msg`Transaction was not broadcast. Please retry.` },
	{
		pattern: /deposit transaction was broadcast but confirmation timed out/i,
		failure: msg`Deposit transaction was broadcast but confirmation timed out. Check Arbiscan before retrying.`,
	},
	{
		pattern: /wallet nonce may be out of sync/i,
		failure: msg`Deposit transaction was submitted but did not confirm on Arbitrum. Your wallet nonce may be out of sync with the network. Clear pending activity or reset nonce data in your wallet, then retry.`,
	},
	{
		pattern: SMART_WALLET_NONCE_CONFLICT_PATTERN,
		failure: msg`Smart wallet deposit state is syncing. Do not submit another deposit while the balance is being checked.`,
	},
];

const LEGAL_REASON_CODES: Record<string, ActionErrorCode> = {
	blocked: "access-blocked",
	status_unavailable: "access-unavailable",
	terms_required: "terms-required",
};

const NOT_SENT_IN_TIME = msg`The checks before this request took too long. Nothing was signed or sent. Try again.`;

const NAMED_ERROR_FAILURES: Record<string, ActionFailure> = {
	AgentRegistrationPreExecutionGuardTimeoutError: NOT_SENT_IN_TIME,
	AgentRegistrationResetRequiredError: msg`This browser no longer has the exact trading key for the pending approval. Reset the trading connection before trying again.`,
	CctpDepositTrackingPersistenceError: msg`This browser could not store deposit recovery data, so this deposit was not submitted. Allow site storage, then try again.`,
	ExchangeActionDeadlineError: NOT_SENT_IN_TIME,
	ExchangeRequestInvalidatedError: coded("identity-changed"),
	FundsActionLockTimeoutError: coded("funds-operation-busy"),
	FundsActionLockUnavailableError: coded("funds-coordination-unavailable"),
	MissingWalletError: coded("wallet-unavailable"),
	TradingAuthorizationIncompleteError: msg`Failed to enable trading`,
	ValidationError: coded("request-invalid"),
	WalletAccountMismatchError: coded("wallet-mismatch"),
};

/** Creates the error our code throws when a user action fails for one of the shared reasons. */
export function createActionError(
	code: Exclude<ActionErrorCode, "unknown">,
	options?: { cause?: unknown },
): LocalizedActionError {
	return new LocalizedActionError(ACTION_ERROR_MESSAGES[code], options);
}

/**
 * A failure made of exchange rejection texts: one text exactly as the exchange sent it, or the
 * entries of a batch with the position of each rejected item.
 */
export function exchangeActionFailure(
	rejections: string | readonly ExchangeErrorEntry[],
	hint?: InsufficientMarginHint,
): ExchangeActionFailure {
	const entries = typeof rejections === "string" ? [{ text: rejections }] : [...rejections];
	return { kind: "exchange-error", entries, ...(hint ? { hint } : {}) };
}

export function isSmartWalletNonceConflict(error: Error | null): boolean {
	return !!error && SMART_WALLET_NONCE_CONFLICT_PATTERN.test(error.message);
}

function hasErrorName(error: unknown, name: string): boolean {
	if (!isRecord(error)) return false;
	if (error.name === name) return true;
	return error.name === "AbstractWalletError" && isRecord(error.cause) && error.cause.name === name;
}

/**
 * The request was dropped before it reached the exchange, so nothing was executed. Its sources: the request
 * scheduler, when the request's identity generation was invalidated before it started
 * (`packages/hl-react/src/internal/exchange/request-scheduler.ts`); `useExchange`, when no registration lease
 * can be captured for the current session; and the email owner signer's `verifyOwner`, before the wallet is
 * asked to sign, after it signed and before the transport sends the HTTP request
 * (`packages/hl-react/src/signing/owner-signer-client.ts`). External wallets have no signer-side check: for them
 * only the scheduler and the registration lease raise it. The SDK wraps an error thrown by the signer in an
 * `AbstractWalletError` and keeps it as `cause`, so that one wrapper is read.
 */
export function isExchangeRequestInvalidatedError(error: unknown): boolean {
	return hasErrorName(error, "ExchangeRequestInvalidatedError");
}

/**
 * Dropped before it reached the exchange: by an identity change (`isExchangeRequestInvalidatedError`) or because
 * it did not start before its deadline (`ExchangeActionDeadlineError`, ADR 0053), directly or as the `cause` of an
 * `AbstractWalletError`.
 */
export function isExchangeRequestNotSentError(error: unknown): boolean {
	return isExchangeRequestInvalidatedError(error) || hasErrorName(error, "ExchangeActionDeadlineError");
}

/**
 * Errors that `useExchange` and the guards it runs raise before the SDK call, so nothing was signed or sent:
 * the scheduler's identity drop and start deadline (`request-scheduler.ts`), the cross-tab funds lock that could
 * not be used or was not acquired in time (`funds-action-lock.ts`), the pre-execution guard that did not finish in
 * time (`agent-registration-session.ts`), the legal recheck that refused or could not verify the owner
 * (`legal-execution.ts`), and the application guards' own `FundsActionFeedbackCause`.
 */
const STOPPED_BEFORE_SENDING_ERROR_NAMES = [
	"AgentRegistrationPreExecutionGuardTimeoutError",
	"ExchangeActionDeadlineError",
	"ExchangeRequestInvalidatedError",
	"FundsActionFeedbackCause",
	"FundsActionLockTimeoutError",
	"FundsActionLockUnavailableError",
	"LegalActionNotAllowedError",
] as const;

/**
 * Stopped before the SDK call by one of the errors in `STOPPED_BEFORE_SENDING_ERROR_NAMES`, matched by name,
 * directly or as the `cause` of an `AbstractWalletError`. Anything else, including an ambiguous transport
 * failure or an exchange rejection, may have been sent.
 */
export function isExchangeRequestStoppedBeforeSending(error: unknown): boolean {
	return STOPPED_BEFORE_SENDING_ERROR_NAMES.some((name) => hasErrorName(error, name));
}

/** True when a signed exchange request may or may not have been executed. */
export function isAmbiguousExchangeActionError(error: unknown): boolean {
	if (isRecord(error) && error.name === "ExchangeResponseUnverifiedError") return true;
	if (!isRecord(error) || error.name !== "HttpRequestError") return false;
	const status = getHttpStatus(error.response);
	if (status === undefined) return true;
	return status < 400 || status === 408 || status >= 500;
}

/** Classifies a thrown value without translating it. */
export function classifyActionError(error: unknown): ActionFailure {
	const own = findOwnActionError(error);
	if (own instanceof AmountLimitActionError) return own.failure;
	if (own) return own.descriptor;
	if (error instanceof DefinitiveDepositSourceFailureError) return DEPOSIT_SOURCE_FAILURE_MESSAGES[error.code];
	if (!isRecord(error)) return coded("unknown");
	if (error.name === "ApiRequestError") return getApiRequestFailure(error);
	if (error.name === "HttpRequestError") return getHttpFailure(error);
	if (error.name === "OrderBatchResolutionError") return getOrderBatchFailure(error.resolution);
	if (isWalletRejection(error)) return coded("wallet-rejected");
	if (error.name === "AbstractWalletError") return getWalletSigningFailure(error.cause);
	if (error.name === "LegalActionNotAllowedError" && typeof error.reason === "string") {
		return coded(LEGAL_REASON_CODES[error.reason] ?? "access-unavailable");
	}
	if (error.name === "AgentStatusError") {
		return coded(error.reason === "rate_limited" ? "rate-limited" : "trading-authorization");
	}
	if (typeof error.name === "string" && Object.hasOwn(NAMED_ERROR_FAILURES, error.name)) {
		return NAMED_ERROR_FAILURES[error.name];
	}
	const message = typeof error.message === "string" ? error.message : "";
	if (!message) return coded("unknown");
	if (describeExchangeErrorText(message)) return { kind: "exchange-error", entries: [{ text: message }] };
	for (const rule of MESSAGE_RULES) {
		if (rule.pattern.test(message)) return rule.failure;
	}
	return coded("unknown");
}

/**
 * Classifies a thrown value for storage in a notification or state, replacing an unrecognised
 * failure with the caller's own message so nothing untranslated is kept.
 */
export function classifyActionErrorOr(error: unknown, fallback: MessageDescriptor): ActionFailure {
	const failure = classifyActionError(error);
	return isUnknownFailure(failure) ? fallback : failure;
}

/**
 * Renders a classified failure in the active language and number format, or null when there is
 * nothing specific to say.
 */
export function formatActionFailure(
	failure: ActionFailure,
	translate: Translate,
	numberFormat: ActionFailureNumberFormat,
): string | null {
	if (!("kind" in failure)) return translate(failure);
	if (failure.kind === "exchange-error") {
		return failure.entries.length > 0 ? formatExchangeErrorEntries(failure.entries, translate, failure.hint) : null;
	}
	if ("amount" in failure) return describeAmountLimit(failure.code, failure.amount, translate, numberFormat);
	if (failure.code === "unknown") return null;
	return translate(ACTION_ERROR_MESSAGES[failure.code]);
}

/** The message of a limit, with the limit in the active number format; also shown before the action. */
export function describeAmountLimit(
	code: AmountLimitCode,
	amount: string,
	translate: Translate,
	numberFormat: ActionFailureNumberFormat,
): string {
	return translate(AMOUNT_LIMIT_MESSAGES[code](numberFormat.isolateNumber(numberFormat.formatDecimalString(amount))));
}

/** Renders a stored failure in the active language, falling back to the caller's or a generic message. */
export function describeActionFailure(
	failure: ActionFailure,
	translate: Translate,
	numberFormat: ActionFailureNumberFormat,
	fallback?: string,
): string {
	return formatActionFailure(failure, translate, numberFormat) ?? fallback ?? translate(GENERIC_FAILURE);
}

/**
 * Describes any thrown value in the active language. Exchange rejection texts are translated when
 * known and otherwise shown unchanged; everything else is translated, falling back to a generic
 * message instead of showing an untranslated `Error.message`.
 */
export function describeActionError(
	error: unknown,
	translate: Translate,
	numberFormat: ActionFailureNumberFormat,
	fallback?: string,
): string {
	return describeActionFailure(classifyActionError(error), translate, numberFormat, fallback);
}

function getApiRequestFailure(error: Record<string, unknown>): ActionFailure {
	const entries = getApiResponseEntries(error.response);
	if (entries.length > 0) return { kind: "exchange-error", entries };
	const message = typeof error.message === "string" ? error.message : "";
	return message ? { kind: "exchange-error", entries: parseExchangeErrorText(message) } : coded("unknown");
}

function getApiResponseEntries(response: unknown): ExchangeErrorEntry[] {
	if (!isRecord(response)) return [];
	if (response.status === "err" && typeof response.response === "string") return [{ text: response.response }];
	const body = isRecord(response.response) ? response.response : undefined;
	const data = body && isRecord(body.data) ? body.data : undefined;
	if (!data) return [];
	if (Array.isArray(data.statuses)) {
		return data.statuses.flatMap((status, index) =>
			isRecord(status) && typeof status.error === "string" ? [{ index, text: status.error }] : [],
		);
	}
	if (isRecord(data.status) && typeof data.status.error === "string") return [{ text: data.status.error }];
	return [];
}

/**
 * Finds our own error in the cause chain: the LI.FI SDK and wallet adapters wrap what our callbacks
 * throw, and our message is the most specific thing to say.
 */
function findOwnActionError(error: unknown): AmountLimitActionError | LocalizedActionError | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < 6 && isRecord(current); depth++) {
		if (current instanceof AmountLimitActionError) return current;
		if (current instanceof LocalizedActionError) return current;
		current = current.cause;
	}
	return undefined;
}

/** Keeps each rejected order's own text and position from our order tracking result. */
function getOrderBatchFailure(resolution: unknown): ActionFailure {
	if (!isRecord(resolution) || !Array.isArray(resolution.errors)) return coded("unknown");
	const entries = resolution.errors.filter(isExchangeErrorEntry);
	return entries.length > 0 ? { kind: "exchange-error", entries } : coded("unknown");
}

function isExchangeErrorEntry(value: unknown): value is ExchangeErrorEntry {
	return (
		isRecord(value) &&
		typeof value.text === "string" &&
		(value.index === undefined || (typeof value.index === "number" && Number.isSafeInteger(value.index)))
	);
}

/**
 * The SDK wraps whatever a wallet adapter throws while signing, including our own checks that run
 * just before the signature is returned; keep their reason instead of a generic signing failure.
 */
function getWalletSigningFailure(cause: unknown): ActionFailure {
	if (isRecord(cause) && cause.name !== "AbstractWalletError") {
		const failure = classifyActionError(cause);
		if (!isUnknownFailure(failure)) return failure;
	}
	return coded("signing-failed");
}

function isUnknownFailure(failure: ActionFailure): boolean {
	return "kind" in failure && failure.kind === "action-error" && failure.code === "unknown";
}

function getHttpFailure(error: Record<string, unknown>): CodedActionFailure {
	const status = getHttpStatus(error.response);
	if (status === undefined || status < 400 || status === 408 || status >= 500) return coded("request-unconfirmed");
	if (status === 429) return coded("rate-limited");
	return coded("request-rejected");
}

/** True when the user declined the request in their wallet, however deep the SDK wrapped it. */
export function isWalletRejectionError(error: unknown): boolean {
	return isRecord(error) && isWalletRejection(error);
}

function isWalletRejection(error: Record<string, unknown>): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 6 && isRecord(current); depth++) {
		if (current.code === 4001 || current.name === "UserRejectedRequestError") return true;
		if (
			typeof current.message === "string" &&
			/user rejected|user denied|rejected the request in (?:the )?wallet|request rejected by (?:the )?user/i.test(
				current.message,
			)
		) {
			return true;
		}
		current = current.cause;
	}
	return false;
}

function getHttpStatus(response: unknown): number | undefined {
	if (!isRecord(response) || typeof response.status !== "number") return undefined;
	return response.status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
