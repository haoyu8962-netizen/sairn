import { useQuery } from "@tanstack/react-query";
import { getGeo } from "@/lib/geo/get-geo";
import { deriveTradingRegionVerdict, getGeoDevOverride, getGeoQueryKey } from "@/lib/geo/trading-region";

export function useGeoRestriction() {
	const override = getGeoDevOverride();
	const { data, isError, isFetching, refetch } = useQuery({
		queryKey: getGeoQueryKey(override),
		queryFn: () => getGeo({ data: { override } }),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		retry: 1,
	});
	const { actionsBlocked, tradeRestricted, isResolved } = deriveTradingRegionVerdict(data, isError);

	return {
		actionsBlocked,
		tradeRestricted,
		country: data?.country ?? null,
		proxy: data?.proxy ?? false,
		isResolving: isFetching,
		isError,
		isResolved,
		retry: refetch,
	};
}
