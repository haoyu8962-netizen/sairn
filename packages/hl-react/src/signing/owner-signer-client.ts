import type { ExchangeClient, IRequestTransport } from "@nktkas/hyperliquid";
import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import { createExchangeClient, getHttpTransport } from "../clients";
import {
	ExchangeRequestInvalidatedError,
	type ExchangeRequestInvalidationPhase,
} from "../internal/exchange/request-scheduler";
import { assertTypedDataSignedBy } from "../wallet";
import type { HyperliquidOwnerSigner } from "./owner-signer-provider";

const ownerClients = new WeakMap<HyperliquidOwnerSigner, Map<boolean, ExchangeClient>>();

export function getOwnerSignerClient(owner: HyperliquidOwnerSigner, isTestnet: boolean): ExchangeClient | null {
	const cached = ownerClients.get(owner)?.get(isTestnet);
	if (cached) return cached;
	const client = createOwnerSignerClient(owner, isTestnet);
	if (!client) return null;
	const clients = ownerClients.get(owner) ?? new Map<boolean, ExchangeClient>();
	clients.set(isTestnet, client);
	ownerClients.set(owner, clients);
	return client;
}

export function createOwnerSignerClient(
	owner: HyperliquidOwnerSigner,
	isTestnet: boolean,
	baseTransport = getHttpTransport(isTestnet),
) {
	const wallet = owner.wallet;
	const address = owner.ownerAddress;
	if (!wallet || !address) return null;
	const signingWallet = wallet;
	const signingAddress = address;

	function toInvalidated(error: unknown, phase: ExchangeRequestInvalidationPhase): ExchangeRequestInvalidatedError {
		if (error instanceof ExchangeRequestInvalidatedError && error.phase === phase) return error;
		return new ExchangeRequestInvalidatedError(phase, { cause: error });
	}

	function assertOwnerCurrent(phase: ExchangeRequestInvalidationPhase) {
		try {
			owner.assertCurrent();
		} catch (error) {
			throw toInvalidated(error, phase);
		}
	}

	/**
	 * The embedded signer checks its own session around the silent signature and throws a plain error when the
	 * binding changed meanwhile. That signature is dropped and never sent, so it is reported as "not sent".
	 */
	function assertOwnerCurrentAfterSignerFailure(signerError: unknown) {
		try {
			owner.assertCurrent();
		} catch {
			throw toInvalidated(signerError, "after-signature");
		}
	}

	async function verifyOwner(phase: ExchangeRequestInvalidationPhase) {
		assertOwnerCurrent(phase);
		let addresses: readonly string[];
		try {
			addresses = await signingWallet.getAddresses();
		} catch (error) {
			throw toInvalidated(error, phase);
		}
		assertOwnerCurrent(phase);
		if (addresses.length !== 1 || addresses[0]?.toLowerCase() !== signingAddress.toLowerCase()) {
			throw new ExchangeRequestInvalidatedError(phase);
		}
	}

	const guardedWallet: AbstractViemJsonRpcAccount = {
		async getAddresses() {
			await verifyOwner("before-signature");
			return [address];
		},
		async getChainId() {
			await verifyOwner("before-signature");
			const chainId = await wallet.getChainId();
			assertOwnerCurrent("before-signature");
			return chainId;
		},
		async signTypedData(typedData) {
			await verifyOwner("before-signature");
			let signature: `0x${string}`;
			try {
				signature = await wallet.signTypedData(typedData);
			} catch (error) {
				assertOwnerCurrentAfterSignerFailure(error);
				throw error;
			}
			await assertTypedDataSignedBy(typedData, signature, signingAddress);
			await verifyOwner("after-signature");
			return signature;
		},
	};
	const transport: IRequestTransport = {
		isTestnet: baseTransport.isTestnet,
		async request<T>(endpoint: "info" | "exchange", payload: unknown, signal?: AbortSignal): Promise<T> {
			await verifyOwner("after-signature");
			assertOwnerCurrent("after-signature");
			return baseTransport.request<T>(endpoint, payload, signal);
		},
	};
	return createExchangeClient(guardedWallet, isTestnet, undefined, transport);
}
