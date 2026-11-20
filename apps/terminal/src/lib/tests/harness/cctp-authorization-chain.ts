import type { Address, Hash, Hex } from "viem";
import {
	concatHex,
	decodeFunctionData,
	encodeAbiParameters,
	encodeEventTopics,
	encodeFunctionData,
	encodeFunctionResult,
	numberToHex,
} from "viem";
import { expect } from "vitest";
import { CCTP_DEPOSIT_NETWORKS, CCTP_FAST_FINALITY_THRESHOLD } from "@/config/cctp-deposit";
import {
	addressToBytes32,
	CCTP_EXTENSION_ABI,
	encodeCctpForwardHookData,
	USDC_EIP3009_AUTHORIZATION_ABI,
} from "@/lib/trade/cctp-deposit";

/** An Arbitrum and Circle stand-in for external-wallet CCTP deposit tracking, shared by the tracking and dialog tests. */
export const OWNER = "0x1111111111111111111111111111111111111111";
export const SOURCE_HASH = `0x${"a".repeat(64)}` as Hash;
export const FORWARD_HASH = `0x${"b".repeat(64)}` as Hash;
export const AUTH_NONCE = `0x${"1".repeat(64)}` as Hash;
export const VALID_BEFORE = 1_800_000_000;
export const SOURCE_BLOCK = 400_000_000;

export function createBatchDepositLog({
	address = CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtension,
	amountRaw = 5_000_000n,
}: {
	address?: Address;
	amountRaw?: bigint;
} = {}) {
	return {
		address,
		data: encodeAbiParameters(
			[{ type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint32" }],
			[
				1n,
				amountRaw,
				OWNER,
				addressToBytes32(CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder),
				CCTP_DEPOSIT_NETWORKS.mainnet.destinationDomain,
			],
		),
		topics: encodeEventTopics({ abi: CCTP_EXTENSION_ABI, eventName: "BatchDepositForBurn" }),
	};
}

export function createSourceTransactionPayload(hookOwner: Address = OWNER) {
	return {
		jsonrpc: "2.0",
		id: 2,
		result: {
			hash: SOURCE_HASH,
			from: OWNER,
			to: CCTP_DEPOSIT_NETWORKS.mainnet.cctpExtension,
			input: encodeFunctionData({
				abi: CCTP_EXTENSION_ABI,
				functionName: "batchDepositForBurnWithAuth",
				args: [
					{
						amount: 5_000_000n,
						authValidAfter: 0n,
						authValidBefore: 1n,
						authNonce: `0x${"1".repeat(64)}`,
						v: 27,
						r: `0x${"2".repeat(64)}`,
						s: `0x${"3".repeat(64)}`,
					},
					{
						amount: 5_000_000n,
						destinationDomain: CCTP_DEPOSIT_NETWORKS.mainnet.destinationDomain,
						mintRecipient: addressToBytes32(CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder),
						destinationCaller: addressToBytes32(CCTP_DEPOSIT_NETWORKS.mainnet.cctpForwarder),
						maxFee: 200_000n,
						minFinalityThreshold: CCTP_FAST_FINALITY_THRESHOLD,
						hookData: encodeCctpForwardHookData(hookOwner),
					},
				],
			}),
		},
	};
}

export function createCircleCctpMessage({
	mode = "direct",
	owner = OWNER,
}: {
	mode?: "direct" | "sponsored";
	owner?: Address;
} = {}): Hex {
	const config = CCTP_DEPOSIT_NETWORKS.mainnet;
	const messageSender = mode === "sponsored" ? config.cctpExtensionV2 : config.cctpExtension;
	return concatHex([
		numberToHex(1, { size: 4 }),
		numberToHex(config.sourceDomain, { size: 4 }),
		numberToHex(config.destinationDomain, { size: 4 }),
		AUTH_NONCE,
		addressToBytes32(config.cctpExtension),
		addressToBytes32(config.cctpExtension),
		addressToBytes32(config.cctpForwarder),
		numberToHex(CCTP_FAST_FINALITY_THRESHOLD, { size: 4 }),
		numberToHex(CCTP_FAST_FINALITY_THRESHOLD, { size: 4 }),
		numberToHex(1, { size: 4 }),
		addressToBytes32(config.usdc),
		addressToBytes32(config.cctpForwarder),
		numberToHex(5_000_000, { size: 32 }),
		addressToBytes32(messageSender),
		numberToHex(200_000, { size: 32 }),
		numberToHex(200_000, { size: 32 }),
		numberToHex(1, { size: 32 }),
		encodeCctpForwardHookData(owner),
	]);
}

export function createAuthorizationChainFetch({
	authorizationUsed,
	blockTimestamp = VALID_BEFORE - 600,
	blockTimestampAt,
	consumer,
	consumerBlock = SOURCE_BLOCK + 10,
	consumerFrom = OWNER,
	latestBlock = SOURCE_BLOCK + 50,
	maxLogRange = 10_000,
}: {
	authorizationUsed: boolean;
	blockTimestamp?: number;
	blockTimestampAt?: (blockNumber: number) => number;
	consumer?: Hash;
	consumerBlock?: number;
	consumerFrom?: Address;
	latestBlock?: number;
	maxLogRange?: number;
}) {
	const circleHashes: string[] = [];
	const logFilters: Record<string, unknown>[] = [];
	const methods: string[] = [];
	const config = CCTP_DEPOSIT_NETWORKS.mainnet;
	const timestampAt = blockTimestampAt ?? (() => blockTimestamp);
	async function handle(input: RequestInfo | URL, init?: RequestInit) {
		const url = String(input);
		if (!url.includes("arb1.arbitrum.io")) {
			const hash = new URL(url).searchParams.get("transactionHash") ?? "";
			circleHashes.push(hash);
			return new Response(
				JSON.stringify({
					sourceTxHash: hash,
					messages: [{ message: createCircleCctpMessage(), status: "complete", forwardTxHash: FORWARD_HASH }],
				}),
				{ status: 200 },
			);
		}
		const request = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
		methods.push(request.method);
		const reply = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
		const replyError = (code: number, message: string) =>
			new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code, message } }));
		const [first] = request.params;
		switch (request.method) {
			case "eth_getTransactionReceipt":
				return reply(
					first === consumer ? { transactionHash: consumer, status: "0x1", logs: [createBatchDepositLog()] } : null,
				);
			case "eth_getTransactionByHash": {
				const transaction = createSourceTransactionPayload();
				return reply({ ...transaction.result, hash: first, from: consumerFrom });
			}
			case "eth_getBlockByNumber": {
				const blockNumber = first === "latest" ? latestBlock : Number(BigInt(first as string));
				if (blockNumber > latestBlock) return reply(null);
				return reply({ number: numberToHex(blockNumber), timestamp: numberToHex(timestampAt(blockNumber)) });
			}
			case "eth_call": {
				const call = first as { to: string; data: Hex };
				const decoded = decodeFunctionData({ abi: USDC_EIP3009_AUTHORIZATION_ABI, data: call.data });
				expect(call.to).toBe(config.usdc);
				expect(decoded.args).toEqual([OWNER, AUTH_NONCE]);
				expect(request.params[1]).toBe(numberToHex(latestBlock));
				return reply(
					encodeFunctionResult({
						abi: USDC_EIP3009_AUTHORIZATION_ABI,
						functionName: "authorizationState",
						result: authorizationUsed,
					}),
				);
			}
			case "eth_getLogs": {
				const filter = first as { fromBlock: Hex; toBlock: Hex };
				logFilters.push(first as Record<string, unknown>);
				const fromBlock = Number(BigInt(filter.fromBlock));
				const toBlock = Number(BigInt(filter.toBlock));
				if (fromBlock > toBlock) return replyError(-32602, "invalid block range params");
				if (toBlock > latestBlock) return replyError(-32000, "block range extends beyond current head block");
				if (toBlock - fromBlock + 1 > maxLogRange) return replyError(-32005, "query exceeds max block range");
				return reply(
					consumer && consumerBlock >= fromBlock && consumerBlock <= toBlock
						? [
								{
									address: config.usdc,
									topics: encodeEventTopics({
										abi: USDC_EIP3009_AUTHORIZATION_ABI,
										eventName: "AuthorizationUsed",
										args: { authorizer: OWNER, nonce: AUTH_NONCE },
									}),
									data: "0x",
									blockNumber: numberToHex(consumerBlock),
									transactionHash: consumer,
									removed: false,
								},
							]
						: [],
				);
			}
			default:
				throw new Error(`Unexpected Arbitrum method ${request.method}`);
		}
	}
	return { circleHashes, fetch: handle, logFilters, methods };
}
