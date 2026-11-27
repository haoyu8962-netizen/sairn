import { Trans, useLingui } from "@lingui/react/macro";
import {
	ArrowLeftIcon,
	CaretDownIcon,
	CaretUpIcon,
	ClockIcon,
	SpinnerGapIcon,
	WalletIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@sairn/ui";
import Big from "big.js";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";
import { TOUCH_PRESS_CLASS } from "@/components/ui/touch-press";
import { formatSendAmount, formatTokenAmount } from "@/lib/bridge/format";
import { cn } from "@/lib/cn";
import { formatDuration, shortenAddress, useNumberFormat } from "@/lib/format";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import {
	type BridgeQuote,
	getBridgeQuoteErrorKind,
	getBridgeQuoteRemainingSeconds,
	isBridgeQuoteWorse,
	useBridgeQuote,
} from "@/lib/lifi/use-quote";
import { HyperCoreUsdcIcon } from "../hypercore-usdc-icon";
import { QuoteCountdown, TokenIcon } from "./shared-ui";

interface Props {
	token: BridgeToken;
	tokenAmount: string;
	address: string;
	onBack: () => void;
	onConfirm: (quote: BridgeQuote) => void;
}

type QuoteFeedback = "expired" | "refresh-error" | "updated" | "amount-too-low" | "fees-exceed-amount" | "unavailable";

export function ConfirmationScreen({ token, tokenAmount, address, onBack, onConfirm }: Props) {
	const { i18n } = useLingui();
	const locale = i18n.locale;
	const numberFormat = useNumberFormat();
	const { formatUSD } = numberFormat;
	const noticeId = useId();
	const confirmAttemptRef = useRef(0);
	const inFlightAttemptRef = useRef<number | null>(null);
	const confirmationKey = `${token.chainId}:${token.address}:${tokenAmount}:${address}`;
	const activeConfirmationKeyRef = useRef<string | null>(null);
	const [activeConfirmationKey, setActiveConfirmationKey] = useState(confirmationKey);
	const [currentTime, setCurrentTime] = useState(Date.now);
	const [isConfirming, setIsConfirming] = useState(false);
	const [feedback, setFeedback] = useState<{ kind: QuoteFeedback; dataUpdatedAt: number } | null>(null);
	if (activeConfirmationKey !== confirmationKey) {
		setActiveConfirmationKey(confirmationKey);
		setIsConfirming(false);
		setFeedback(null);
	}
	const quoteParams = {
		fromChainId: token.chainId,
		fromTokenAddress: token.address,
		fromTokenDecimals: token.decimals,
		fromAddress: address,
		amount: tokenAmount,
	};

	const {
		data: quote,
		isLoading: quoteLoading,
		isError: quoteError,
		error: quoteQueryError,
		dataUpdatedAt,
		refetch,
	} = useBridgeQuote(quoteParams);
	const remainingSeconds = quote ? getBridgeQuoteRemainingSeconds(dataUpdatedAt, currentTime) : 0;
	const quoteExpired = !!quote && remainingSeconds === 0;
	const currentFeedback = feedback?.dataUpdatedAt === dataUpdatedAt ? feedback.kind : null;
	let notice: QuoteFeedback | null = currentFeedback;
	if (!notice && quoteError && (!quote || quoteExpired)) notice = getBridgeQuoteErrorKind(quoteQueryError);
	if (!notice && quoteExpired) notice = "expired";

	useLayoutEffect(() => {
		activeConfirmationKeyRef.current = confirmationKey;
		inFlightAttemptRef.current = null;
		return () => {
			if (activeConfirmationKeyRef.current === confirmationKey) activeConfirmationKeyRef.current = null;
			inFlightAttemptRef.current = null;
			confirmAttemptRef.current += 1;
		};
	}, [confirmationKey]);

	useEffect(() => {
		if (!quote) return;
		setCurrentTime(Date.now());
		const interval = window.setInterval(() => setCurrentTime(Date.now()), 1000);
		return () => window.clearInterval(interval);
	}, [quote]);

	function handleBack() {
		confirmAttemptRef.current += 1;
		inFlightAttemptRef.current = null;
		setIsConfirming(false);
		onBack();
	}

	async function handleConfirm() {
		if (
			!quote ||
			isConfirming ||
			inFlightAttemptRef.current !== null ||
			activeConfirmationKeyRef.current !== confirmationKey
		) {
			return;
		}
		const attemptId = ++confirmAttemptRef.current;
		inFlightAttemptRef.current = attemptId;
		const wasExpired = quoteExpired;
		setIsConfirming(true);
		setFeedback(null);

		try {
			const result = await refetch();
			if (activeConfirmationKeyRef.current !== confirmationKey || confirmAttemptRef.current !== attemptId) return;
			if (result.isError || !result.data) {
				setFeedback({ kind: "refresh-error", dataUpdatedAt });
				return;
			}
			if (wasExpired) return;
			if (isBridgeQuoteWorse(quote, result.data)) {
				setFeedback({ kind: "updated", dataUpdatedAt: result.dataUpdatedAt });
				return;
			}
			if (activeConfirmationKeyRef.current !== confirmationKey || confirmAttemptRef.current !== attemptId) return;
			onConfirm(result.data);
		} catch {
			if (activeConfirmationKeyRef.current !== confirmationKey || confirmAttemptRef.current !== attemptId) return;
			setFeedback({ kind: "refresh-error", dataUpdatedAt });
		} finally {
			if (inFlightAttemptRef.current === attemptId) {
				inFlightAttemptRef.current = null;
			}
			if (activeConfirmationKeyRef.current === confirmationKey && confirmAttemptRef.current === attemptId) {
				setIsConfirming(false);
			}
		}
	}

	const noticeContent = (() => {
		switch (notice) {
			case "expired":
				return <Trans>Quote expired. Refresh it before confirming.</Trans>;
			case "refresh-error":
				return <Trans>Quote refresh failed. Try again before confirming.</Trans>;
			case "updated":
				return <Trans>Quote updated. Review the new amount before confirming.</Trans>;
			case "amount-too-low":
				return <Trans>Amount is too low for the available bridge routes.</Trans>;
			case "fees-exceed-amount":
				return <Trans>Fees are higher than the bridge amount.</Trans>;
			case "unavailable":
				return <Trans>No route available. Try a different amount or asset.</Trans>;
			default:
				return null;
		}
	})();
	const confirmButtonContent = (() => {
		if (quoteLoading || isConfirming) {
			return (
				<>
					<SpinnerGapIcon className="size-4 animate-spin" />
					<Trans>Preparing your quote...</Trans>
				</>
			);
		}
		if (quoteExpired) return <Trans>Refresh quote</Trans>;
		return <Trans>Confirm</Trans>;
	})();

	const usdDisplay = (() => {
		try {
			return formatUSD(Big(tokenAmount).times(token.priceUSD).toNumber(), 2);
		} catch {
			return formatUSD(0, 2);
		}
	})();

	const receiveAmount = quote ? formatTokenAmount(quote.toAmount, 6, numberFormat) : "---";
	const receiveAmountUSD = quote ? formatUSD(quote.toAmountUSD, 2) : "";

	return (
		<div className="flex flex-1 flex-col gap-3">
			<div>
				<div className="flex items-center justify-between">
					<Button
						type="button"
						variant="ghost"
						intent="brand"
						size="xs"
						onClick={handleBack}
						iconLeft={<ArrowLeftIcon className="size-3 rtl:rotate-180" />}
						className="text-signal hover:text-signal-hover max-[1000px]:min-h-11"
					>
						<Trans>Back</Trans>
					</Button>
					{quote ? <QuoteCountdown remaining={remainingSeconds} /> : null}
				</div>

				<p className="text-4xl font-semibold text-fg tabular-nums text-center py-2">
					<bdi dir="ltr">{usdDisplay}</bdi>
				</p>

				<InfoRowGroup className="text-xs">
					<InfoRow
						label={<Trans>Source</Trans>}
						value={
							<span className="flex items-center gap-1.5">
								<WalletIcon className="size-3" />
								<Trans>
									Wallet (<bdi dir="ltr">{shortenAddress(address)}</bdi>)
								</Trans>
							</span>
						}
					/>
					<InfoRow label={<Trans>Destination</Trans>} value="Hyperliquid" />
					<InfoRow
						label={
							<span className="flex items-center gap-1">
								<ClockIcon className="size-3" />
								<Trans>Estimated time</Trans>
							</span>
						}
						value={quote ? `~${formatDuration(Math.ceil(quote.executionDuration / 60), { locale })}` : "---"}
					/>
				</InfoRowGroup>

				<InfoRowGroup className="text-xs mt-3">
					<InfoRow
						label={<Trans>You send</Trans>}
						value={
							<span className="flex items-center gap-1.5">
								<TokenIcon token={token} size="sm" />
								{formatSendAmount(tokenAmount, numberFormat)} {token.symbol}
							</span>
						}
					/>
					<InfoRow
						label={<Trans>You receive</Trans>}
						value={
							<span className="flex items-center gap-1.5">
								<HyperCoreUsdcIcon size="sm" />
								{receiveAmount} USDC
								{receiveAmountUSD ? <span className="ms-1 text-fg-muted">{receiveAmountUSD}</span> : null}
							</span>
						}
					/>
				</InfoRowGroup>
			</div>

			{quote ? (
				<Collapsible>
					<CollapsibleTrigger
						className={cn(
							"flex w-full items-center justify-between rounded-8 px-2 py-1.5 text-xs text-fg-muted hover:bg-fill-hover group",
							TOUCH_PRESS_CLASS,
						)}
					>
						<span>
							<Trans>Transaction breakdown</Trans> ({formatUSD(quote.totalFeesUSD, 2)})
						</span>
						<CaretDownIcon className="size-3 group-data-[state=open]:hidden" />
						<CaretUpIcon className="size-3 hidden group-data-[state=open]:block" />
					</CollapsibleTrigger>
					<CollapsibleContent>
						<InfoRowGroup className="text-xs">
							{quote.gasCosts.map((gas) => (
								<InfoRow
									key={`gas-${gas.token.symbol}-${gas.amount}`}
									label={<Trans>Gas ({gas.token.symbol})</Trans>}
									value={formatUSD(gas.amountUSD, 2)}
								/>
							))}
							{quote.feeCosts.map((fee) => (
								<InfoRow key={`fee-${fee.name}-${fee.amount}`} label={fee.name} value={formatUSD(fee.amountUSD, 2)} />
							))}
						</InfoRowGroup>
					</CollapsibleContent>
				</Collapsible>
			) : null}

			<div className="mt-auto">
				<div id={noticeId} aria-live="polite" aria-atomic="true">
					{noticeContent ? (
						<div className="mb-3 flex items-center gap-2 rounded-16 border border-stroke-error-weak bg-error-soft p-2.5">
							<WarningCircleIcon className="size-4 shrink-0 text-error" aria-hidden="true" />
							<span className="text-xs text-error">{noticeContent}</span>
						</div>
					) : null}
				</div>

				<Button
					variant="filled"
					intent="brand"
					size="lg"
					className="w-full"
					aria-describedby={noticeContent ? noticeId : undefined}
					disabled={!quote || quoteLoading || isConfirming}
					onClick={() => void handleConfirm()}
				>
					{confirmButtonContent}
				</Button>
			</div>
		</div>
	);
}
