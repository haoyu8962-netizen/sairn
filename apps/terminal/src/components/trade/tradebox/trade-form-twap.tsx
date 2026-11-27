import { useLingui } from "@lingui/react/macro";
import { Checkbox } from "@sairn/ui";
import { useId } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { TWAP_MINUTES_MAX, TWAP_MINUTES_MIN } from "@/config/trade";
import {
	buildTwapDurationDraft,
	getTwapTriggerDirection,
	isTwapHoursAtMax,
	parseTwapPriceInput,
	resolveTwapDurationState,
	TWAP_HOURS_MAX,
	TWAP_MINUTES_PER_INPUT_MAX,
} from "@/domain/trade/twap-details";
import { cn } from "@/lib/cn";
import { useNumberFormat } from "@/lib/format";
import { getTwapStopPriceLabel } from "@/lib/trade/twap-labels";
import type { Side } from "@/lib/trade/types";
import { tradingInputFrameClass, tradingInputFrameErrorClass } from "@/lib/ui/trading-input";
import {
	useOrderEntryActions,
	useTwapAdvancedEnabled,
	useTwapDurationDraft,
	useTwapMinutes,
	useTwapRandomize,
	useTwapStopPrice,
	useTwapTriggerPrice,
} from "@/stores/use-order-entry-store";

interface Props {
	disabled: boolean;
	triggerPriceInvalid?: boolean;
	stopPriceInvalid?: boolean;
	triggerPriceErrorMessage?: string;
	stopPriceErrorMessage?: string;
	side: Side;
	quoteToken: string;
	markPx: number;
	assetId: number | undefined;
	szDecimals: number;
	compact?: boolean;
	desktop?: boolean;
	mobileSafe?: boolean;
	reduceOnly?: { disabled?: boolean; checked: boolean; onCheckedChange: (checked: boolean) => void };
}

const labelClass = "text-2xs leading-none text-trading-panel-subtle";
const twapFrameClass = cn(tradingInputFrameClass, "flex-1");
const priceFrameClass = cn(tradingInputFrameClass, "px-2.5");
const durationLabelClass = "me-2 shrink-0 whitespace-nowrap text-xs text-trading-panel-subtle";
const priceLabelClass = "me-2 shrink-0 cursor-text whitespace-nowrap text-xs text-trading-panel-subtle";
const inputClass =
	"h-9 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg";
const compactFrameClass = "h-8 px-2.5";
const compactDurationLabelClass = "me-1.5 text-2xs";
const compactPriceLabelClass = "me-1.5 min-w-0 shrink truncate text-2xs";
const compactInputClass = "h-7";
const MINUTES_PER_DAY = 24 * 60;
const DAYS_MAX = Math.floor(TWAP_MINUTES_MAX / MINUTES_PER_DAY);

export function TradeFormTwap({
	disabled,
	triggerPriceInvalid = false,
	stopPriceInvalid = false,
	triggerPriceErrorMessage,
	stopPriceErrorMessage,
	side,
	quoteToken,
	markPx,
	assetId,
	szDecimals,
	compact,
	desktop,
	mobileSafe,
	reduceOnly,
}: Props) {
	const { t } = useLingui();
	const { formatDecimalString } = useNumberFormat();
	const durationErrorId = useId();
	const triggerFieldId = useId();
	const triggerErrorId = useId();
	const stopFieldId = useId();
	const stopErrorId = useId();
	const advancedFieldsId = useId();
	const advancedEnabled = useTwapAdvancedEnabled();
	const twapMinutesNum = useTwapMinutes();
	const twapDurationDraft = useTwapDurationDraft();
	const twapRandomize = useTwapRandomize();
	const twapTriggerPrice = useTwapTriggerPrice();
	const twapStopPrice = useTwapStopPrice();
	const {
		setTwapMinutes,
		setTwapDurationDraft,
		setTwapRandomize,
		setTwapTriggerPrice,
		setTwapStopPrice,
		setTwapAdvancedEnabled,
	} = useOrderEntryActions();

	const { hoursValue, minutesValue, hoursInvalid, minutesInvalid, minutesLocked } = resolveTwapDurationState(
		twapMinutesNum,
		twapDurationDraft,
	);
	const durationErrors: string[] = [];
	if (hoursInvalid) durationErrors.push(t`Hours must be 0-${TWAP_HOURS_MAX}`);
	if (minutesInvalid) durationErrors.push(t`Minutes must be 0-${TWAP_MINUTES_PER_INPUT_MAX}`);
	const durationErrorMessage = durationErrors.join(" \u2022 ");
	const stopPriceLabel = getTwapStopPriceLabel(side, { buy: t`Max Price`, sell: t`Min Price` });
	const triggerPx = parseTwapPriceInput(twapTriggerPrice, { assetId, szDecimals }).price;
	const triggerDirection = getTwapTriggerDirection(triggerPx, markPx);
	const triggerPrice = triggerPx ? formatDecimalString(triggerPx) : "";
	const aboveTriggerHint = t`Activates when mark ≥ ${triggerPrice}`;
	const belowTriggerHint = t`Activates when mark ≤ ${triggerPrice}`;
	const triggerHint =
		triggerDirection === "above" ? aboveTriggerHint : triggerDirection === "below" ? belowTriggerHint : "";
	const hoursLabel = t`Hour(s)`;
	const minutesLabel = t`Minute(s)`;
	const durationFrameClass = cn(twapFrameClass, compact && compactFrameClass, desktop && "h-9 px-2.5");
	const durationTextClass = cn(durationLabelClass, (compact || desktop) && compactDurationLabelClass);
	const priceFieldClass = cn(priceFrameClass, compact && compactFrameClass, desktop && "h-9");
	const priceTextClass = cn(priceLabelClass, (compact || desktop) && compactPriceLabelClass);
	const fieldInputClass = cn(inputClass, compact && compactInputClass, desktop && "h-8");
	const quoteUnitClass = compact || desktop ? "trade-card-label-full" : undefined;

	const optionProps = {
		className: cn(
			"min-w-0 max-w-full items-center gap-1.5",
			mobileSafe
				? "min-h-6 w-full gap-2"
				: "relative isolate min-h-5 after:absolute after:inset-x-0 after:-inset-y-1 after:-z-10 after:content-['']",
		),
		controlClassName: cn(
			"size-[17px] rounded-[5px] border-trading-panel-stroke-control data-checked:border-trading-panel-control data-checked:bg-trading-panel-control",
			mobileSafe ? "size-4 rounded-4 after:size-6" : "after:h-7 after:w-full",
		),
		indicatorClassName: "text-trading-panel-on-control",
		labelClassName: "text-xs text-trading-panel-muted [overflow-wrap:anywhere]",
	};

	function commitDurationDraft(nextHours: string, nextMinutes: string) {
		const nextDraft = buildTwapDurationDraft(nextHours, nextMinutes);
		setTwapMinutes(nextDraft.expectedMinutes);
		setTwapDurationDraft?.(nextDraft);
	}

	function handleHoursChange(value: string) {
		const nextMinutes = isTwapHoursAtMax(value) ? "0" : minutesValue;
		commitDurationDraft(value, nextMinutes);
	}

	function handleMinutesChange(value: string) {
		if (minutesLocked) return;
		commitDurationDraft(hoursValue, value);
	}

	return (
		<div data-slot="trade-twap-fields" className="flex min-w-0 flex-col gap-2">
			<div className="flex flex-col gap-1.5">
				<span className={labelClass}>{t`Running Time (${TWAP_MINUTES_MIN}m - ${DAYS_MAX}d)`}</span>
				<div className="flex gap-2">
					<div
						className={cn(durationFrameClass, hoursInvalid && tradingInputFrameErrorClass, disabled && "opacity-50")}
					>
						<span className={durationTextClass}>{compact || desktop ? t`Hrs` : hoursLabel}</span>
						<NumberInput
							aria-label={hoursLabel}
							aria-invalid={hoursInvalid || undefined}
							aria-describedby={hoursInvalid ? durationErrorId : undefined}
							placeholder="0"
							value={hoursValue}
							onChange={(e) => handleHoursChange(e.target.value)}
							allowDecimals={false}
							min={0}
							max={TWAP_HOURS_MAX}
							className={fieldInputClass}
							disabled={disabled}
							mobileSafe={mobileSafe}
						/>
					</div>
					<div
						className={cn(
							durationFrameClass,
							minutesInvalid && tradingInputFrameErrorClass,
							(disabled || minutesLocked) && "opacity-50",
						)}
					>
						<span className={durationTextClass}>{compact || desktop ? t`Mins` : minutesLabel}</span>
						<NumberInput
							aria-label={minutesLabel}
							aria-invalid={minutesInvalid || undefined}
							aria-describedby={minutesInvalid ? durationErrorId : undefined}
							placeholder="0"
							value={minutesValue}
							onChange={(e) => handleMinutesChange(e.target.value)}
							allowDecimals={false}
							min={0}
							max={TWAP_MINUTES_PER_INPUT_MAX}
							className={fieldInputClass}
							disabled={disabled || minutesLocked}
							readOnly={minutesLocked}
							mobileSafe={mobileSafe}
						/>
					</div>
				</div>
				{durationErrorMessage !== "" && (
					<p id={durationErrorId} role="alert" className="text-2xs text-trading-panel-error">
						{durationErrorMessage}
					</p>
				)}
			</div>
			<div data-slot="trade-twap-options" className={mobileSafe ? "flex min-w-0 flex-col" : "contents"}>
				<div className={mobileSafe ? "contents" : "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"}>
					<Checkbox
						{...optionProps}
						disabled={disabled}
						checked={twapRandomize}
						onCheckedChange={(checked) => setTwapRandomize(checked === true)}
						label={t`Randomize timing`}
					/>
					{reduceOnly && (
						<Checkbox
							{...optionProps}
							disabled={reduceOnly.disabled ?? disabled}
							checked={reduceOnly.checked}
							onCheckedChange={(checked) => reduceOnly.onCheckedChange(checked === true)}
							label={t`Reduce Only`}
						/>
					)}
				</div>
				<Checkbox
					{...optionProps}
					checked={advancedEnabled}
					onCheckedChange={(checked) => setTwapAdvancedEnabled(checked === true)}
					label={t`Advanced Settings`}
					aria-controls={advancedFieldsId}
					aria-expanded={advancedEnabled}
				/>
			</div>
			<div
				id={advancedFieldsId}
				data-slot="trade-twap-advanced"
				hidden={!advancedEnabled}
				className={cn("min-w-0 flex-col", compact ? "gap-1.5" : "gap-2", advancedEnabled ? "flex" : "hidden")}
			>
				<div className="flex flex-col gap-1.5">
					<div
						className={cn(
							priceFieldClass,
							triggerPriceInvalid && tradingInputFrameErrorClass,
							disabled && "opacity-50",
						)}
					>
						<label htmlFor={triggerFieldId} className={priceTextClass}>
							{t`Trigger Price`}
							<span className={quoteUnitClass}> ({quoteToken})</span>
						</label>
						<NumberInput
							id={triggerFieldId}
							aria-label={`${t`Trigger Price`} (${quoteToken})`}
							placeholder="0.00"
							value={twapTriggerPrice}
							aria-invalid={triggerPriceInvalid || undefined}
							aria-describedby={triggerPriceErrorMessage ? triggerErrorId : undefined}
							onChange={(e) => setTwapTriggerPrice(e.target.value)}
							className={fieldInputClass}
							disabled={disabled || !advancedEnabled}
							mobileSafe={mobileSafe}
						/>
					</div>
					{triggerPriceErrorMessage ? (
						<span id={triggerErrorId} hidden>
							{triggerPriceErrorMessage}
						</span>
					) : null}
					{(triggerHint || (mobileSafe && triggerPx !== null)) && (
						<p className={cn("text-2xs text-trading-panel-muted", mobileSafe && "grid")}>
							{mobileSafe ? (
								<>
									<span
										aria-hidden={triggerDirection !== "above"}
										className={cn("col-start-1 row-start-1", triggerDirection !== "above" && "invisible")}
									>
										{aboveTriggerHint}
									</span>
									<span
										aria-hidden={triggerDirection !== "below"}
										className={cn("col-start-1 row-start-1", triggerDirection !== "below" && "invisible")}
									>
										{belowTriggerHint}
									</span>
								</>
							) : (
								triggerHint
							)}
						</p>
					)}
				</div>
				<div className={cn(priceFieldClass, stopPriceInvalid && tradingInputFrameErrorClass, disabled && "opacity-50")}>
					<label htmlFor={stopFieldId} className={priceTextClass}>
						{stopPriceLabel}
						<span className={quoteUnitClass}> ({quoteToken})</span>
					</label>
					<NumberInput
						id={stopFieldId}
						aria-label={`${stopPriceLabel} (${quoteToken})`}
						placeholder="0.00"
						value={twapStopPrice}
						aria-invalid={stopPriceInvalid || undefined}
						aria-describedby={stopPriceErrorMessage ? stopErrorId : undefined}
						onChange={(e) => setTwapStopPrice(e.target.value)}
						className={fieldInputClass}
						disabled={disabled || !advancedEnabled}
						mobileSafe={mobileSafe}
					/>
				</div>
				{stopPriceErrorMessage ? (
					<span id={stopErrorId} hidden>
						{stopPriceErrorMessage}
					</span>
				) : null}
			</div>
		</div>
	);
}
