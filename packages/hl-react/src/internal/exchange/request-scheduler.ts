import type { ExchangeClient } from "@nktkas/hyperliquid";
import type { SessionMode } from "../../signing/agent-session";
import type { HyperliquidEnv } from "../../signing/types";
import type { ExchangeMethod } from "../../types/clients";
import { getReceiptAgeMs } from "../websocket/staleness";

export type ExchangeRequestPriority = "normal" | "urgent";

/**
 * Which key signs the request. An external-wallet session signs user actions with the owner
 * wallet and trading actions with its Agent; each signer keeps its own generation slot so a
 * user-signed request can never invalidate a queued Agent-signed one, or the reverse.
 */
export type ExchangeRequestSigner = "user" | "agent";

export interface ExchangeRequestGeneration {
	readonly env: HyperliquidEnv;
	readonly clientKey: string;
	readonly sessionMode: SessionMode;
	readonly signer: ExchangeRequestSigner;
	readonly registrationEpoch?: string;
	readonly agentPublicKey?: string;
	readonly activeOwnerActivationEpoch?: string;
	readonly lifecycle?: ExchangeProviderLifecycleLease;
	readonly generation: symbol;
}

export interface ExchangeProviderLifecycleLease {
	readonly id: symbol;
	active: boolean;
}

export interface ExchangeRequestGenerationProof {
	signer?: ExchangeRequestSigner;
	registrationEpoch?: string;
	agentPublicKey?: string;
	activeOwnerActivationEpoch?: string;
	lifecycle?: ExchangeProviderLifecycleLease;
}

export type ExchangeRequestStartResult = { status: "started"; execution: Promise<unknown> } | { status: "invalidated" };

/** `signal` aborts when the request is rejected before it started (deadline, identity change). */
export type ExchangeRequestStartGate = (
	start: () => ExchangeRequestStartResult,
	signal: AbortSignal,
) => Promise<ExchangeRequestStartResult>;

interface ExchangeSigningSlotEntry {
	queuedAt: number;
	queuedAtMonotonic: number;
	deadlineMs?: number;
	readonly generation?: ExchangeRequestGeneration;
}

/**
 * The action a client is executing. Its wallet checks the deadline (ADR 0053) and the session generation
 * before every signature, and its transport checks that the session was not replaced before sending (ADR 0058).
 */
export interface ExchangeSigningDeadlineSlot {
	current?: ExchangeSigningSlotEntry;
}

type QueueEntry<T> = {
	run: () => Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
	generation?: ExchangeRequestGeneration;
	startGate?: ExchangeRequestStartGate;
	started: boolean;
	settled: boolean;
	queuedAt: number;
	queuedAtMonotonic: number;
	deadlineMs?: number;
	deadlineTimer?: ReturnType<typeof setTimeout>;
	controller: AbortController;
};

const identityGenerations = new Map<string, ExchangeRequestGeneration>();
const activeSchedulers = new Set<ExchangeRequestScheduler>();

/**
 * Why a generation stopped being current (ADR 0058). `unresolved`: the session became unknown (a reconnect,
 * the wallet directory initialising) and may come back as the same identity. `replaced`: another identity,
 * network or session mode took over, the provider ended, or the signer itself changed. A request that already
 * has its signature is sent unless its generation was replaced.
 */
export type ExchangeIdentityRetirement = "unresolved" | "replaced";

const retiredGenerations = new WeakMap<ExchangeRequestGeneration, ExchangeIdentityRetirement>();
const unresolvedGenerations = new Map<string, Set<ExchangeRequestGeneration>>();

function getOwnerKey(env: HyperliquidEnv, clientKey: string): string {
	return `${env}:${clientKey.toLowerCase()}`;
}

function retireGeneration(generation: ExchangeRequestGeneration, reason: ExchangeIdentityRetirement): void {
	if (retiredGenerations.get(generation) === "replaced") return;
	retiredGenerations.set(generation, reason);
	if (reason !== "unresolved") return;
	const ownerKey = getOwnerKey(generation.env, generation.clientKey);
	const pending = unresolvedGenerations.get(ownerKey) ?? new Set<ExchangeRequestGeneration>();
	pending.add(generation);
	unresolvedGenerations.set(ownerKey, pending);
}

/**
 * Upgrades the unresolved generations of one owner that match `matches` to `replaced`, and forgets them.
 * Unresolved generations that come back as the same identity with the same proof stay in the set until their
 * owner is replaced; that is one small entry per reconnect.
 */
function replaceUnresolvedGenerations(
	env: HyperliquidEnv,
	clientKey: string,
	matches: (generation: ExchangeRequestGeneration) => boolean,
): void {
	const ownerKey = getOwnerKey(env, clientKey);
	const pending = unresolvedGenerations.get(ownerKey);
	if (!pending) return;
	for (const generation of pending) {
		if (!matches(generation)) continue;
		retiredGenerations.set(generation, "replaced");
		pending.delete(generation);
	}
	if (pending.size === 0) unresolvedGenerations.delete(ownerKey);
}

function isGenerationSuperseded(generation: ExchangeRequestGeneration | undefined): boolean {
	if (!generation) return false;
	return generation.lifecycle?.active === false || retiredGenerations.get(generation) === "replaced";
}

function getIdentityKey(
	env: HyperliquidEnv,
	clientKey: string,
	sessionMode: SessionMode,
	signer: ExchangeRequestSigner,
): string {
	return `${env}:${clientKey.toLowerCase()}:${sessionMode}:${signer}`;
}

function isGenerationCurrent(generation: ExchangeRequestGeneration | undefined): boolean {
	if (!generation) return true;
	return (
		generation.lifecycle?.active !== false &&
		identityGenerations.get(
			getIdentityKey(generation.env, generation.clientKey, generation.sessionMode, generation.signer),
		) === generation
	);
}

function hasSameGenerationProof(generation: ExchangeRequestGeneration, proof: ExchangeRequestGenerationProof): boolean {
	return (
		generation.registrationEpoch === proof.registrationEpoch &&
		generation.agentPublicKey === proof.agentPublicKey?.toLowerCase() &&
		generation.activeOwnerActivationEpoch === proof.activeOwnerActivationEpoch &&
		generation.lifecycle === proof.lifecycle
	);
}

function invalidateStaleSchedulerEntries(): void {
	for (const scheduler of activeSchedulers) scheduler.invalidateStaleRequests();
}

/**
 * Where a request was dropped. `before-start`: it never reached the SDK. `before-signature`: the SDK was
 * running, but the wallet was never asked to sign. `after-signature`: a signature may exist, but the request
 * was stopped before the HTTP request. None of them reached the exchange; the error is never thrown after the
 * transport was called (ADR 0058).
 */
export type ExchangeRequestInvalidationPhase = "before-start" | "before-signature" | "after-signature";

export class ExchangeRequestInvalidatedError extends Error {
	readonly phase: ExchangeRequestInvalidationPhase;

	constructor(phase: ExchangeRequestInvalidationPhase = "before-start", options?: ErrorOptions) {
		super("Exchange request was cancelled because the active signing identity changed.", options);
		this.name = "ExchangeRequestInvalidatedError";
		this.phase = phase;
	}
}

/** ADR 0053: the longest an action may wait between enqueue and its signature, as long as ADR 0045's window. */
export const EXCHANGE_ACTION_START_DEADLINE_MS = 15_000;

export class ExchangeActionDeadlineError extends Error {
	constructor() {
		super("Exchange request expired before signing.");
		this.name = "ExchangeActionDeadlineError";
	}
}

/**
 * Order cancels only reduce exposure, so they keep their place however long the queue was busy (ADR 0053).
 * A TWAP termination is bounded like every other action: as on the official terminal, it is sent at once
 * or reported as not sent, and the user terminates again (ADR 0053, 2026-11-19 addendum).
 */
export function getExchangeStartDeadlineMs(method: ExchangeMethod): number | undefined {
	return method === "cancel" || method === "cancelByCloid" ? undefined : EXCHANGE_ACTION_START_DEADLINE_MS;
}

function hasPassedDeadline(entry: ExchangeSigningSlotEntry): boolean {
	return entry.deadlineMs !== undefined && getReceiptAgeMs(entry.queuedAt, entry.queuedAtMonotonic) >= entry.deadlineMs;
}

/** A deadline that starts now, for a flow that signs outside the scheduler (builder fee, Agent approval). */
export function startExchangeActionDeadline(): ExchangeSigningDeadlineSlot {
	return {
		current: {
			queuedAt: Date.now(),
			queuedAtMonotonic: performance.now(),
			deadlineMs: EXCHANGE_ACTION_START_DEADLINE_MS,
		},
	};
}

export function hasExchangeActionDeadlinePassed(slot: ExchangeSigningDeadlineSlot): boolean {
	return !!slot.current && hasPassedDeadline(slot.current);
}

export function assertExchangeSigningDeadline(slot: ExchangeSigningDeadlineSlot): void {
	if (hasExchangeActionDeadlinePassed(slot)) throw new ExchangeActionDeadlineError();
}

/**
 * Before a user-signed request asks its wallet to sign: the session it was queued for must still be current.
 * Agent signatures need no prompt and are held only by the send check below, so an order or a cancel is not
 * dropped by a reconnect that settles back on the same owner.
 */
export function assertExchangeSlotReadyToSign(slot: ExchangeSigningDeadlineSlot): void {
	const generation = slot.current?.generation;
	if (generation?.signer !== "agent" && !isGenerationCurrent(generation)) {
		throw new ExchangeRequestInvalidatedError("before-signature");
	}
}

/**
 * Before a signed request is sent: it is dropped only when its session was replaced. A session that is still
 * unresolved, or came back as the same identity, sends what its own signer approved (ADR 0058).
 */
export function assertExchangeSlotReadyToSend(slot: ExchangeSigningDeadlineSlot): void {
	if (isGenerationSuperseded(slot.current?.generation)) throw new ExchangeRequestInvalidatedError("after-signature");
}

/** The SDK wraps a wallet error in `AbstractWalletError`; a signer guard error is surfaced as itself. */
export function unwrapExchangeSignerGuardError(error: unknown): never {
	throw error instanceof Error &&
		(error.cause instanceof ExchangeActionDeadlineError || error.cause instanceof ExchangeRequestInvalidatedError)
		? error.cause
		: error;
}

const signingDeadlineSlots = new WeakMap<ExchangeClient, ExchangeSigningDeadlineSlot>();

export function registerExchangeSigningDeadline(client: ExchangeClient, slot: ExchangeSigningDeadlineSlot): void {
	signingDeadlineSlots.set(client, slot);
}

export class ExchangeRequestScheduler {
	private readonly urgentQueue: QueueEntry<unknown>[] = [];
	private readonly normalQueue: QueueEntry<unknown>[] = [];
	private current: QueueEntry<unknown> | null = null;
	private running = false;

	constructor(private readonly slot: ExchangeSigningDeadlineSlot = {}) {}

	schedule<T>(
		priority: ExchangeRequestPriority,
		run: () => Promise<T>,
		generation?: ExchangeRequestGeneration,
		startGate?: ExchangeRequestStartGate,
		deadlineMs?: number,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const entry = {
				run,
				resolve,
				reject,
				generation,
				startGate,
				started: false,
				settled: false,
				queuedAt: Date.now(),
				queuedAtMonotonic: performance.now(),
				deadlineMs,
				controller: new AbortController(),
			} as QueueEntry<unknown>;
			if (!isGenerationCurrent(generation)) {
				this.rejectEntry(entry, new ExchangeRequestInvalidatedError());
				return;
			}
			if (deadlineMs !== undefined) {
				entry.deadlineTimer = setTimeout(() => {
					if (entry.started) return;
					this.rejectEntry(entry, new ExchangeActionDeadlineError());
					this.finishEntry(entry);
				}, deadlineMs);
			}
			if (priority === "urgent") this.urgentQueue.push(entry);
			else this.normalQueue.push(entry);
			activeSchedulers.add(this);
			this.drain();
		});
	}

	invalidateStaleRequests(): void {
		this.rejectQueuedEntries(this.urgentQueue, (entry) => !isGenerationCurrent(entry.generation));
		this.rejectQueuedEntries(this.normalQueue, (entry) => !isGenerationCurrent(entry.generation));
		if (this.current && !this.current.started && !isGenerationCurrent(this.current.generation)) {
			this.rejectEntry(this.current, new ExchangeRequestInvalidatedError());
		}
		this.releaseIfIdle();
	}

	invalidatePendingRequests(): void {
		this.rejectQueuedEntries(this.urgentQueue, () => true);
		this.rejectQueuedEntries(this.normalQueue, () => true);
		if (this.current && !this.current.started) {
			this.rejectEntry(this.current, new ExchangeRequestInvalidatedError());
		}
		this.releaseIfIdle();
	}

	private rejectQueuedEntries(
		queue: QueueEntry<unknown>[],
		shouldReject: (entry: QueueEntry<unknown>) => boolean,
	): void {
		for (let index = queue.length - 1; index >= 0; index--) {
			const entry = queue[index];
			if (!entry || !shouldReject(entry)) continue;
			queue.splice(index, 1);
			this.rejectEntry(entry, new ExchangeRequestInvalidatedError());
		}
	}

	private rejectEntry(entry: QueueEntry<unknown>, reason: unknown): void {
		if (entry.settled) return;
		entry.settled = true;
		clearTimeout(entry.deadlineTimer);
		entry.controller.abort();
		entry.reject(reason);
	}

	private resolveEntry(entry: QueueEntry<unknown>, value: unknown): void {
		if (entry.settled) return;
		entry.settled = true;
		clearTimeout(entry.deadlineTimer);
		entry.resolve(value);
	}

	private finishEntry(entry: QueueEntry<unknown>): void {
		if (this.current !== entry) return;
		this.current = null;
		this.running = false;
		this.drain();
	}

	private releaseIfIdle(): void {
		if (!this.running && this.urgentQueue.length === 0 && this.normalQueue.length === 0) {
			activeSchedulers.delete(this);
		}
	}

	private drain(): void {
		if (this.running) return;
		const entry = this.urgentQueue.shift() ?? this.normalQueue.shift();
		if (!entry) {
			this.releaseIfIdle();
			return;
		}

		this.running = true;
		this.current = entry;
		let startedExecution: Promise<unknown> | undefined;
		void Promise.resolve()
			.then(async () => {
				if (entry.settled) return;
				try {
					const start = (): ExchangeRequestStartResult => {
						if (entry.settled || !isGenerationCurrent(entry.generation)) {
							return { status: "invalidated" };
						}
						if (hasPassedDeadline(entry)) {
							this.rejectEntry(entry, new ExchangeActionDeadlineError());
							return { status: "invalidated" };
						}
						entry.started = true;
						clearTimeout(entry.deadlineTimer);
						this.slot.current = entry;
						let execution: Promise<unknown>;
						try {
							execution = Promise.resolve(entry.run());
						} catch (error) {
							execution = Promise.reject(error);
						}
						startedExecution = execution;
						return { status: "started", execution };
					};
					const result = entry.startGate ? await entry.startGate(start, entry.controller.signal) : start();
					if (result.status === "invalidated") {
						this.rejectEntry(entry, new ExchangeRequestInvalidatedError());
						return;
					}
					this.resolveEntry(entry, await result.execution);
				} catch (error) {
					this.rejectEntry(entry, error);
				}
				if (startedExecution) await startedExecution.catch(() => undefined);
			})
			.finally(() => {
				if (this.slot.current === entry) this.slot.current = undefined;
				this.finishEntry(entry);
			});
	}
}

const schedulers = new WeakMap<ExchangeClient, ExchangeRequestScheduler>();

export function captureExchangeRequestGeneration(
	env: HyperliquidEnv,
	clientKey: string,
	sessionMode: SessionMode,
	proof: ExchangeRequestGenerationProof = {},
): ExchangeRequestGeneration {
	const signer = proof.signer ?? "user";
	const identityKey = getIdentityKey(env, clientKey, sessionMode, signer);
	const current = identityGenerations.get(identityKey);
	if (current && hasSameGenerationProof(current, proof)) return current;

	const generation = {
		env,
		clientKey: clientKey.toLowerCase(),
		sessionMode,
		signer,
		registrationEpoch: proof.registrationEpoch,
		agentPublicKey: proof.agentPublicKey?.toLowerCase(),
		activeOwnerActivationEpoch: proof.activeOwnerActivationEpoch,
		lifecycle: proof.lifecycle,
		generation: Symbol(identityKey),
	} satisfies ExchangeRequestGeneration;
	identityGenerations.set(identityKey, generation);
	replaceUnresolvedGenerations(
		env,
		clientKey,
		(pending) =>
			pending.sessionMode === sessionMode && pending.signer === signer && !hasSameGenerationProof(pending, proof),
	);
	if (current) {
		retireGeneration(current, "replaced");
		invalidateStaleSchedulerEntries();
	}
	return generation;
}

/**
 * Retires the generations of one owner. Without `signer` every signer of that owner is retired
 * (the session itself ended); with `"agent"` only Agent-signed requests are retired, which is what
 * an Agent key replacement or removal means for a wallet session whose owner keeps signing. A `replaced`
 * retirement also upgrades the matching generations that an earlier reconnect left unresolved.
 */
export function invalidateExchangeRequestIdentity(
	env: HyperliquidEnv,
	clientKey: string,
	sessionMode?: SessionMode,
	signer?: ExchangeRequestSigner,
	reason: ExchangeIdentityRetirement = "replaced",
): void {
	const normalizedClientKey = clientKey.toLowerCase();
	for (const [identityKey, generation] of identityGenerations) {
		if (
			generation.env === env &&
			generation.clientKey === normalizedClientKey &&
			(sessionMode === undefined || generation.sessionMode === sessionMode) &&
			(signer === undefined || generation.signer === signer)
		) {
			identityGenerations.delete(identityKey);
			retireGeneration(generation, reason);
		}
	}
	if (reason === "replaced") {
		replaceUnresolvedGenerations(
			env,
			clientKey,
			(generation) =>
				(sessionMode === undefined || generation.sessionMode === sessionMode) &&
				(signer === undefined || generation.signer === signer),
		);
	}
	invalidateStaleSchedulerEntries();
}

/**
 * The session that became unresolved settled on another identity, or was ended on purpose (logout): requests
 * of that owner that already hold a signature are no longer sent.
 */
export function markExchangeIdentityReplaced(env: HyperliquidEnv, clientKey: string): void {
	const ownerKey = getOwnerKey(env, clientKey);
	const pending = unresolvedGenerations.get(ownerKey);
	unresolvedGenerations.delete(ownerKey);
	for (const generation of pending ?? []) retiredGenerations.set(generation, "replaced");
	invalidateExchangeRequestIdentity(env, clientKey);
}

export function invalidateAllExchangeRequestIdentities(): void {
	for (const generation of identityGenerations.values()) retireGeneration(generation, "replaced");
	for (const pending of unresolvedGenerations.values()) {
		for (const generation of pending) retiredGenerations.set(generation, "replaced");
	}
	unresolvedGenerations.clear();
	identityGenerations.clear();
	invalidateStaleSchedulerEntries();
}

export function invalidateExchangeProviderLifecycle(lifecycle: ExchangeProviderLifecycleLease): void {
	for (const [identityKey, generation] of identityGenerations) {
		if (generation.lifecycle !== lifecycle) continue;
		identityGenerations.delete(identityKey);
		retireGeneration(generation, "replaced");
	}
	invalidateStaleSchedulerEntries();
}

export function invalidateExchangeClientRequests(client: ExchangeClient): void {
	schedulers.get(client)?.invalidatePendingRequests();
}

function containsOnlyReduceOnlyOrders(params: unknown, field: "modifies" | "orders"): boolean {
	if (!params || typeof params !== "object") return false;
	const entries = (params as Record<string, unknown>)[field];
	if (!Array.isArray(entries) || entries.length === 0) return false;

	return entries.every((entry) => {
		if (!entry || typeof entry !== "object") return false;
		const order = field === "modifies" ? (entry as Record<string, unknown>).order : entry;
		return !!order && typeof order === "object" && (order as Record<string, unknown>).r === true;
	});
}

export function getExchangeRequestPriority(method: ExchangeMethod, params: unknown): ExchangeRequestPriority {
	if (method === "cancel" || method === "cancelByCloid" || method === "twapCancel") return "urgent";
	if (method === "order" && containsOnlyReduceOnlyOrders(params, "orders")) return "urgent";
	if (method === "batchModify" && containsOnlyReduceOnlyOrders(params, "modifies")) return "urgent";
	if (method === "twapOrder" && params && typeof params === "object") {
		const twap = (params as Record<string, unknown>).twap;
		if (twap && typeof twap === "object" && (twap as Record<string, unknown>).r === true) return "urgent";
	}
	return "normal";
}

export function scheduleExchangeRequest<T>(
	client: ExchangeClient,
	priority: ExchangeRequestPriority,
	run: () => Promise<T>,
	generation?: ExchangeRequestGeneration,
	startGate?: ExchangeRequestStartGate,
	deadlineMs?: number,
): Promise<T> {
	let scheduler = schedulers.get(client);
	if (!scheduler) {
		scheduler = new ExchangeRequestScheduler(signingDeadlineSlots.get(client));
		schedulers.set(client, scheduler);
	}
	return scheduler.schedule(priority, run, generation, startGate, deadlineMs);
}
