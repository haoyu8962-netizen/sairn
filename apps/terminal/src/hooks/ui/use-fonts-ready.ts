import { useEffect, useState } from "react";
import { areFontsReady, waitForFonts } from "@/lib/fonts/font-readiness";

export function useFontsReady(specs: readonly string[], text?: string): boolean {
	const [ready, setReady] = useState(() => areFontsReady(specs, text));

	useEffect(() => {
		if (ready) return;
		let active = true;
		waitForFonts(specs, text).then(() => {
			if (active) setReady(true);
		});
		return () => {
			active = false;
		};
	}, [ready, specs, text]);

	return ready;
}
