import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@sairn/ui";
import { useState } from "react";
import { MobileProgressiveList } from "@/components/trade/mobile/mobile-progressive-list";
import { TOUCH_PRESS_CLASS } from "@/components/ui/touch-press";
import { cn } from "@/lib/cn";
import { formatDateTime, shortenAddress, useNumberFormat } from "@/lib/format";
import type { ReferralTokenMetadata, ReferredTrader } from "@/lib/trade/referral";

interface Props {
	traders: ReferredTrader[];
	tokenMetadata: ReadonlyMap<number, ReferralTokenMetadata> | null;
}

const DESKTOP_PAGE_SIZE = 25;

export function ReferredTraders({ traders, tokenMetadata }: Props) {
	const { formatNumber, formatToken, formatUSD } = useNumberFormat();
	const { i18n, t } = useLingui();
	const locale = i18n.locale;
	const [currentPage, setCurrentPage] = useState(1);
	const totalPagesCount = Math.max(1, Math.ceil(traders.length / DESKTOP_PAGE_SIZE));
	const visiblePageIndex = Math.min(currentPage, totalPagesCount);
	const visiblePage = formatNumber(visiblePageIndex, { decimals: 0 });
	const totalPages = formatNumber(totalPagesCount, { decimals: 0 });
	const desktopTraders = traders.slice(
		(visiblePageIndex - 1) * DESKTOP_PAGE_SIZE,
		visiblePageIndex * DESKTOP_PAGE_SIZE,
	);
	const getTokenName = (tokenId: number) => tokenMetadata?.get(tokenId)?.name ?? t`Token #${tokenId}`;

	return (
		<>
			<Table
				scrollableRegionLabel={t`Referred traders`}
				className="hidden min-[1001px]:table"
				containerClassName="hidden min-[1001px]:block"
			>
				<TableHeader>
					<TableRow className="h-[30px]">
						<TableHead size="dense" className="text-xs">
							<Trans>Trader</Trans>
						</TableHead>
						<TableHead size="dense" className="text-xs">
							<Trans>Joined</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right text-xs">
							<Trans>USDC volume</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right text-xs">
							<Trans>Trader fee benefit</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right text-xs">
							<Trans>Your rewards</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right text-xs">
							<Trans>Reward assets</Trans>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{desktopTraders.map((trader) => (
						<TableRow key={trader.user} className="h-[42px]">
							<TableCell size="dense" className="text-2sm font-medium text-fg">
								<bdi dir="ltr">{shortenAddress(trader.user, 6, 4)}</bdi>
							</TableCell>
							<TableCell size="dense" className="text-2sm">
								{formatDateTime(trader.timeJoined, { locale })}
							</TableCell>
							<TableCell size="dense" className="text-right text-2sm tabular-nums">
								{formatUSD(trader.cumVlm)}
							</TableCell>
							<TableCell size="dense" className="text-right text-2sm tabular-nums">
								{formatUSD(trader.cumRewardedFeesSinceReferred)}
							</TableCell>
							<TableCell size="dense" className="text-right text-2sm tabular-nums">
								{formatUSD(trader.cumFeesRewardedToReferrer)}
							</TableCell>
							<TableCell size="dense" className="text-right text-2sm tabular-nums">
								<span
									className="line-clamp-1"
									title={trader.tokenToState.map(([tokenId]) => getTokenName(tokenId)).join(", ")}
								>
									{trader.tokenToState.map(([tokenId]) => getTokenName(tokenId)).join(", ") || "—"}
								</span>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			{totalPagesCount > 1 ? (
				<nav
					aria-label={t`Referred traders pages`}
					className="hidden items-center justify-between border-t border-stroke-weak px-6 py-3 min-[1001px]:flex"
				>
					<p className="text-xs tabular-nums text-fg-muted">
						<Trans>
							Page {visiblePage} of {totalPages}
						</Trans>
					</p>
					<div className="flex gap-2">
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							disabled={visiblePageIndex === 1}
							onClick={() => setCurrentPage(visiblePageIndex - 1)}
						>
							<Trans>Previous</Trans>
						</Button>
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							disabled={visiblePageIndex === totalPagesCount}
							onClick={() => setCurrentPage(visiblePageIndex + 1)}
						>
							<Trans>Next</Trans>
						</Button>
					</div>
				</nav>
			) : null}
			<div className="divide-y divide-stroke-weak min-[1001px]:hidden">
				<MobileProgressiveList items={traders}>
					{(visibleTraders) =>
						visibleTraders.map((trader) => (
							<article key={trader.user} className="px-4 py-3">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-2sm font-medium text-fg">
											<bdi dir="ltr">{shortenAddress(trader.user, 6, 4)}</bdi>
										</p>
										<p className="mt-0.5 text-2xs tabular-nums text-fg-muted">
											{formatDateTime(trader.timeJoined, { locale })} · <Trans>Volume</Trans> {formatUSD(trader.cumVlm)}
										</p>
									</div>
									<p className="text-2sm font-semibold tabular-nums text-success">
										+{formatUSD(trader.cumFeesRewardedToReferrer)}
									</p>
								</div>
								<div className="mt-2 flex items-center justify-between gap-3 text-2xs">
									<span className="text-fg-muted">
										<Trans>Trader fee benefit</Trans>
									</span>
									<span className="tabular-nums text-fg">{formatUSD(trader.cumRewardedFeesSinceReferred)}</span>
								</div>
								{trader.tokenToState.length ? (
									<details className="mt-2 py-2">
										<summary
											className={cn(
												"cursor-pointer py-1 text-2xs font-medium text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
												TOUCH_PRESS_CLASS,
											)}
										>
											<Trans>Reward assets</Trans>
										</summary>
										<div className="mt-2 space-y-2">
											{trader.tokenToState.map(([tokenId, state]) => {
												const metadata = tokenMetadata?.get(tokenId);
												const tokenName = getTokenName(tokenId);
												return (
													<div key={tokenId} className="flex items-center justify-between gap-3 text-2xs">
														<span className="font-medium text-fg">{tokenName}</span>
														<span className="text-right tabular-nums text-fg-muted">
															<Trans>Volume</Trans>{" "}
															{formatToken(state.cumVlm, {
																symbol: tokenName,
																maximumFractionDigits: metadata?.weiDecimals ?? 8,
															})}
															· <Trans>Rewards</Trans>{" "}
															{formatToken(state.cumFeesRewardedToReferrer, {
																symbol: tokenName,
																maximumFractionDigits: metadata?.weiDecimals ?? 8,
															})}
														</span>
													</div>
												);
											})}
										</div>
									</details>
								) : null}
							</article>
						))
					}
				</MobileProgressiveList>
			</div>
		</>
	);
}
