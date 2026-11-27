import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import Big from "big.js";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { type NumberFormatters, useNumberFormat } from "@/lib/format";
import {
	formatVaultSignedUsd,
	formatVaultUsd,
	getLatestVaultHistoryValue,
	getVaultValueTone,
	type VaultPeriod,
	type VaultPortfolioSnapshot,
} from "./domain/vaults";

interface VaultPerformanceChartProps {
	snapshot: VaultPortfolioSnapshot;
	kind: "accountValue" | "pnl";
	period: VaultPeriod;
	compact?: boolean;
	snapshotCurrent: boolean;
}

export function VaultPerformanceChart({
	snapshot,
	kind,
	period,
	compact = false,
	snapshotCurrent,
}: VaultPerformanceChartProps) {
	const { t } = useLingui();
	const numberFormat = useNumberFormat();
	const accessibleNameId = useId();
	const accessibleDescriptionId = useId();
	const history = kind === "accountValue" ? snapshot.accountValueHistory : snapshot.pnlHistory;
	const latest = getLatestVaultHistoryValue(snapshot, kind);
	const tone = kind === "pnl" ? getVaultValueTone(latest) : "neutral";
	const path = createChartPath(history);
	const singlePoint = path ? null : getSingleChartPoint(history);
	const hasPlottableHistory = Boolean(path || singlePoint);
	const isConfirmedEmptyHistory = snapshotCurrent && history.length === 0;
	const historySummary = path ? summarizeChartHistory(history) : null;
	const label = kind === "accountValue" ? t`Account value` : t`PNL`;
	const translate = (descriptor: MessageDescriptor) => t(descriptor);
	const periodLabel = getPeriodLabel(period, translate);
	const direction = getDirectionLabel(tone, translate);
	const latestValue =
		kind === "pnl" ? formatVaultSignedUsd(latest, numberFormat) : formatVaultUsd(latest, numberFormat);
	const compactSummary = renderCompactSummary({
		hasPlottableHistory,
		isConfirmedEmptyHistory,
		kind,
		label,
		periodLabel,
		latestValue,
		direction,
	});
	const formattedHistorySummary = historySummary ? formatChartHistorySummary(historySummary, kind, numberFormat) : null;
	const trendDescription = getTrendDescription(historySummary?.trend, translate);
	const accessibleDescription = renderAccessibleDescription({
		formattedHistorySummary,
		trendDescription,
		hasSinglePoint: Boolean(singlePoint),
		latestValue,
		isConfirmedEmptyHistory,
	});
	const chartVisual = renderChartVisual({
		hasPlottableHistory,
		isConfirmedEmptyHistory,
		compact,
		tone,
		path,
	});

	if (compact) {
		return (
			<>
				<span data-vault-chart-summary className="sr-only">
					{compactSummary}
				</span>
				<figure data-vault-compact-chart aria-hidden="true" className="relative h-9 w-full overflow-hidden">
					{chartVisual}
				</figure>
			</>
		);
	}

	return (
		<figure
			data-vault-performance-chart
			role="img"
			className="flex h-52 w-full flex-col overflow-hidden min-[1001px]:h-64"
			aria-labelledby={accessibleNameId}
			aria-describedby={accessibleDescriptionId}
		>
			<figcaption className="px-3 pt-3">
				<span id={accessibleNameId} className="sr-only">
					{label} {periodLabel}
				</span>
				<span id={accessibleDescriptionId} className="sr-only">
					{accessibleDescription}
				</span>
				<p className="text-2xs text-fg-muted">{label}</p>
				<p
					className={cn(
						"mt-0.5 text-base font-bold tabular-nums",
						tone === "positive" ? "text-market-up" : tone === "negative" ? "text-market-down" : "text-fg",
					)}
				>
					<bdi dir="ltr">{latestValue}</bdi>
				</p>
			</figcaption>
			<div data-vault-chart-plot className="min-h-0 flex-1 pt-2">
				{chartVisual}
			</div>
		</figure>
	);
}

interface ChartHistorySummary {
	end: string;
	maximum: string;
	minimum: string;
	start: string;
	trend: "decreased" | "increased" | "unchanged";
}

function summarizeChartHistory(points: readonly { timestamp: number; value: string }[]): ChartHistorySummary | null {
	if (points.length < 2 || points.some((point) => !Number.isSafeInteger(point.timestamp) || point.timestamp < 0)) {
		return null;
	}
	let values: Big[];
	try {
		values = points.map((point) => Big(point.value));
	} catch {
		return null;
	}
	if (points[points.length - 1].timestamp <= points[0].timestamp) return null;
	let minimum = values[0];
	let maximum = values[0];
	for (const value of values.slice(1)) {
		if (value.lt(minimum)) minimum = value;
		if (value.gt(maximum)) maximum = value;
	}
	const start = values[0];
	const end = values[values.length - 1];
	return {
		start: start.toString(),
		end: end.toString(),
		minimum: minimum.toString(),
		maximum: maximum.toString(),
		trend: end.gt(start) ? "increased" : end.lt(start) ? "decreased" : "unchanged",
	};
}

function formatChartHistorySummary(
	summary: ChartHistorySummary,
	kind: "accountValue" | "pnl",
	numberFormat: NumberFormatters,
) {
	const formatValue = kind === "pnl" ? formatVaultSignedUsd : formatVaultUsd;
	return {
		start: formatValue(summary.start, numberFormat),
		end: formatValue(summary.end, numberFormat),
		minimum: formatValue(summary.minimum, numberFormat),
		maximum: formatValue(summary.maximum, numberFormat),
	};
}

type Translate = (descriptor: MessageDescriptor) => string;

function getPeriodLabel(period: VaultPeriod, translate: Translate): string {
	if (period === "day") return translate(msg`24 hours`);
	if (period === "week") return translate(msg`7 days`);
	if (period === "month") return translate(msg`30 days`);
	return translate(msg`all time`);
}

function getDirectionLabel(tone: "positive" | "negative" | "neutral", translate: Translate): string {
	if (tone === "positive") return translate(msg`Positive PNL`);
	if (tone === "negative") return translate(msg`Negative PNL`);
	return translate(msg`PNL is zero`);
}

function getTrendDescription(trend: ChartHistorySummary["trend"] | undefined, translate: Translate): string {
	if (trend === "increased") return translate(msg`The value increased overall.`);
	if (trend === "decreased") return translate(msg`The value decreased overall.`);
	return translate(msg`The start and end values are unchanged.`);
}

function renderCompactSummary({
	hasPlottableHistory,
	isConfirmedEmptyHistory,
	kind,
	label,
	periodLabel,
	latestValue,
	direction,
}: {
	hasPlottableHistory: boolean;
	isConfirmedEmptyHistory: boolean;
	kind: "accountValue" | "pnl";
	label: string;
	periodLabel: string;
	latestValue: string;
	direction: string;
}) {
	if (hasPlottableHistory) {
		if (kind === "pnl") {
			return (
				<Trans>
					{label} over {periodLabel}. Latest value <bdi dir="ltr">{latestValue}</bdi>. {direction}.
				</Trans>
			);
		}
		return (
			<Trans>
				{label} over {periodLabel}. Latest value <bdi dir="ltr">{latestValue}</bdi>.
			</Trans>
		);
	}
	if (isConfirmedEmptyHistory) {
		return (
			<Trans>
				{label} over {periodLabel}. No performance history.
			</Trans>
		);
	}
	return (
		<Trans>
			{label} over {periodLabel}.
		</Trans>
	);
}

function renderAccessibleDescription({
	formattedHistorySummary,
	trendDescription,
	hasSinglePoint,
	latestValue,
	isConfirmedEmptyHistory,
}: {
	formattedHistorySummary: ReturnType<typeof formatChartHistorySummary> | null;
	trendDescription: string;
	hasSinglePoint: boolean;
	latestValue: string;
	isConfirmedEmptyHistory: boolean;
}) {
	if (formattedHistorySummary) {
		return (
			<>
				<Trans>
					Starts at <bdi dir="ltr">{formattedHistorySummary.start}</bdi> and ends at{" "}
					<bdi dir="ltr">{formattedHistorySummary.end}</bdi>.
				</Trans>{" "}
				{trendDescription}{" "}
				<Trans>
					Minimum <bdi dir="ltr">{formattedHistorySummary.minimum}</bdi>; maximum{" "}
					<bdi dir="ltr">{formattedHistorySummary.maximum}</bdi>.
				</Trans>
			</>
		);
	}
	if (hasSinglePoint) {
		return (
			<Trans>
				Single data point at <bdi dir="ltr">{latestValue}</bdi>.
			</Trans>
		);
	}
	if (isConfirmedEmptyHistory) {
		return <Trans>No performance history is available for the selected period.</Trans>;
	}
	return null;
}

function renderChartVisual({
	hasPlottableHistory,
	isConfirmedEmptyHistory,
	compact,
	tone,
	path,
}: {
	hasPlottableHistory: boolean;
	isConfirmedEmptyHistory: boolean;
	compact: boolean;
	tone: "positive" | "negative" | "neutral";
	path: string | null;
}) {
	if (hasPlottableHistory) {
		return (
			<svg
				aria-hidden="true"
				focusable="false"
				viewBox="0 0 100 36"
				preserveAspectRatio="none"
				className={cn(
					"size-full",
					tone === "positive" ? "text-market-up" : tone === "negative" ? "text-market-down" : "text-chart-accent",
				)}
			>
				{compact ? null : (
					<g className="text-stroke-weak">
						<path d="M0 9 H100 M0 18 H100 M0 27 H100" stroke="currentColor" strokeWidth="0.3" />
					</g>
				)}
				{path ? (
					<path
						d={path}
						fill="none"
						stroke="currentColor"
						strokeWidth={compact ? 1.5 : 1}
						vectorEffect="non-scaling-stroke"
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
				) : (
					<path
						d="M50 18 L50 18"
						fill="none"
						stroke="currentColor"
						strokeWidth={compact ? 4 : 6}
						strokeLinecap="round"
						vectorEffect="non-scaling-stroke"
						data-single-point
					/>
				)}
			</svg>
		);
	}
	if (isConfirmedEmptyHistory) {
		return (
			<div className="grid size-full place-items-center text-xs text-fg-muted">
				<Trans>No performance history</Trans>
			</div>
		);
	}
	return <div className="size-full" />;
}

function getSingleChartPoint(
	points: readonly { timestamp: number; value: string }[],
): { timestamp: number; value: string } | null {
	if (points.length === 0) return null;
	const firstTimestamp = points[0]?.timestamp;
	if (!Number.isSafeInteger(firstTimestamp) || firstTimestamp < 0) return null;
	for (const point of points) {
		if (point.timestamp !== firstTimestamp) return null;
		try {
			Big(point.value);
		} catch {
			return null;
		}
	}
	return points[points.length - 1] ?? null;
}

/** Financial inputs remain decimal strings until this chart-rendering boundary. */
export function createChartPath(points: readonly { timestamp: number; value: string }[]): string | null {
	if (points.length < 2) return null;
	let parsed: Big[];
	try {
		parsed = points.map((point) => Big(point.value));
	} catch {
		return null;
	}
	if (points.some((point) => !Number.isSafeInteger(point.timestamp) || point.timestamp < 0)) return null;
	const startTime = Big(points[0].timestamp);
	const endTime = Big(points[points.length - 1].timestamp);
	const timeRange = endTime.minus(startTime);
	if (timeRange.lte(0)) return null;
	let minimum = parsed[0];
	let maximum = parsed[0];
	for (const value of parsed.slice(1)) {
		if (value.lt(minimum)) minimum = value;
		if (value.gt(maximum)) maximum = value;
	}
	const range = maximum.minus(minimum);
	return parsed
		.map((value, index) => {
			const x = Big(points[index].timestamp).minus(startTime).times(100).div(timeRange).toNumber();
			const normalized = range.eq(0) ? Big("0.5") : value.minus(minimum).div(range);
			const y = Big(34).minus(normalized.times(32)).toNumber();
			return `${index === 0 ? "M" : "L"}${roundCoordinate(x)} ${roundCoordinate(y)}`;
		})
		.join(" ");
}

function roundCoordinate(value: number): string {
	return Big(value).round(3).toString();
}
