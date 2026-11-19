import type { SizeMode } from "@/lib/trade/types";

export interface SideLabels {
	buy: string;
	sell: string;
	buyAria: string;
	sellAria: string;
}

export function getSizeModeLabel(sizeMode: SizeMode, baseToken: string, quoteToken: string): string {
	return sizeMode === "base" ? baseToken || "---" : quoteToken;
}
