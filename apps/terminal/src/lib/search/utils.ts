const COMBINING_DIACRITICAL_MARKS = /[\u0300-\u036f]/g;
const UNDECOMPOSED_LETTERS = /[ıđ]/g;

function isAscii(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		if (value.charCodeAt(index) > 0x7f) return false;
	}
	return true;
}

// Case and accent folding for search matching only: a name or symbol and the typed query both pass through it, so
// "İNİT" finds INIT, "istanbul" finds "İstanbul" and "dong" finds "Đồng". `toLowerCase()` turns "İ" into "i" plus a
// combining dot, so the Combining Diacritical Marks block (U+0300–U+036F) is removed after decomposition. That block
// carries the accents of Latin, Greek and Cyrillic letters, so Russian "ё" and "й" also fold to "е" and "и". The
// dotless "ı" and the Vietnamese "đ" do not decompose and are folded to "i" and "d"; other such letters (ß, ø, æ, œ, ł)
// stay as they are. Marks outside the block (Japanese voicing marks, Devanagari vowel signs, Arabic harakat) change
// the word and are kept. ASCII text only needs lowercasing. Protocol comparisons (asset symbols, addresses, cloids)
// never use this.
export function foldSearchText(value: string): string {
	const lower = value.toLowerCase();
	if (isAscii(lower)) return lower;
	return lower
		.normalize("NFD")
		.replace(COMBINING_DIACRITICAL_MARKS, "")
		.normalize("NFC")
		.replace(UNDECOMPOSED_LETTERS, (letter) => (letter === "ı" ? "i" : "d"));
}

export function normalize(str: string): string {
	return foldSearchText(str).trim();
}

export function tokenize(str: string): string[] {
	const words: string[] = [];
	let start = -1;

	for (let i = 0; i <= str.length; i++) {
		const code = i < str.length ? str.charCodeAt(i) : 0;
		const isWordChar = (code >= 97 && code <= 122) || (code >= 48 && code <= 57); // a-z, 0-9

		if (isWordChar) {
			if (start === -1) start = i;
		} else if (start !== -1) {
			words.push(str.slice(start, i));
			start = -1;
		}
	}

	return words;
}

export function buildCharMask(str: string): number {
	let mask = 0;
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i);
		if (code >= 97 && code <= 122) {
			mask |= 1 << (code - 97);
		}
	}
	return mask;
}

export function canContain(fieldMask: number, queryMask: number): boolean {
	return (queryMask & fieldMask) === queryMask;
}

export function reverseString(str: string): string {
	let result = "";
	for (let i = str.length - 1; i >= 0; i--) {
		result += str[i];
	}
	return result;
}

const levenshteinPrev = new Uint8Array(64);
const levenshteinCurr = new Uint8Array(64);

export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;

	const diff = Math.abs(a.length - b.length);
	if (diff > 2) return 3;

	const aLen = a.length;
	const bLen = b.length;

	if (bLen >= levenshteinPrev.length) {
		return levenshteinFallback(a, b);
	}

	for (let j = 0; j <= bLen; j++) {
		levenshteinPrev[j] = j;
	}

	for (let i = 1; i <= aLen; i++) {
		levenshteinCurr[0] = i;
		const aChar = a.charCodeAt(i - 1);

		for (let j = 1; j <= bLen; j++) {
			const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
			levenshteinCurr[j] = Math.min(levenshteinPrev[j] + 1, levenshteinCurr[j - 1] + 1, levenshteinPrev[j - 1] + cost);
		}

		for (let j = 0; j <= bLen; j++) {
			levenshteinPrev[j] = levenshteinCurr[j];
		}
	}

	return levenshteinPrev[bLen];
}

function levenshteinFallback(a: string, b: string): number {
	const aLen = a.length;
	const bLen = b.length;
	const prev = new Uint8Array(bLen + 1);
	const curr = new Uint8Array(bLen + 1);

	for (let j = 0; j <= bLen; j++) {
		prev[j] = j;
	}

	for (let i = 1; i <= aLen; i++) {
		curr[0] = i;
		const aChar = a.charCodeAt(i - 1);

		for (let j = 1; j <= bLen; j++) {
			const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
			curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
		}

		for (let j = 0; j <= bLen; j++) {
			prev[j] = curr[j];
		}
	}

	return prev[bLen];
}

export function binarySearchLowerBound(arr: { normalized: string }[], query: string): number {
	let lo = 0;
	let hi = arr.length;

	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (arr[mid].normalized < query) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}

	return lo;
}
