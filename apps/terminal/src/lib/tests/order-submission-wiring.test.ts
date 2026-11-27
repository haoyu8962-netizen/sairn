import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(import.meta.dirname, "../..");
const ORDER_ENTRY_SURFACES = [
	"components/trade/tradebox/trade-panel.tsx",
	"components/trade/mobile/mobile-trade-view.tsx",
];

describe("order submission wiring", () => {
	it("routes every production order action through the tracked submitter", () => {
		expect(findExchangeEntryPoints("order")).toEqual(["hooks/trade/use-tracked-order.ts"]);
	});

	it("routes TWAP placement and cancellation through their guarded hooks", () => {
		const sourceFiles = collectSourceFiles(SOURCE_ROOT).filter(
			(path) => /\.(ts|tsx)$/.test(path) && !path.includes("/lib/tests/"),
		);
		const placementMatches = sourceFiles
			.filter((path) => /useExchange\(\s*["']twapOrder["']\s*,/.test(readFileSync(path, "utf8")))
			.map((path) => path.replace(`${SOURCE_ROOT}/`, ""));
		const cancellationMatches = sourceFiles
			.filter((path) => /useExchange\(\s*["']twapCancel["']\s*[,)]/.test(readFileSync(path, "utf8")))
			.map((path) => path.replace(`${SOURCE_ROOT}/`, ""));

		expect(placementMatches).toEqual(["hooks/trade/use-tracked-twap-order.ts"]);
		expect(cancellationMatches).toEqual(["hooks/trade/use-twap-cancel.ts"]);
		expect(readFileSync(resolve(SOURCE_ROOT, "hooks/trade/use-twap-cancel.ts"), "utf8")).toContain(
			"executionGuard: assertTwapCancelExecution",
		);
		expect(readFileSync(resolve(SOURCE_ROOT, "hooks/trade/use-tracked-twap-order.ts"), "utf8")).toContain(
			'useExchange("twapOrder", { executionGuard: options.executionGuard })',
		);
		expect(readFileSync(resolve(SOURCE_ROOT, "hooks/trade/use-order-submit.ts"), "utf8")).toMatch(
			/useTrackedTwapOrder\(\{\s*executionGuard: options\.twapExecutionGuard,/,
		);
		expect(readFileSync(resolve(SOURCE_ROOT, "components/trade/tradebox/trade-panel.tsx"), "utf8")).toMatch(
			/useOrderSubmit\(\{\s*executionGuard,\s*twapExecutionGuard,/,
		);
		expect(readFileSync(resolve(SOURCE_ROOT, "components/trade/mobile/mobile-trade-view.tsx"), "utf8")).toMatch(
			/useOrderSubmit\(\{\s*executionGuard,\s*twapExecutionGuard,/,
		);
	});

	it("resolves optional TWAP prices through the shared policy and requires a live mark on both surfaces", () => {
		const orderSubmit = readFileSync(resolve(SOURCE_ROOT, "hooks/trade/use-order-submit.ts"), "utf8");

		expect(orderSubmit).toContain("const details = buildTwapOrderDetails({");
		expect(orderSubmit).toMatch(/twap: \{[\s\S]*?\},\s*\.\.\.\(details \? \{ details \} : \{\}\),/);
		expect(orderSubmit).not.toMatch(/details:\s*\{\s*t:\s*null,\s*s:\s*null/);
		expect(orderSubmit).not.toContain("formatPriceForOrder(twapTriggerPrice");

		for (const path of ORDER_ENTRY_SURFACES) {
			const source = readFileSync(resolve(SOURCE_ROOT, path), "utf8");

			expect(source).toMatch(
				/const \{ trigger: twapTriggerPriceState, stop: twapStopPriceState \} = resolveTwapPriceStates\(\s*twapAdvancedEnabled,\s*twapTriggerPriceInput,\s*twapStopPriceInput,\s*twapPriceFormat,?\s*\);/,
			);
			expect(source).toContain("const twapTriggerPx = twapTriggerPriceState.price;");
			expect(source).toContain("const twapStopPx = twapStopPriceState.price;");
			expect(source).toMatch(
				/twapTriggerPriceState\.status === "invalid" \|\| twapStopPriceState\.status === "invalid"/,
			);
			expect(source).not.toContain("resolveTwapPriceInputs(");
			expect(source).not.toContain("formatTwapPriceInput(");
			expect(source).not.toContain("spotBuyTwapOrder");
			expect(source).toMatch(
				/const requiresLiveMarkPrice = orderType === "market" \|\| (?:is)?[Tt]riggerOrder \|\| twapOrder;/,
			);
		}
	});

	it("gates the reduce-only flag by market capability on both surfaces before it reaches validation and submission", () => {
		const tradePanel = readFileSync(resolve(SOURCE_ROOT, "components/trade/tradebox/trade-panel.tsx"), "utf8");
		const mobileTradeView = readFileSync(resolve(SOURCE_ROOT, "components/trade/mobile/mobile-trade-view.tsx"), "utf8");

		for (const source of [tradePanel, mobileTradeView]) {
			expect(source).toContain("const reduceOnlyChecked = useReduceOnly();");
			expect(source).toContain("const reduceOnly = capabilities.hasReduceOnly && reduceOnlyChecked;");
			expect(source).toMatch(/perpInput\(baseInput, \{[\s\S]*?\breduceOnly,[\s\S]*?\}\)/);
			expect(source).toMatch(/await confirmation\.requestSubmit\(\s*\{[\s\S]*?\breduceOnly,[\s\S]*?\},\s*draft,\s*\);/);
			expect(source).not.toMatch(/reduceOnly: reduceOnlyChecked/);
		}
	});

	it("keeps the slider gesture lock in the submit path and off the submit control on both surfaces", () => {
		for (const path of ORDER_ENTRY_SURFACES) {
			const source = readFileSync(resolve(SOURCE_ROOT, path), "utf8");
			expect(source, path).toMatch(
				/function canExecuteOrder\(input\?: OrderSubmitDraftInput\) \{\s*if \(input && !isDraftResetTokenCurrent\(input\.draftResetToken\)\) return false;\s*if \(sizeInteractionRef\.current\) return false;/,
			);
			expect(source, path).toMatch(
				/function handleSizeInteractionChange\(active: boolean\) \{\s*sizeInteractionRef\.current = active;/,
			);
			expect(source, path).toMatch(
				/function handleCtaClick\(\) \{\s*if \(sizeInteractionRef\.current\) return;\s*buttonContent\.action\(\);\s*\}/,
			);
			expect(source, path).toContain("onClick={handleCtaClick}");
			expect(source, path).not.toContain("onClick={buttonContent.action}");
			expect(source, path).toMatch(/on(?:Size)?InteractionChange[=:] ?\{?handleSizeInteractionChange/);
			expect(source, path).not.toMatch(/\b(?:disabled|canSubmit)\b[^\n]*Interacti/);
			expect(source, path).not.toMatch(/useState[^\n]*Interacti|\[is\w*Interacti\w*, set/);
		}
	});

	it("binds both confirmation surfaces to the captured session and draft revision", () => {
		for (const path of ORDER_ENTRY_SURFACES) {
			const source = readFileSync(resolve(SOURCE_ROOT, path), "utf8");
			expect(source).toContain("useOrderConfirmation(");
			expect(source).toContain("<OrderConfirmationModal");
			expect(source).toContain("confirmation.requestSubmit(");
			expect(source).toContain("canExecute: canExecuteOrder })");
			expect(source).toContain("function canExecuteOrder(input?: OrderSubmitDraftInput)");
			expect(source).toContain("if (input && !isDraftResetTokenCurrent(input.draftResetToken)) return false;");
			expect(source).toMatch(/if \(isSubmitting \|\| !canExecuteOrder\(\)\) return;/);
			expect(source).toMatch(/const draftResetToken = captureDraftResetToken\(\);\s*if \(!draftResetToken\) return;/);
			expect(source).toMatch(/await confirmation\.requestSubmit\(\s*\{\s*draftResetToken,/);
		}

		const confirmationHook = readFileSync(resolve(SOURCE_ROOT, "hooks/trade/use-order-confirmation.ts"), "utf8");
		expect(confirmationHook).toMatch(
			/if \(!canExecute\(input\)\) \{\s*rejectChangedOrder\(\);\s*return;\s*\}\s*if \(getSkipOrderConfirmation\(\)\)/,
		);
		expect(confirmationHook).toMatch(
			/const \{ input \} = pending;\s*if \(!canExecute\(input\)\) \{\s*rejectChangedOrder\(\);\s*return;/,
		);
		expect(confirmationHook).toMatch(/function rejectChangedOrder\(\) \{[\s\S]*?setPending\(null\);/);
		expect(confirmationHook).toMatch(
			/if \(dontShowAgain\) setSkipOrderConfirmation\(true\);\s*confirmingRef\.current = true;\s*setIsConfirming\(true\);/,
		);
		expect(confirmationHook).toMatch(/setPending\(null\);\s*try \{\s*await execute\(input\);/);
		expect(confirmationHook).toMatch(
			/async function requestSubmit\([^)]*\) \{\s*if \(confirmingRef\.current\) return;/,
		);

		const skipMatches = collectSourceFiles(SOURCE_ROOT)
			.filter((path) => /\.(ts|tsx)$/.test(path) && !path.includes("/lib/tests/"))
			.filter((path) => readFileSync(path, "utf8").includes("getSkipOrderConfirmation()"))
			.map((path) => path.replace(`${SOURCE_ROOT}/`, ""))
			.sort();

		expect(skipMatches).toEqual(["hooks/trade/use-order-confirmation.ts", "stores/use-global-settings-store.ts"]);
	});

	it("checks the active session and exact draft before creating a submission", () => {
		const orderSubmit = readFileSync(resolve(SOURCE_ROOT, "hooks/trade/use-order-submit.ts"), "utf8");
		expect(orderSubmit).toContain("draftResetToken: OrderSubmitDraftResetToken;");
		expect(orderSubmit).toMatch(
			/async function handleSubmit\(input: OrderSubmitInput\) \{\s*if \(!isDraftResetTokenCurrent\(input\.draftResetToken\)\) return;/,
		);
		expect(orderSubmit).toMatch(
			/exchangeSession\.active &&\s*token\?\.exchangeSession === exchangeSession &&\s*clientKey !== "disconnected" &&\s*sessionMode !== "disconnected"/,
		);
		expect(orderSubmit).toContain("if (!isExchangeSessionCurrent(token)) return false;");
		expect(orderSubmit).toMatch(
			/current\.marketIdentity === token\.orderEntry\.marketIdentity &&\s*current\.draftRevision === token\.orderEntry\.draftRevision/,
		);
	});

	it("keeps price-bearing fields out of the confirmation snapshot on both surfaces", () => {
		const tradePanel = readFileSync(resolve(SOURCE_ROOT, "components/trade/tradebox/trade-panel.tsx"), "utf8");
		const mobileTradeView = readFileSync(resolve(SOURCE_ROOT, "components/trade/mobile/mobile-trade-view.tsx"), "utf8");
		const orderSubmit = readFileSync(resolve(SOURCE_ROOT, "hooks/trade/use-order-submit.ts"), "utf8");

		expect(orderSubmit).toContain(
			'export type OrderSubmitLivePrices = Pick<OrderSubmitInput, "price" | "executionReferencePx" | "markPx">;',
		);
		expect(orderSubmit).toContain(
			"export type OrderSubmitDraftInput = Omit<OrderSubmitInput, keyof OrderSubmitLivePrices>;",
		);

		for (const source of [tradePanel, mobileTradeView]) {
			const snapshot = source.match(/await confirmation\.requestSubmit\(\s*\{[\s\S]*?\},\s*draft,\s*\);/);
			expect(snapshot).not.toBeNull();
			for (const field of ["price,", "executionReferencePx,", "markPx,"]) {
				expect(snapshot?.[0]).not.toContain(field);
			}
			expect(source).toContain("await submitOrder({ ...input, price, executionReferencePx, markPx });");
		}

		expect(mobileTradeView).toContain("async function executeSubmit(input: OrderSubmitDraftInput) {");
	});

	it("passes raw TWAP trigger and stop price inputs alongside normalized prices into confirmation.requestSubmit on both surfaces", () => {
		for (const path of ORDER_ENTRY_SURFACES) {
			const source = readFileSync(resolve(SOURCE_ROOT, path), "utf8");
			expect(() => verifyTwapRawPriceSubmissionWiring(source, path), path).not.toThrow();
		}
	});

	it("rejects mutations that drop or rewrite raw TWAP price inputs in confirmation.requestSubmit on either surface", () => {
		for (const path of ORDER_ENTRY_SURFACES) {
			const source = readFileSync(resolve(SOURCE_ROOT, path), "utf8");
			const targetBlock = "twapStopPx,\n\t\t\t\ttwapTriggerPriceInput,\n\t\t\t\ttwapStopPriceInput,";
			expect(source, path).toContain(targetBlock);

			const droppedTriggerInput = source.replace(targetBlock, "twapStopPx,\n\t\t\t\ttwapStopPriceInput,");
			expect(droppedTriggerInput).not.toBe(source);
			expect(() => verifyTwapRawPriceSubmissionWiring(droppedTriggerInput, path), path).toThrow(
				/requestSubmit first argument.*twapTriggerPriceInput/,
			);

			const droppedStopInput = source.replace(targetBlock, "twapStopPx,\n\t\t\t\ttwapTriggerPriceInput,");
			expect(droppedStopInput).not.toBe(source);
			expect(() => verifyTwapRawPriceSubmissionWiring(droppedStopInput, path), path).toThrow(
				/requestSubmit first argument.*twapStopPriceInput/,
			);

			const droppedBothRawInputs = source.replace(targetBlock, "twapStopPx,");
			expect(droppedBothRawInputs).not.toBe(source);
			expect(() => verifyTwapRawPriceSubmissionWiring(droppedBothRawInputs, path), path).toThrow(
				/requestSubmit first argument.*twapTriggerPriceInput/,
			);

			const undefinedTriggerInput = source.replace(
				targetBlock,
				"twapStopPx,\n\t\t\t\ttwapTriggerPriceInput: undefined,\n\t\t\t\ttwapStopPriceInput,",
			);
			expect(undefinedTriggerInput).not.toBe(source);
			expect(() => verifyTwapRawPriceSubmissionWiring(undefinedTriggerInput, path), path).toThrow(
				/requestSubmit first argument.*twapTriggerPriceInput/,
			);

			const normalizedAsRawStopInput = source.replace(
				targetBlock,
				'twapStopPx,\n\t\t\t\ttwapTriggerPriceInput,\n\t\t\t\ttwapStopPriceInput: twapStopPx ?? "",',
			);
			expect(normalizedAsRawStopInput).not.toBe(source);
			expect(() => verifyTwapRawPriceSubmissionWiring(normalizedAsRawStopInput, path), path).toThrow(
				/requestSubmit first argument.*twapStopPriceInput/,
			);

			const droppedStopPx = source.replace(targetBlock, "twapTriggerPriceInput,\n\t\t\t\ttwapStopPriceInput,");
			expect(droppedStopPx).not.toBe(source);
			expect(() => verifyTwapRawPriceSubmissionWiring(droppedStopPx, path), path).toThrow(
				/requestSubmit first argument.*twapStopPx/,
			);

			const strippedInExecute = source.replace(
				"await submitOrder({ ...input, price, executionReferencePx, markPx });",
				"await submitOrder({ ...input, twapTriggerPriceInput: undefined, price, executionReferencePx, markPx });",
			);
			expect(strippedInExecute).not.toBe(source);
			expect(() => verifyTwapRawPriceSubmissionWiring(strippedInExecute, path), path).toThrow(
				/execute callback.*twapTriggerPriceInput/,
			);
		}
	});
});

function unwrapExpression(expr: ts.Expression): ts.Expression {
	let current = expr;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isSatisfiesExpression(current) ||
		ts.isNonNullExpression(current)
	) {
		current = current.expression;
	}
	return current;
}

function getPropertyNameText(name: ts.PropertyName): string | null {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
	return null;
}

function getObjectPropertyExpression(obj: ts.ObjectLiteralExpression, key: string): ts.Expression | null {
	for (const prop of obj.properties) {
		if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === key) {
			return prop.name;
		}
		if (ts.isPropertyAssignment(prop) && getPropertyNameText(prop.name) === key) {
			return unwrapExpression(prop.initializer);
		}
	}
	return null;
}

function isIdentifierNamed(node: ts.Node | undefined, name: string): boolean {
	return Boolean(node && ts.isIdentifier(node) && node.text === name);
}

function isPropertyAccess(node: ts.Node | undefined, rootName: string, propName: string): boolean {
	if (!node || !ts.isPropertyAccessExpression(node)) return false;
	return isIdentifierNamed(node.expression, rootName) && node.name.text === propName;
}

function findNode<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T | null {
	let found: T | null = null;
	function visit(node: ts.Node) {
		if (found) return;
		if (predicate(node)) {
			found = node;
			return;
		}
		ts.forEachChild(node, visit);
	}
	visit(root);
	return found;
}

function verifyTwapRawPriceSubmissionWiring(source: string, fileName: string): void {
	const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

	for (const [variableName, hookName] of [
		["twapTriggerPriceInput", "useTwapTriggerPrice"],
		["twapStopPriceInput", "useTwapStopPrice"],
	] as const) {
		const decl = findNode(
			sf,
			(node): node is ts.VariableDeclaration =>
				ts.isVariableDeclaration(node) && isIdentifierNamed(node.name, variableName),
		);
		const init = decl?.initializer ? unwrapExpression(decl.initializer) : null;
		if (!init || !ts.isCallExpression(init) || !isIdentifierNamed(init.expression, hookName)) {
			throw new Error(`Expected ${variableName} to come from ${hookName}() in ${fileName}`);
		}
	}

	const handleSubmitFn = findNode(
		sf,
		(node): node is ts.FunctionDeclaration =>
			ts.isFunctionDeclaration(node) && isIdentifierNamed(node.name, "handleSubmit"),
	);
	if (!handleSubmitFn?.body) {
		throw new Error(`Missing handleSubmit function in ${fileName}`);
	}

	const requestSubmitCall = findNode(
		handleSubmitFn.body,
		(node): node is ts.CallExpression =>
			ts.isCallExpression(node) && isPropertyAccess(node.expression, "confirmation", "requestSubmit"),
	);
	if (!requestSubmitCall || requestSubmitCall.arguments.length < 2) {
		throw new Error(`Missing confirmation.requestSubmit(input, draft) call in ${fileName}`);
	}
	const submitInputArg = unwrapExpression(requestSubmitCall.arguments[0]);
	if (!ts.isObjectLiteralExpression(submitInputArg)) {
		throw new Error(`Expected confirmation.requestSubmit first argument to be an object literal in ${fileName}`);
	}

	for (const field of [
		"twapAdvancedEnabled",
		"twapTriggerPx",
		"twapStopPx",
		"twapTriggerPriceInput",
		"twapStopPriceInput",
	] as const) {
		if (!isIdentifierNamed(getObjectPropertyExpression(submitInputArg, field) ?? undefined, field)) {
			throw new Error(`Expected confirmation.requestSubmit first argument to bind ${field} in ${fileName}`);
		}
	}

	const useOrderConfirmationCall = findNode(
		sf,
		(node): node is ts.CallExpression =>
			ts.isCallExpression(node) && isIdentifierNamed(node.expression, "useOrderConfirmation"),
	);
	const confirmationOptions =
		useOrderConfirmationCall && useOrderConfirmationCall.arguments.length >= 1
			? unwrapExpression(useOrderConfirmationCall.arguments[0])
			: null;
	if (!confirmationOptions || !ts.isObjectLiteralExpression(confirmationOptions)) {
		throw new Error(`Missing useOrderConfirmation options object in ${fileName}`);
	}
	const executeExpr = getObjectPropertyExpression(confirmationOptions, "execute");
	if (!executeExpr || !ts.isIdentifier(executeExpr)) {
		throw new Error(`Expected useOrderConfirmation to pass a named execute callback in ${fileName}`);
	}
	const executeFn = findNode(
		sf,
		(node): node is ts.FunctionDeclaration =>
			ts.isFunctionDeclaration(node) && isIdentifierNamed(node.name, executeExpr.text),
	);
	if (!executeFn?.body) {
		throw new Error(`Missing execute callback declaration ${executeExpr.text} in ${fileName}`);
	}
	const submitOrderCall = findNode(
		executeFn.body,
		(node): node is ts.CallExpression => ts.isCallExpression(node) && isIdentifierNamed(node.expression, "submitOrder"),
	);
	const submitOrderArg =
		submitOrderCall && submitOrderCall.arguments.length >= 1 ? unwrapExpression(submitOrderCall.arguments[0]) : null;
	if (!submitOrderArg || !ts.isObjectLiteralExpression(submitOrderArg)) {
		throw new Error(`Expected execute callback to forward an object literal to submitOrder in ${fileName}`);
	}
	const spreadsInput = submitOrderArg.properties.some(
		(prop) => ts.isSpreadAssignment(prop) && isIdentifierNamed(unwrapExpression(prop.expression), "input"),
	);
	if (!spreadsInput) {
		throw new Error(`Expected execute callback to spread ...input into submitOrder in ${fileName}`);
	}
	for (const protectedField of [
		"twapAdvancedEnabled",
		"twapTriggerPx",
		"twapStopPx",
		"twapTriggerPriceInput",
		"twapStopPriceInput",
	] as const) {
		if (getObjectPropertyExpression(submitOrderArg, protectedField) !== null) {
			throw new Error(`Expected execute callback not to override ${protectedField} in ${fileName}`);
		}
	}
}

function collectSourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((entry) => {
		const path = resolve(directory, entry);
		return statSync(path).isDirectory() ? collectSourceFiles(path) : [path];
	});
}

function findExchangeEntryPoints(method: string): string[] {
	return collectSourceFiles(SOURCE_ROOT)
		.filter((path) => /\.(ts|tsx)$/.test(path) && !path.includes("/lib/tests/"))
		.filter((path) => {
			const source = readFileSync(path, "utf8");
			if (!source.includes("useExchange")) return false;
			const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
			let found = false;
			function visit(node: ts.Node) {
				if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useExchange") {
					const firstArgument = node.arguments[0];
					if (firstArgument && ts.isStringLiteral(firstArgument) && firstArgument.text === method) found = true;
				}
				ts.forEachChild(node, visit);
			}
			visit(file);
			return found;
		})
		.map((path) => path.replace(`${SOURCE_ROOT}/`, ""))
		.sort();
}
