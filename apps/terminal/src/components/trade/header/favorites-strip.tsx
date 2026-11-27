import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import { MARKET_HEADER_LABELS } from "@/config/market-header";
import { getMarketSelectorChange } from "@/domain/market/selector-quote";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useNumberFormat } from "@/lib/format";
import { useMarketsInfo, useSelectedMarketInfo } from "@/lib/hyperliquid";
import { useFavoriteMarkets, useMarketActions, useSelectedMarket } from "@/stores/use-market-store";
import { FavoritesStripView } from "./favorites-strip-view";

function getChangeTone(direction: -1 | 0 | 1 | undefined): "up" | "down" | "flat" | undefined {
	if (direction === undefined) return undefined;
	if (direction < 0) return "down";
	if (direction > 0) return "up";
	return "flat";
}

export function useFavoritesStripProps() {
	const { t } = useLingui();
	const { formatPercent } = useNumberFormat();
	const favorites = useFavoriteMarkets();
	const { data: selectedMarket } = useSelectedMarketInfo();
	const selectedMarketName = useSelectedMarket();
	const { toggleFavoriteMarket } = useMarketActions();
	const { getMarketInfo } = useMarketsInfo();
	const navigateToMarket = useMarketNavigation();
	const stripRef = useRef<HTMLDivElement>(null);
	const itemButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
	const pendingFocusAfterRemoveRef = useRef<{ removedName: string; targetName: string | null } | null>(null);

	useEffect(() => {
		const pending = pendingFocusAfterRemoveRef.current;
		if (!pending) return;
		if (favorites.includes(pending.removedName)) return;
		pendingFocusAfterRemoveRef.current = null;

		if (pending.targetName) {
			const targetButton = itemButtonRefs.current.get(pending.targetName);
			if (targetButton) {
				targetButton.focus();
				return;
			}
		}

		const fallbackButton = favorites[0] ? itemButtonRefs.current.get(favorites[0]) : null;
		if (fallbackButton) {
			fallbackButton.focus();
			return;
		}

		stripRef.current?.focus();
	}, [favorites]);

	const items = favorites.map((name) => {
		const market = getMarketInfo(name);
		const change = market ? getMarketSelectorChange(market) : undefined;
		return {
			name,
			label: market?.pairName ?? name,
			active: name === (selectedMarket?.name ?? selectedMarketName),
			changeText: change ? formatPercent(change.ratio.toString()) : undefined,
			changeTone: getChangeTone(change?.amount.cmp(0)),
		};
	});
	function onSelect(name: string) {
		navigateToMarket(name, getMarketInfo(name));
	}
	function onRemove(name: string) {
		const index = favorites.indexOf(name);
		const nextName = index >= 0 ? (favorites[index + 1] ?? favorites[index - 1] ?? null) : null;
		pendingFocusAfterRemoveRef.current = {
			removedName: name,
			targetName: nextName,
		};
		toggleFavoriteMarket(name);
	}
	function setItemButtonRef(name: string, node: HTMLButtonElement | null) {
		if (node) {
			itemButtonRefs.current.set(name, node);
		} else {
			itemButtonRefs.current.delete(name);
		}
	}
	function selectLabel(name: string) {
		const displayName = getMarketInfo(name)?.pairName ?? name;
		return t`Select ${displayName} market`;
	}
	function removeLabel(name: string) {
		const displayName = getMarketInfo(name)?.pairName ?? name;
		return t`Remove ${displayName} from favorites`;
	}
	return {
		items,
		emptyLabel: t(MARKET_HEADER_LABELS.favoritesEmpty),
		onSelect,
		onRemove,
		selectLabel,
		removeLabel,
		stripRef,
		setItemButtonRef,
	};
}

export function FavoritesStrip() {
	return <FavoritesStripView {...useFavoritesStripProps()} />;
}
