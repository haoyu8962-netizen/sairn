import type { ReactNode } from "react";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { PassiveDataPlaceholder } from "./passive-data-placeholder";

interface Props {
	children: ReactNode;
	variant?: "error";
}

export function Placeholder({ children, variant }: Props) {
	return (
		<div
			className={cn(
				"h-full w-full flex flex-col items-center justify-center px-2 py-6 text-xs",
				variant === "error" ? "text-error" : "text-fg-muted",
			)}
		>
			{children}
		</div>
	);
}

interface ConnectPlaceholderProps {
	children: ReactNode;
}

export function ConnectPlaceholder({ children }: ConnectPlaceholderProps) {
	const { isResolving } = useWalletSession();
	if (isResolving) return <PassiveDataPlaceholder busy />;
	return <Placeholder>{children}</Placeholder>;
}
