import { useLingui } from "@lingui/react/macro";
import { XIcon } from "@phosphor-icons/react";
import { Button } from "@sairn/ui";
import { useEffect, useRef, useState } from "react";
import { StatusGlyph } from "@/components/brand/status-glyph";
import { cn } from "@/lib/cn";
import { useNumberFormat } from "@/lib/format";
import { getOrderNotificationCopy } from "@/lib/trade/order-notification-copy";
import { getOrderNotificationGlyph } from "@/lib/trade/order-notification-glyph";
import { formatOrderChildError } from "@/lib/trade/order-status-reasons";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";

const scrollRegionClassName =
	"max-h-[min(18rem,35dvh,calc((100dvh_-_var(--offset-bottom,0px)_-_env(safe-area-inset-top)_-_4rem)/2))] overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus";

function useScrollableRegion(enabled = true) {
	const ref = useRef<HTMLElement>(null);
	const [scrollable, setScrollable] = useState(false);

	useEffect(() => {
		const element = ref.current;
		if (!enabled || !element) return;
		function measure() {
			if (element) setScrollable(element.scrollHeight > element.clientHeight);
		}
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		if (element.firstElementChild) observer.observe(element.firstElementChild);
		return () => observer.disconnect();
	}, [enabled]);

	return { ref, scrollable };
}

function readToastHiddenInStack(section: HTMLElement | null): boolean {
	const toastItem = section?.closest<HTMLElement>("[data-sonner-toast]");
	if (!toastItem) return false;
	if (toastItem.getAttribute("data-visible") === "false") return true;
	if (toastItem.getAttribute("data-expanded") !== "false") return false;
	if (toastItem.getAttribute("data-front") !== "false") return false;
	const toaster = toastItem.closest<HTMLElement>("[data-sonner-toaster]");
	const active = document.activeElement;
	if (toaster && active instanceof Node && toaster.contains(active)) return false;
	return true;
}

function useHiddenInCollapsedStack() {
	const ref = useRef<HTMLElement>(null);
	const [hidden, setHidden] = useState(false);

	useEffect(() => {
		const section = ref.current;
		const toastItem = section?.closest<HTMLElement>("[data-sonner-toast]");
		if (!section || !toastItem) return;
		const toaster = toastItem.closest<HTMLElement>("[data-sonner-toaster]");

		function sync() {
			setHidden(readToastHiddenInStack(section));
		}

		sync();
		const observer = new MutationObserver(sync);
		observer.observe(toastItem, {
			attributes: true,
			attributeFilter: ["data-expanded", "data-front", "data-visible"],
		});

		function handleFocusIn() {
			sync();
		}

		function handleFocusOut(event: FocusEvent) {
			const next = event.relatedTarget;
			if (toaster && next instanceof Node && toaster.contains(next)) return;
			if (toastItem?.getAttribute("data-visible") === "false") {
				setHidden(true);
				return;
			}
			setHidden(
				toastItem?.getAttribute("data-expanded") === "false" && toastItem?.getAttribute("data-front") === "false",
			);
		}

		toaster?.addEventListener("focusin", handleFocusIn);
		toaster?.addEventListener("focusout", handleFocusOut);
		return () => {
			observer.disconnect();
			toaster?.removeEventListener("focusin", handleFocusIn);
			toaster?.removeEventListener("focusout", handleFocusOut);
		};
	}, []);

	return { ref, hidden };
}

interface Props {
	order: OrderQueueItem;
	onDismiss: () => void;
}

export function OrderToast({ order, onDismiss }: Props) {
	const { t } = useLingui();
	const numberFormat = useNumberFormat();
	const copy = getOrderNotificationCopy(order, (descriptor) => t(descriptor), numberFormat);
	const glyph = getOrderNotificationGlyph(order);
	const successful = order.status === "success";
	const failed = order.status === "failed";
	const hasChildren = Boolean(order.children?.length);
	const stackVisibility = useHiddenInCollapsedStack();
	const bodyRegion = useScrollableRegion();
	const childrenRegion = useScrollableRegion(hasChildren);
	const childLabels = {
		pending: t`Pending`,
		filled: t`Fully filled`,
		"filled-unverified": t`Filled (quantity unverified)`,
		partial: t`Partially filled`,
		accepted: t`Accepted`,
		rejected: t`Rejected`,
		unknown: t`Status unconfirmed`,
		canceled: t`Canceled`,
	};
	return (
		<section
			ref={stackVisibility.ref}
			aria-label={copy.label}
			data-order-feedback={order.id}
			className="w-full rounded-8 border border-stroke-weak bg-overlay p-3 shadow-overlay font-sans text-xs"
		>
			<div className="flex items-start gap-3">
				<StatusGlyph key={glyph.id} glyph={glyph} />
				<div className="min-w-0 flex-1 space-y-1">
					<section
						ref={bodyRegion.ref}
						aria-label={bodyRegion.scrollable ? t`Notification details` : undefined}
						tabIndex={!stackVisibility.hidden && bodyRegion.scrollable ? 0 : undefined}
						data-order-scroll="body"
						className={cn(
							scrollRegionClassName,
							"[overflow-wrap:anywhere]",
							successful && "text-success",
							failed && "text-error",
							!successful && !failed && "text-fg-muted",
						)}
					>
						<div role={failed ? "alert" : "status"} aria-atomic="true" className="space-y-1">
							<p data-order-summary dir="auto" className="font-medium">
								{copy.summary}
							</p>
							{copy.detail && (
								<p data-order-detail dir="auto">
									{copy.detail}
								</p>
							)}
							{copy.notice && (
								<p data-order-notice dir="auto">
									{copy.notice}
								</p>
							)}
							{copy.count && <p>{copy.count}</p>}
							{copy.error && <p dir="auto">{copy.error}</p>}
						</div>
					</section>
				</div>
				<Button
					variant="ghost"
					intent="neutral"
					size="xs"
					tabIndex={stackVisibility.hidden ? -1 : undefined}
					onClick={onDismiss}
					aria-label={t`Dismiss`}
					className="min-h-6 min-w-6 shrink-0"
				>
					<XIcon className="size-4" />
				</Button>
			</div>
			{hasChildren && (
				<section
					ref={childrenRegion.ref}
					aria-label={childrenRegion.scrollable ? t`Order results` : undefined}
					tabIndex={!stackVisibility.hidden && childrenRegion.scrollable ? 0 : undefined}
					data-order-scroll="children"
					className={cn(scrollRegionClassName, "mt-2")}
				>
					<ul className="divide-y divide-stroke-weak">
						{order.children?.map((child, index) => (
							<li key={`${child.assetId}-${index}`} className="py-1.5 text-fg-muted [overflow-wrap:anywhere]">
								<div className="flex flex-wrap justify-between gap-2">
									<bdi>{child.market || t`Order ${index + 1}`}</bdi>
									<span>{childLabels[child.status]}</span>
								</div>
								{child.filledSize !== undefined && (
									<p>
										{t`Filled`}:{" "}
										<bdi>
											{numberFormat.formatDecimalString(child.filledSize)}
											{child.size && ` / ${numberFormat.formatDecimalString(child.size)}`}
										</bdi>
									</p>
								)}
								{child.filledSize === undefined && child.size && (
									<p>
										{t`Size`}: <bdi>{numberFormat.formatDecimalString(child.size)}</bdi>
									</p>
								)}
								{child.error && (
									<p dir="auto" className="text-warning break-words">
										{formatOrderChildError(child.error, (descriptor) => t(descriptor))}
									</p>
								)}
							</li>
						))}
					</ul>
				</section>
			)}
		</section>
	);
}
