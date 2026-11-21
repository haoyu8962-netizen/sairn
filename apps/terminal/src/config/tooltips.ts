import { msg } from "@lingui/core/macro";
import type { Translate } from "@/lib/translate";

export interface DefinitionItem {
	key: string;
	term: string;
	definition: string;
}

export interface DefinitionTooltipContent {
	title: string;
	items: DefinitionItem[];
}

type TooltipBuilder = (translate: Translate) => DefinitionTooltipContent;

const TOOLTIPS = {
	tif: (translate: Translate): DefinitionTooltipContent => ({
		title: translate(msg`Time In Force`),
		items: [
			{
				key: "Gtc",
				term: translate(msg`GTC (Good Til Cancel)`),
				definition: translate(msg`Order will rest until filled or canceled.`),
			},
			{
				key: "Ioc",
				term: translate(msg`IOC (Immediate Or Cancel)`),
				definition: translate(msg`Any portion that is not immediately filled will be canceled.`),
			},
			{
				key: "Alo",
				term: translate(msg`ALO (Add Liquidity Only)`),
				definition: translate(msg`Order will exist only as a limit order on the book. Also known as post-only.`),
			},
		],
	}),
} as const satisfies Record<string, TooltipBuilder>;

export type TooltipId = keyof typeof TOOLTIPS;

export function getTooltip(
	id: TooltipId,
	translate: Translate,
	options?: { only?: readonly string[] },
): DefinitionTooltipContent {
	const content = TOOLTIPS[id](translate);
	if (!options?.only) return content;
	const allow = new Set(options.only);
	return { ...content, items: content.items.filter((item) => allow.has(item.key)) };
}
