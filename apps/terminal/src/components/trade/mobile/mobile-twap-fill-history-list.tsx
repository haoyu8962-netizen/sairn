import { useLingui } from "@lingui/react/macro";
import { TwapHistoryLoadMore } from "@/components/trade/twap-history-feedback";
import { DataPendingState } from "@/components/ui/data-pending-state";
import { getMarketQuoteToken } from "@/domain/trade/balances";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useTwapFillHistoryCsv } from "@/hooks/trade/use-twap-fill-history-csv";
import { useTwapSliceFills } from "@/hooks/trade/use-twap-slice-fills";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatDateTimeShort, useNumberFormat } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { getMarketDexLabel, getMarketListLabel } from "@/lib/hyperliquid/markets/helper";
import { getFillDirectionPresentation } from "@/lib/trade/fill-direction";
import { getMarketPriceFormatOptions } from "@/lib/trade/market-price-format";
import { getUserFillNotional, getUserFillQuoteToken } from "@/lib/trade/user-fills";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

const footerActionClassName =
	"relative inline-flex h-[38px] min-h-0 items-center text-xs text-market-close-muted transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] active:text-market-close-fg focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:text-market-close-subtle";

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

export function MobileTwapFillHistoryList({ className, scrollMode = "contained" }: Props) {
	const { formatNumber, formatPrice, formatToken } = useNumberFormat();
	const { i18n, t } = useLingui();
	const locale = i18n.locale;
	const { address } = useWalletSession();
	const { canConfirmEmpty, fills, hasMore, isConnected, loadMore, status } = useTwapSliceFills();
	const { exportCsv, isExporting } = useTwapFillHistoryCsv();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const markets = useMarkets();
	const isPageScroll = scrollMode === "page";

	function handleSelectMarket(name: string) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	const exportFooter = (
		<div className="flex h-[38px] shrink-0 items-center gap-4 px-3.5" data-testid="mobile-twap-fill-history-footer">
			<button type="button" disabled={isExporting} onClick={() => void exportCsv()} className={footerActionClassName}>
				{t`Export CSV`}
			</button>
		</div>
	);

	if (!isConnected) {
		return <div className="flex-1" />;
	}

	if (status !== "ready" || (fills.length === 0 && !canConfirmEmpty)) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<DataPendingState loading={status === "loading" || status === "idle"} />
				{exportFooter}
			</div>
		);
	}

	if (fills.length === 0) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
					{t`No TWAP fills found.`}
				</div>
				{exportFooter}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"font-market-close flex min-h-0 flex-col",
				!isPageScroll && "flex-1 overflow-y-auto overscroll-y-contain",
				className,
			)}
		>
			<div data-testid="mobile-twap-fill-history-list" className="flex flex-col gap-2.5 px-3.5 py-3">
				{fills.map((fill) => {
					const market = markets.getMarket(fill.coin);
					const marketLabel = getMarketListLabel(market, fill.coin);
					const marketDex = getMarketDexLabel(market);
					const marketName = marketDex ? `${marketLabel} (${marketDex})` : marketLabel;
					const sizeUnit = market?.shortName ?? fill.coin;
					const szDecimals = markets.getSzDecimals(fill.coin);
					const isBuy = fill.side === "B";
					const direction = getFillDirectionPresentation(fill, address, (descriptor) => t(descriptor));
					const notional = getUserFillNotional(fill);
					const quoteToken = getMarketQuoteToken(market);
					const feeToken = markets.getTokenDisplayName(fill.feeToken);
					const pnlQuote = getUserFillQuoteToken(fill, market);

					return (
						<article
							key={`${fill.twapId}:${fill.tid}:${fill.oid}:${fill.time}`}
							data-account-card
							className="flex flex-col gap-3 rounded-[14px] border border-market-close-stroke-card bg-surface px-3.5 py-3"
						>
							<div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
								<button
									type="button"
									onClick={() => handleSelectMarket(fill.coin)}
									aria-label={t`Switch to ${marketName} market`}
									className="-my-2 inline-flex min-h-11 max-w-full items-center gap-1 rounded-[4px] text-start text-sm font-bold text-market-close-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus"
								>
									<span className="min-w-0 break-words">{marketLabel}</span>
									{marketDex ? (
										<span className="shrink-0 rounded-8 bg-fill-weak px-1 py-0.5 text-3xs leading-3 font-semibold text-market-close-muted">
											{marketDex}
										</span>
									) : null}
								</button>
								<div className="flex min-w-0 flex-col items-end gap-0.5 text-end">
									<span
										className={cn(
											"break-words text-xs font-semibold",
											direction.tone === "liquidation" || !isBuy
												? "text-market-close-danger"
												: "text-market-close-success",
										)}
									>
										{direction.label}
									</span>
									<span className="text-[10px] text-market-close-subtle tabular-nums">
										{formatDateTimeShort(fill.time, { locale })}
									</span>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
								<div className="min-w-0">
									<div className="break-words text-[10px] text-market-close-subtle">{t`Price`}</div>
									<div className="break-words text-xs font-semibold text-market-close-fg tabular-nums [overflow-wrap:anywhere]">
										{formatPrice(fill.px, getMarketPriceFormatOptions(market))}
									</div>
								</div>
								<div className="min-w-0">
									<div className="break-words text-[10px] text-market-close-subtle">{t`Size`}</div>
									<div className="break-words text-xs font-semibold text-market-close-fg tabular-nums [overflow-wrap:anywhere]">
										{formatNumber(fill.sz, szDecimals)} {sizeUnit}
									</div>
								</div>
								<div className="min-w-0">
									<div className="break-words text-[10px] text-market-close-subtle">{t`Trade Value`}</div>
									<div className="break-words text-xs font-semibold text-market-close-fg tabular-nums [overflow-wrap:anywhere]">
										{formatToken(notional, { compact: false, decimals: 2, symbol: quoteToken })}
									</div>
								</div>
								<div className="min-w-0">
									<div className="break-words text-[10px] text-market-close-subtle">{t`Fee`}</div>
									<div className="break-words text-xs font-semibold text-market-close-fg tabular-nums [overflow-wrap:anywhere]">
										{formatToken(fill.fee, { compact: false, symbol: feeToken })}
									</div>
								</div>
								<div className="min-w-0">
									<div className="break-words text-[10px] text-market-close-subtle">{t`Closed PNL`}</div>
									<div
										className={cn(
											"break-words text-xs font-semibold tabular-nums [overflow-wrap:anywhere]",
											getMarketCloseValueColorClass(fill.closedPnl),
										)}
									>
										{formatToken(fill.closedPnl, {
											compact: false,
											decimals: 2,
											signDisplay: "exceptZero",
											symbol: pnlQuote === null ? undefined : markets.getTokenDisplayName(pnlQuote),
										})}
									</div>
								</div>
							</div>
						</article>
					);
				})}
				{hasMore ? <TwapHistoryLoadMore className="-mx-3.5 -mb-3" onLoadMore={loadMore} /> : null}
			</div>
			{exportFooter}
		</div>
	);
}
