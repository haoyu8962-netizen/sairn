import { msg } from "@lingui/core/macro";
import { getOffTickPriceExample } from "@/domain/trade/orders";
import type { Side } from "@/lib/trade/types";
import type { Translate } from "@/lib/translate";
import { createValidator, type Validator } from "../types";

export interface PriceTickContext {
	assetId: number | null;
	szDecimals: number;
	side: Side;
	usesLimitPrice: boolean;
	usesTriggerPrice: boolean;
	limitPriceInput: string;
	triggerPriceInput: string;
	twapOrder: boolean;
	twapPricesEnabled: boolean;
	twapTriggerPriceInput: string;
	twapStopPriceInput: string;
	formatDecimalString: (value: string) => string;
}

function getExample(ctx: PriceTickContext, value: string, side?: Side): string | null {
	if (ctx.assetId === null) return null;
	return getOffTickPriceExample(value, { assetId: ctx.assetId, szDecimals: ctx.szDecimals }, side);
}

function getTickMessage(ctx: PriceTickContext, example: string | null, translate: Translate): string {
	const validPrice = ctx.formatDecimalString(example ?? "");
	return translate(
		msg`Price must be a multiple of the tick size, with at most 5 significant figures. E.g., ${validPrice}`,
	);
}

export const limitPriceTickValidator: Validator<PriceTickContext> = createValidator({
	id: "limit-price-tick",
	code: "INP_006",
	category: "input",
	priority: 105,
	getMessage: (ctx, translate) => getTickMessage(ctx, getExample(ctx, ctx.limitPriceInput, ctx.side), translate),
	validate: (ctx) => !ctx.usesLimitPrice || getExample(ctx, ctx.limitPriceInput, ctx.side) === null,
});

export const triggerPriceTickValidator: Validator<PriceTickContext> = createValidator({
	id: "trigger-price-tick",
	code: "INP_007",
	category: "input",
	priority: 106,
	getMessage: (ctx, translate) => getTickMessage(ctx, getExample(ctx, ctx.triggerPriceInput), translate),
	validate: (ctx) => !ctx.usesTriggerPrice || getExample(ctx, ctx.triggerPriceInput) === null,
});

function usesTwapPrices(ctx: PriceTickContext): boolean {
	return ctx.twapOrder && ctx.twapPricesEnabled;
}

export const twapTriggerPriceTickValidator: Validator<PriceTickContext> = createValidator({
	id: "twap-trigger-price-tick",
	code: "INP_008",
	category: "input",
	priority: 107,
	getMessage: (ctx, translate) => getTickMessage(ctx, getExample(ctx, ctx.twapTriggerPriceInput), translate),
	validate: (ctx) => !usesTwapPrices(ctx) || getExample(ctx, ctx.twapTriggerPriceInput) === null,
});

export const twapStopPriceTickValidator: Validator<PriceTickContext> = createValidator({
	id: "twap-stop-price-tick",
	code: "INP_009",
	category: "input",
	priority: 108,
	getMessage: (ctx, translate) => getTickMessage(ctx, getExample(ctx, ctx.twapStopPriceInput, ctx.side), translate),
	validate: (ctx) => !usesTwapPrices(ctx) || getExample(ctx, ctx.twapStopPriceInput, ctx.side) === null,
});
