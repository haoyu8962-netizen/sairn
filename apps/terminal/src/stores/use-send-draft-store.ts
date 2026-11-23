import { create } from "zustand";

export interface SendDraft {
	ownerKey: string;
	destination: string;
	amount: string;
	token: string;
	accountType: "perp" | "spot";
}

interface SendDraftStore {
	/** One retry draft per `network:owner` key, so a result of one account never replaces another account's draft. */
	drafts: Readonly<Record<string, SendDraft>>;
}

const useSendDraftStore = create<SendDraftStore>(() => ({ drafts: {} }));

export function getSendDraft(ownerKey: string): SendDraft | null {
	const draft = useSendDraftStore.getState().drafts[ownerKey];
	return draft?.ownerKey === ownerKey ? draft : null;
}

/** Saves the draft under its own `ownerKey`; drafts of other accounts are kept. */
export function saveSendDraft(draft: SendDraft): void {
	useSendDraftStore.setState((state) => ({ drafts: { ...state.drafts, [draft.ownerKey]: draft } }));
}

/** Clears the draft of `ownerKey` only: a late result of one account never drops another account's retry draft. */
export function clearSendDraft(ownerKey: string): void {
	useSendDraftStore.setState((state) => {
		if (!Object.hasOwn(state.drafts, ownerKey)) return state;
		const { [ownerKey]: _cleared, ...drafts } = state.drafts;
		return { drafts };
	});
}

/** @internal — tests start each case without a draft left by the previous one. */
export function resetSendDraft(): void {
	useSendDraftStore.setState({ drafts: {} });
}
