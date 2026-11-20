import type { ExchangeMethod } from "../../types/clients";

/**
 * Funds actions whose documented success answer is `{"status":"ok","response":{"type":"default"}}`
 * (Hyperliquid exchange endpoint: Send Asset, Core spot and USDC transfer, withdrawal, Spot/Perp
 * transfer and Send to EVM with data).
 */
const DEFAULT_ACKNOWLEDGED_METHODS: ReadonlySet<ExchangeMethod> = new Set([
	"sendAsset",
	"sendToEvmWithData",
	"spotSend",
	"usdClassTransfer",
	"usdSend",
	"withdraw3",
]);

/**
 * The request reached the exchange, but its answer is not the documented acknowledgement, so the
 * action may or may not have been executed. The pinned SDK only rejects the error shapes it knows
 * and resolves anything else, including `{}`.
 */
export class ExchangeResponseUnverifiedError extends Error {
	constructor(readonly method: ExchangeMethod) {
		super(`Hyperliquid did not acknowledge ${method} with the documented response.`);
		this.name = "ExchangeResponseUnverifiedError";
	}
}

function isDefaultAcknowledgement(response: unknown): boolean {
	if (!response || typeof response !== "object") return false;
	const { status, response: details } = response as Record<string, unknown>;
	if (status !== "ok" || !details || typeof details !== "object") return false;
	return (details as Record<string, unknown>).type === "default";
}

export function assertExchangeActionAcknowledged(method: ExchangeMethod, response: unknown): void {
	if (!DEFAULT_ACKNOWLEDGED_METHODS.has(method)) return;
	if (!isDefaultAcknowledgement(response)) throw new ExchangeResponseUnverifiedError(method);
}
