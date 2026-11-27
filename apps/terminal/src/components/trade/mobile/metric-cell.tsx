import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
	className?: string;
	label: ReactNode;
	value: ReactNode;
	valueClass?: string;
}

export function MetricCell({ className, label, value, valueClass }: Props) {
	return (
		<div className={cn("min-w-0 px-2.5 py-1.5", className)}>
			<div className="break-words text-xs text-fg-muted">{label}</div>
			<div className={cn("break-words text-xs font-medium tabular-nums [overflow-wrap:anywhere]", valueClass)}>
				{value}
			</div>
		</div>
	);
}
