import { msg } from "@lingui/core/macro";
import { createValidator, type Validator } from "../types";

export interface SpotBalanceContext {
	side: "buy" | "sell";
	sizeValue: number;
	orderValue: number;
	baseAvailable: number;
	quoteAvailable: number;
	baseToken: string;
	quoteToken: string;
	/**
	 * What a buy locks in the quote token at the price it is sent at: for a market buy the size at the
	 * slippage limit, which the execution guard checks; defaults to the order value.
	 */
	quoteCost?: number;
}

function getQuoteCost(ctx: SpotBalanceContext): number {
	return ctx.quoteCost ?? ctx.orderValue;
}

export const insufficientQuoteBalanceValidator: Validator<SpotBalanceContext> = createValidator({
	id: "spot-insufficient-quote",
	code: "SPOT_BAL_001",
	category: "balance",
	priority: 110,
	getMessage: (ctx, translate) => {
		const quoteToken = ctx.quoteToken;
		return ctx.quoteAvailable >= ctx.orderValue
			? translate(msg`Insufficient ${quoteToken} balance at max slippage`)
			: translate(msg`Insufficient ${ctx.quoteToken} balance`);
	},
	validate: (ctx) => {
		if (ctx.side !== "buy" || ctx.orderValue <= 0) return true;
		return ctx.quoteAvailable >= getQuoteCost(ctx);
	},
});

export const insufficientBaseBalanceValidator: Validator<SpotBalanceContext> = createValidator({
	id: "spot-insufficient-base",
	code: "SPOT_BAL_002",
	category: "balance",
	priority: 111,
	getMessage: (ctx, translate) => translate(msg`Insufficient ${ctx.baseToken} balance`),
	validate: (ctx) => {
		if (ctx.side !== "sell" || ctx.sizeValue <= 0) return true;
		return ctx.baseAvailable >= ctx.sizeValue;
	},
});
