import { useLingui } from "@lingui/react/macro";
import { Button } from "@sairn/ui";
import { useMemo, useState } from "react";
import {
	canConfirmEmptyMarketCatalog,
	resolveMarketCatalogDisplayState,
} from "@/components/trade/chart/token-selector-metrics";
import { CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { marketSearchConfig } from "@/config/search";
import { getMarketSelectorPrice } from "@/domain/market/selector-quote";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { cn } from "@/lib/cn";
import { useNumberFormat } from "@/lib/format";
import { type UnifiedMarketInfo, useMarketsInfo } from "@/lib/hyperliquid";
import { createSearcher } from "@/lib/search";
import { useCommandMenuActions, useCommandMenuOpen } from "@/stores/use-global-modal-store";
import { AssetDisplay } from "./asset-display";

const COMMAND_DIALOG_MAX_WIDTH_CLASS = "sm:max-w-[30rem]";
const COMMAND_LIST_HEIGHT_CLASS = "h-[22.5rem] max-h-[22.5rem]";

export function CommandMenu() {
	const { t } = useLingui();
	const { formatPrice } = useNumberFormat();
	const open = useCommandMenuOpen();
	const { close } = useCommandMenuActions();
	const { markets, isLoading, error, catalogState, retryMarketCatalog } = useMarketsInfo();
	const navigateToMarket = useMarketNavigation();

	const [query, setQuery] = useState("");
	const searcher = useMemo(() => createSearcher(markets, marketSearchConfig), [markets]);
	const results = query ? searcher.search(query) : [];
	const displayItems = query ? results.map((r) => r.item) : markets;
	const catalogDisplayState = resolveMarketCatalogDisplayState({
		visibleMarketCount: displayItems.length,
		isLoading,
		error,
		catalogState,
	});
	const canConfirmEmpty = canConfirmEmptyMarketCatalog({
		isLoading,
		error,
		catalogState,
	});

	function handleSelect(market: UnifiedMarketInfo) {
		navigateToMarket(market.name, market);
		close();
		setQuery("");
	}

	function handleRetry() {
		void retryMarketCatalog?.();
	}

	function getKindLabel(market: UnifiedMarketInfo): string {
		if (market.kind === "spot") return t`Spot`;
		if (market.kind === "builderPerp") return market.dex;
		return t`Perp`;
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) {
			close();
			setQuery("");
		}
	}

	function renderListContent() {
		if (catalogDisplayState === "loading") {
			return (
				<div aria-busy="true" className="min-h-44 flex-1">
					<span className="sr-only">{t`Loading markets`}</span>
				</div>
			);
		}
		if (catalogDisplayState === "error") {
			return (
				<div className="flex flex-col items-center justify-center px-4 py-8 text-center">
					<Button
						type="button"
						variant="outline"
						intent="neutral"
						size="xs"
						onClick={handleRetry}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.stopPropagation();
							}
						}}
					>
						{t`Retry`}
					</Button>
				</div>
			);
		}
		return (
			<>
				{canConfirmEmpty ? <CommandEmpty>{t`No markets found.`}</CommandEmpty> : null}
				{displayItems.map((market) => {
					const livePrice = getMarketSelectorPrice(market);
					return (
						<CommandItem
							key={`${market.kind}-${market.name}`}
							value={`${market.kind}-${market.name}`}
							onSelect={() => handleSelect(market)}
							className="flex items-center justify-between"
						>
							<AssetDisplay coin={market.name} iconClassName="size-5" />
							<div className="ms-auto flex items-center gap-2">
								<span className="text-fg-muted text-xs">
									{formatPrice(livePrice, {
										szDecimals: market.szDecimals,
										marketType: market.kind === "spot" ? "spot" : "perp",
									})}
								</span>
								<span
									className={cn(
										"rounded-8 px-1.5 py-0.5 text-xs",
										market.kind === "perp" && "bg-fill-weak text-scope-perp",
										market.kind === "spot" && "bg-fill-weak text-scope-spot",
										market.kind === "builderPerp" && "bg-fill-weak text-scope-builders",
									)}
								>
									{getKindLabel(market)}
								</span>
							</div>
						</CommandItem>
					);
				})}
			</>
		);
	}

	return (
		<CommandDialog
			open={!!open}
			onOpenChange={handleOpenChange}
			title={t`Search markets`}
			description={t`Search for a market to trade`}
			showCloseButton={false}
			shouldFilter={false}
			className={COMMAND_DIALOG_MAX_WIDTH_CLASS}
		>
			<CommandInput placeholder={t`Search markets...`} value={query} onValueChange={setQuery} />
			<CommandList className={COMMAND_LIST_HEIGHT_CLASS}>{renderListContent()}</CommandList>
		</CommandDialog>
	);
}
