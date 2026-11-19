/** A protocol decimal such as `-0.0100` is data, written as sent; a spreadsheet reads it as a number. */
const PLAIN_NUMBER = /^[-+]?\d+(?:\.\d+)?$/;
/** A spot market's protocol name (`@107`) names no function or cell, so it is written as sent (ADR 0048). */
const SPOT_MARKET_INDEX = /^@(?:0|[1-9]\d*)$/;
/** OWASP CSV Injection: a text cell starting with these, full-width forms included, is read as a formula. */
const FORMULA_TRIGGER = /^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/;

function escapeCsvCell(value: string): string {
	const isFormulaText = FORMULA_TRIGGER.test(value) && !PLAIN_NUMBER.test(value) && !SPOT_MARKET_INDEX.test(value);
	const safeValue = isFormulaText ? `'${value}` : value;
	if (!/[",\r\n]/.test(safeValue)) return safeValue;
	return `"${safeValue.replaceAll('"', '""')}"`;
}

export function serializeCsv(rows: readonly (readonly string[])[]): string {
	return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

interface CsvColumn<T> {
	header: string;
	getValue: (row: T) => string;
}

export function buildCsvRows<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string[][] {
	return [columns.map((column) => column.header), ...rows.map((row) => columns.map((column) => column.getValue(row)))];
}

export function downloadCsv(filename: string, rows: readonly (readonly string[])[]): void {
	const blob = new Blob(["\uFEFF", serializeCsv(rows)], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
