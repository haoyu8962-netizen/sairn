import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { Button } from "@sairn/ui";
import { useState } from "react";
import { normalizeDecimalInputEvent } from "@/components/ui/decimal-input-event";
import { PERCENT_OPTIONS } from "@/config/bridge";
import { cn } from "@/lib/cn";
import { getBridgeMaxTokenAmount, getBridgeUsdShortcut, resolveBridgeTokenAmount } from "@/lib/lifi/bridge-amount";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import { HyperCoreUsdcIcon } from "../hypercore-usdc-icon";
import { TokenIcon } from "./shared-ui";

const BRIDGE_USD_INPUT_WIDTH = "w-36";

function getTokenAmountKey(token: BridgeToken): string {
	return `${token.chainId}:${token.address}:${token.amount}:${token.decimals}:${token.priceUSD}`;
}

interface Props {
	token: BridgeToken;
	initialUsd: string;
	initialIsMax?: boolean;
	onBack: () => void;
	onContinue: (tokenAmount: string, usdInput: string) => void;
}

export function AmountEntryScreen({ token, initialUsd, initialIsMax = false, onBack, onContinue }: Props) {
	const { t } = useLingui();
	const tokenAmountKey = getTokenAmountKey(token);
	const [usdInput, setUsdInput] = useState(initialUsd);
	const [maxSelectionKey, setMaxSelectionKey] = useState<string | null>(() => (initialIsMax ? tokenAmountKey : null));

	function handleUsdChange(e: React.ChangeEvent<HTMLInputElement>) {
		const raw = normalizeDecimalInputEvent(e).target.value;
		if (raw === "") {
			setMaxSelectionKey(null);
			setUsdInput("");
			return;
		}
		if (!/^\d*\.?\d{0,2}$/.test(raw)) return;
		setMaxSelectionKey(null);
		setUsdInput(raw);
	}

	function handlePercent(percent: number) {
		setMaxSelectionKey(null);
		setUsdInput(getBridgeUsdShortcut(token, percent));
	}

	function handleMax() {
		const maxTokenAmount = getBridgeMaxTokenAmount(token);
		setMaxSelectionKey(maxTokenAmount !== null ? tokenAmountKey : null);
		setUsdInput(getBridgeUsdShortcut(token, 100));
	}

	const isMaxSelected = maxSelectionKey === tokenAmountKey;
	const resolvedTokenAmount = isMaxSelected
		? getBridgeMaxTokenAmount(token)
		: resolveBridgeTokenAmount(usdInput, token);
	const canContinue = resolvedTokenAmount !== null;

	function handleSubmit() {
		if (!resolvedTokenAmount) return;
		onContinue(resolvedTokenAmount, usdInput);
	}

	return (
		<div className="flex flex-1 flex-col gap-6">
			<Button
				type="button"
				variant="ghost"
				intent="brand"
				size="xs"
				onClick={onBack}
				iconLeft={<ArrowLeftIcon className="size-3 rtl:rotate-180" />}
				className="self-start text-signal hover:text-signal-hover max-[1000px]:min-h-11"
			>
				<Trans>Back</Trans>
			</Button>

			<div className="flex flex-col items-center gap-4 py-4">
				<div className="flex items-baseline justify-center">
					<span className="text-4xl font-semibold text-fg tabular-nums" aria-hidden="true">
						$
					</span>
					<input
						type="text"
						inputMode="decimal"
						aria-label={t`Amount in USD`}
						value={usdInput}
						onChange={handleUsdChange}
						placeholder="0.00"
						className={cn(
							BRIDGE_USD_INPUT_WIDTH,
							"rounded-8 border border-transparent bg-transparent text-center text-4xl font-semibold text-fg tabular-nums outline-none transition-[color,box-shadow,border-color] placeholder:text-fg-disabled focus-visible:border-stroke-focus focus-visible:ring-2 focus-visible:ring-stroke-focus/20",
						)}
					/>
				</div>

				<div className="flex items-center gap-2">
					{PERCENT_OPTIONS.map((p) => (
						<Button
							key={p}
							type="button"
							variant="ghost"
							intent="neutral"
							size="sm"
							onClick={() => handlePercent(p)}
							className="bg-surface font-medium hover:bg-signal-soft active:bg-fill-press max-[1000px]:min-h-11"
						>
							<Trans>{p}%</Trans>
						</Button>
					))}
					<Button
						type="button"
						variant="ghost"
						intent="neutral"
						size="sm"
						onClick={handleMax}
						className="bg-surface font-medium hover:bg-signal-soft active:bg-fill-press max-[1000px]:min-h-11"
					>
						<Trans>Max</Trans>
					</Button>
				</div>
			</div>

			<div className="flex items-center justify-center gap-3 rounded-8 border border-stroke-weak p-3">
				<div className="flex items-center gap-2">
					<TokenIcon token={token} />
					<div className="text-start">
						<p className="text-xs text-fg-muted">
							<Trans>You send</Trans>
						</p>
						<p className="text-xs font-medium text-fg">{token.symbol}</p>
					</div>
				</div>
				<ArrowRightIcon className="size-4 shrink-0 text-fg-muted rtl:rotate-180" />
				<div className="flex items-center gap-2">
					<HyperCoreUsdcIcon />
					<div className="text-start">
						<p className="text-xs text-fg-muted">
							<Trans>You receive</Trans>
						</p>
						<p className="text-xs font-medium text-fg">USDC</p>
					</div>
				</div>
			</div>

			<Button
				variant="filled"
				intent="brand"
				size="lg"
				className="w-full mt-auto"
				disabled={!canContinue}
				onClick={handleSubmit}
			>
				<Trans>Continue</Trans>
			</Button>
		</div>
	);
}
