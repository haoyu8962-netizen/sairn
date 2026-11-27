import { ModalHeader } from "@sairn/ui";
import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
}

export function PositionCloseDialogHeader({ children }: Props) {
	return (
		<ModalHeader
			divider={false}
			className="gap-1 ps-5 pe-14 pt-7 pb-0 text-start min-[1001px]:ps-6 min-[1001px]:pe-16 min-[1001px]:pt-6"
		>
			{children}
		</ModalHeader>
	);
}
