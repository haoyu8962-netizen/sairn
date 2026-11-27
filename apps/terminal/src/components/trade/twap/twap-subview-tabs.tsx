import { useLingui } from "@lingui/react/macro";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@sairn/ui";
import type { ReactNode } from "react";
import { MOBILE_ACCOUNT_SUBROW_CLASS } from "@/components/trade/mobile/mobile-account-subrow";
import { cn } from "@/lib/cn";

export type TwapSubview = "current" | "history" | "fills";

function isTwapSubview(value: unknown): value is TwapSubview {
	return value === "current" || value === "history" || value === "fills";
}

interface Props {
	children?: ReactNode;
	className?: string;
	mobile?: boolean;
	onValueChange: (value: TwapSubview) => void;
	value: TwapSubview;
}

export function TwapSubviewTabs({ children, className, mobile = false, onValueChange, value }: Props) {
	const { t } = useLingui();
	const tabs: ReadonlyArray<{ label: string; value: TwapSubview }> = [
		{ label: t`Current`, value: "current" },
		{ label: t`History`, value: "history" },
		{ label: t`Fill History`, value: "fills" },
	];

	function handleValueChange(nextValue: unknown) {
		if (isTwapSubview(nextValue)) onValueChange(nextValue);
	}

	return (
		<Tabs value={value} onValueChange={handleValueChange} className={cn("flex min-h-0 flex-col", className)}>
			<TabsList
				activateOnFocus
				hideIndicator
				aria-label={t`TWAP activity`}
				className={
					mobile
						? cn(MOBILE_ACCOUNT_SUBROW_CLASS, "items-stretch")
						: "flex h-10 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-market-close-stroke-card px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				}
			>
				{tabs.map((tab) => (
					<TabsTrigger
						key={tab.value}
						value={tab.value}
						className={cn(
							"relative inline-flex h-full min-h-0 shrink-0 items-center justify-center px-3 py-0 text-xs font-medium text-market-close-muted transition-colors duration-[120ms] after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-transparent after:content-[''] hover:text-market-close-fg active:text-market-close-fg focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-focus data-active:text-market-close-fg data-active:after:bg-market-close-control",
							mobile &&
								"h-full min-h-0 px-2.5 after:inset-x-2.5 before:absolute before:top-1/2 before:left-0 before:h-11 before:w-full before:-translate-y-1/2 before:content-['']",
						)}
					>
						{tab.label}
					</TabsTrigger>
				))}
			</TabsList>
			{children}
		</Tabs>
	);
}

interface PanelProps {
	children: ReactNode;
	className?: string;
	value: TwapSubview;
}

export function TwapSubviewPanel({ children, className, value }: PanelProps) {
	return (
		<TabsContent value={value} className={cn("flex min-h-0 flex-1 flex-col pt-0", className)}>
			{children}
		</TabsContent>
	);
}
