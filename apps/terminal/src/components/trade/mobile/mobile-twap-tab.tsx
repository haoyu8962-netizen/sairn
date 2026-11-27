import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useMemo, useState } from "react";
import { type TwapSubview, TwapSubviewPanel, TwapSubviewTabs } from "@/components/trade/twap/twap-subview-tabs";
import { DataPendingState } from "@/components/ui/data-pending-state";
import { TimeTicker } from "@/components/ui/time-ticker";
import { HL_ALL_DEXS } from "@/config/app";
import { getToolbarTwapMetrics } from "@/domain/trade/trading-toolbar-metrics";
import { getTwapViewState } from "@/domain/trade/twap";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useTwapCancel } from "@/hooks/trade/use-twap-cancel";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatClockDuration, useNumberFormat } from "@/lib/format";
import { useMarkets, useSubscription } from "@/lib/hyperliquid";
import { getMarketDexLabel, getMarketListLabel } from "@/lib/hyperliquid/markets/helper";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { MobileTwapFillHistoryList } from "./mobile-twap-fill-history-list";
import { MobileTwapHistoryList } from "./mobile-twap-history-list";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

export function MobileTwapTab({ className, scrollMode = "contained" }: Props) {
	const { formatNumber, formatPercent, formatPrice } = useNumberFormat();
	const { t } = useLingui();
	const [subview, setSubview] = useState<TwapSubview>("current");
	const { address, isConnected } = useWalletSession();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const {
		data: twapStatesEvent,
		status,
		isStale,
	} = useSubscription(
		"twapStates",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const markets = useMarkets();
	const { cancelTwap, cancellingTwapId, feedback } = useTwapCancel();

	const twapStates = twapStatesEvent?.states ?? [];
	const activeOrders = useMemo(
		() =>
			subview === "current"
				? twapStates.map(([twapId, state]) => ({ twapId, state })).sort((a, b) => b.state.timestamp - a.state.timestamp)
				: [],
		[subview, twapStates],
	);

	const viewState = getTwapViewState({ isConnected, status, hasData: twapStatesEvent !== undefined, isStale });
	const isPageScroll = scrollMode === "page";
	const renderTimeMs = Date.now();

	function handleSelectMarket(name: string) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	function renderCurrentContent(): ReactNode {
		if (!isConnected) {
			return <div className="flex-1" />;
		}

		if (viewState !== "ready" || status !== "active") {
			return <DataPendingState loading={viewState === "loading"} />;
		}

		if (activeOrders.length === 0) {
			return (
				<div className="flex flex-1 flex-col items-center justify-center gap-2 px-3.5 py-11 text-center">
					<div
						aria-hidden="true"
						className="grid size-10 place-items-center rounded-full bg-market-close-hover text-sm font-bold text-market-close-subtle"
					>
						≡
					</div>
					<span className="text-[13px] font-semibold text-market-close-muted">{t`No active TWAP orders.`}</span>
				</div>
			);
		}

		return (
			<div className={cn("min-h-0 flex flex-col", !isPageScroll && "flex-1")}>
				<div
					className={cn(
						"flex flex-col gap-2.5 px-3.5 py-3",
						!isPageScroll && "min-h-0 flex-1 overflow-y-auto overscroll-y-contain",
					)}
				>
					{activeOrders.map(({ twapId, state }) => {
						const isBuy = state.side === "B";
						const market = markets.getMarket(state.coin);
						const marketLabel = getMarketListLabel(market, state.coin);
						const marketDex = getMarketDexLabel(market);
						const marketName = marketDex ? `${marketLabel} (${marketDex})` : marketLabel;
						const sizeUnit = market?.shortName ?? state.coin;
						const szDecimals = markets.getSzDecimals(state.coin);
						const metrics = getToolbarTwapMetrics({
							sz: state.sz,
							executedSz: state.executedSz,
							executedNtl: state.executedNtl,
							timestampMs: String(state.timestamp),
							minutes: String(state.minutes),
							nowMs: String(renderTimeMs),
						});
						const progressRatio = metrics.progressRatio ?? "0";
						const remainingMs = Number(metrics.remainingMs ?? "0");
						const isCancelling = cancellingTwapId === twapId;

						return (
							<article
								key={twapId}
								data-account-card
								className="flex flex-col gap-2.5 rounded-[14px] border border-market-close-stroke-card bg-surface px-3.5 py-3"
							>
								<div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
									<div className="flex min-w-0 flex-wrap items-center gap-2">
										<button
											type="button"
											onClick={() => handleSelectMarket(state.coin)}
											aria-label={t`Switch to ${marketName} market`}
											className="-my-3 inline-flex min-h-11 max-w-full items-center gap-1 rounded-[4px] text-start text-sm font-bold text-market-close-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus"
										>
											<span className="min-w-0 break-words">{marketLabel}</span>
											{marketDex ? (
												<span className="shrink-0 rounded-8 bg-fill-weak px-1 py-0.5 text-3xs leading-3 font-semibold text-market-close-muted">
													{marketDex}
												</span>
											) : null}
										</button>
										<span
											className={cn(
												"shrink-0 rounded-[4px] px-[7px] py-0.5 text-[10px] font-bold text-market-close-on-control",
												isBuy ? "bg-market-close-success" : "bg-market-close-danger",
											)}
										>
											{isBuy ? t`Buy` : t`Sell`}
										</span>
										{state.reduceOnly ? (
											<span className="shrink-0 rounded-[4px] bg-market-close-hover px-[7px] py-0.5 text-[10px] font-bold text-market-close-muted">
												{t`RO`}
											</span>
										) : null}
									</div>
									<span className="shrink-0 whitespace-nowrap text-xs text-market-close-muted tabular-nums">
										{t`Remaining`}{" "}
										<TimeTicker
											startTime={renderTimeMs}
											durationMs={remainingMs}
											isActive={remainingMs > 0}
											format={(elapsedMs) => formatClockDuration(remainingMs - elapsedMs)}
										/>
									</span>
								</div>

								<div className="flex flex-col gap-1">
									<div className="flex min-w-0 flex-col gap-0.5 text-[11px] text-market-close-muted tabular-nums">
										<div className="flex min-w-0 items-baseline justify-between gap-2">
											<span className="min-w-0 break-words">
												{formatNumber(state.executedSz, szDecimals)} / {formatNumber(state.sz, szDecimals)} {sizeUnit}
											</span>
											<span className="shrink-0 font-bold text-market-close-fg">
												{formatPercent(metrics.progressRatio, { decimals: 0, signDisplay: "never" })}
											</span>
										</div>
										<div className="min-w-0 break-words">
											{t`Avg Price`}{" "}
											{formatPrice(metrics.executedAvgPx, {
												szDecimals,
												marketType: market?.kind === "spot" ? "spot" : "perp",
											})}
										</div>
									</div>
									<div
										role="progressbar"
										aria-label={t`TWAP execution progress`}
										aria-valuemin={0}
										aria-valuemax={1}
										aria-valuenow={Number(progressRatio)}
										aria-valuetext={formatPercent(metrics.progressRatio, { decimals: 0, signDisplay: "never" })}
										className="h-[5px] overflow-hidden rounded-[3px] bg-market-close-stroke-card"
									>
										<div
											data-testid="mobile-twap-progress"
											className={cn(
												"h-full origin-left rounded-[3px]",
												isBuy ? "bg-market-close-success" : "bg-market-close-danger",
											)}
											style={{ transform: `scaleX(${progressRatio})` }}
										/>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										disabled
										aria-label={t`Pause unavailable: Hyperliquid does not support pausing active TWAP orders.`}
										title={t`Hyperliquid does not support pausing active TWAP orders.`}
										className="min-h-11 rounded-8 border border-market-close-stroke-card bg-surface px-3 text-xs font-semibold text-market-close-subtle disabled:cursor-not-allowed"
									>
										{t`Pause`}
									</button>
									<button
										type="button"
										aria-label={t`Terminate TWAP order`}
										aria-busy={isCancelling}
										disabled={cancellingTwapId !== null}
										onClick={() => void cancelTwap(state.coin, twapId)}
										className="min-h-11 rounded-8 border border-stroke-error-weak bg-surface px-3 text-xs font-semibold text-market-close-danger outline-none transition-colors duration-[120ms] active:bg-market-close-hover focus-visible:border-market-close-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:border-market-close-stroke-card disabled:text-fg-disabled"
									>
										{t`Terminate`}
									</button>
								</div>
							</article>
						);
					})}
				</div>
			</div>
		);
	}

	return (
		<TwapSubviewTabs
			mobile
			value={subview}
			onValueChange={setSubview}
			className={cn("font-market-close", !isPageScroll && "flex-1", className)}
		>
			{feedback ? (
				<div
					role={feedback.tone === "error" ? "alert" : "status"}
					className={cn(
						"shrink-0 px-3.5 pt-3 text-xs",
						feedback.tone === "error" ? "text-market-close-danger" : "text-warning",
					)}
				>
					{feedback.message}
				</div>
			) : null}
			<TwapSubviewPanel value="current">{subview === "current" ? renderCurrentContent() : null}</TwapSubviewPanel>
			<TwapSubviewPanel value="history">
				<MobileTwapHistoryList scrollMode={scrollMode} />
			</TwapSubviewPanel>
			<TwapSubviewPanel value="fills">
				<MobileTwapFillHistoryList scrollMode={scrollMode} />
			</TwapSubviewPanel>
		</TwapSubviewTabs>
	);
}
