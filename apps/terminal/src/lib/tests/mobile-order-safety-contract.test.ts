import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const mobileTradeView = readFileSync(
	new URL("../../components/trade/mobile/mobile-trade-view.tsx", import.meta.url),
	"utf8",
);
const mobileSummaryView = readFileSync(
	new URL("../../components/trade/mobile/mobile-trade-summary-view.tsx", import.meta.url),
	"utf8",
);
const mobileTwapTab = readFileSync(
	new URL("../../components/trade/mobile/mobile-twap-tab.tsx", import.meta.url),
	"utf8",
);
const tradeHeader = readFileSync(new URL("../../components/trade/tradebox/trade-header.tsx", import.meta.url), "utf8");
const orderSubmit = readFileSync(new URL("../../hooks/trade/use-order-submit.ts", import.meta.url), "utf8");
const orderEntryStore = readFileSync(new URL("../../stores/use-order-entry-store.ts", import.meta.url), "utf8");

describe("mobile order safety contract", () => {
	it("submits algorithmic intents through the guarded shared submitter instead of blocking them", () => {
		expect(mobileTradeView).not.toContain("isUnsupportedMobileAlgoOrder");
		expect(mobileTradeView).toContain("assertEntryTwapExecutionAllowed(params, orderExecutionStateRef.current)");
		expect(mobileTradeView).toMatch(/useOrderSubmit\(\{\s*executionGuard,\s*twapExecutionGuard,/);
		expect(mobileTradeView).toContain("<TradeFormTwap");
		expect(mobileTradeView).toContain("<TradeFormScale");
	});

	it("validates and submits the real scale and twap fields", () => {
		expect(mobileTradeView).toMatch(/triggerPriceNum: toNumber\(triggerPrice\),\s*scaleOrder,\s*twapOrder,/);
		expect(mobileTradeView).not.toMatch(/scaleOrder: false|twapOrder: false/);
		expect(mobileTradeView).not.toMatch(/scaleStartPriceInput: ""|scaleEndPriceInput: ""|scaleSkewInput: ""/);
		expect(mobileTradeView).toMatch(
			/await confirmation\.requestSubmit\(\s*\{[\s\S]*?scaleLevelsNum,[\s\S]*?twapMinutesNum,[\s\S]*?twapTriggerPx,\s*twapTriggerDirection,\s*twapStopPx,/,
		);
	});

	it("keeps spot TWAP reachable through the guarded mobile order-entry path", () => {
		expect(tradeHeader).not.toContain("hideSpotTwap");
		expect(mobileTradeView).not.toContain("hideSpotTwap");
		expect(mobileTradeView).toContain('if (active && isSpotMarket && isTriggerOrder) setOrderType("market")');
		expect(mobileTradeView).not.toContain("isSpotMarket && (isTriggerOrder || twapOrder)");
	});

	it("uses the shared draft and session-guarded reset without a separate mobile reset callback", () => {
		expect(mobileTradeView).toContain("const sizeInput = useOrderSize();");
		expect(mobileTradeView).toContain("const reduceOnlyChecked = useReduceOnly();");
		expect(mobileTradeView).toMatch(/setSize: setSizeInput,\s*setReduceOnly: setReduceOnlyChecked,/);
		const submitOptions = mobileTradeView.match(/useOrderSubmit\(\{[\s\S]*?\}\)/)?.[0];
		expect(submitOptions).toBeDefined();
		expect(submitOptions).not.toContain("onReset");
		expect(orderSubmit).toMatch(
			/function resetSubmittedForm\(token: OrderSubmitDraftResetToken\) \{\s*if \(isExchangeSessionCurrent\(token\) && resetFormIfCurrent\(token\.orderEntry\)\) options\.onReset\?\.\(\);\s*\}/,
		);
		expect(orderSubmit).not.toMatch(/\bresetForm\(\)/);
		expect(orderSubmit.match(/\bresetSubmittedForm\(draftResetToken\);/g)).toHaveLength(4);
	});

	it("resets the whole shared form atomically only for its matching market and revision", () => {
		const conditionalReset = orderEntryStore.match(/resetFormIfCurrent: \(token\) => \{[\s\S]*?\n\s*resetPrices:/)?.[0];
		expect(conditionalReset).toBeDefined();
		expect(conditionalReset).toMatch(
			/if \(state\.marketIdentity !== token\.marketIdentity \|\| state\.draftRevision !== token\.draftRevision\)\s*return state;/,
		);
		expect(conditionalReset).toContain("return { ...DEFAULT_FORM, draftRevision: state.draftRevision + 1 };");
		expect(conditionalReset).toContain("return reset;");

		const defaultForm = orderEntryStore.match(/const DEFAULT_FORM: FormState = \{[\s\S]*?\n\};/)?.[0] ?? "";
		for (const field of ['tif: "Gtc"', "tpSlEnabled: false", "twapMinutes: 30", "scaleLevels: 4"]) {
			expect(defaultForm).toContain(field);
		}
	});

	it("renders the shared scale and twap fields in the panel's compact field language", () => {
		expect(mobileTradeView).toMatch(/<TradeFormTwap[\s\S]*?compact\s*\n\s*mobileSafe\s*\/>/);
		expect(mobileTradeView).toMatch(/<TradeFormScale[\s\S]*?compact\s*\n\s*mobileSafe\s*\/>/);
	});

	it("does not advertise a create action that the mobile signer cannot encode", () => {
		expect(mobileTwapTab).not.toContain('setOrderType("twap")');
		expect(mobileTwapTab).not.toContain("Create TWAP");
	});

	it("keeps the slippage settings control interactive before wallet connection", () => {
		expect(mobileTradeView).not.toContain("embedded && !isConnected ?");
		expect(mobileTradeView).toMatch(/<MobileSlippageRowView[\s\S]*?onClick=\{openSlippageDialog\}/);
		expect(mobileSummaryView).toMatch(/<button\s+type="button"\s+onClick=\{onClick\}\s+aria-label=\{labels.slippage\}/);
		const button = mobileSummaryView.match(/<button[\s\S]*?<\/button>/)?.[0];
		expect(button).toBeDefined();
		expect(button).not.toContain("disabled");
	});

	it("restores mobile risk context without reviving a separate builder-fee row", () => {
		expect(mobileTradeView).toContain("t`Liq. Price`");
		expect(mobileTradeView).toContain("t`Est. Slippage`");
		expect(mobileTradeView).not.toContain("t`Builder Fee`");
		expect(mobileTradeView).toContain("t`Order Value`");
		expect(mobileTradeView).toContain("t`Margin Req.`");
		expect(mobileTradeView).toContain("t`Slippage`");
		expect(mobileTradeView).not.toContain("estimatedFee");
	});

	it("derives twapTriggerDirection from markPx, passes that variable into draft and requestSubmit, and re-checks it on confirm", () => {
		expect(() => verifyMobileTwapTriggerDirectionContract(mobileTradeView)).not.toThrow();
	});

	it("rejects mutations that hardcode twapTriggerDirection, omit it from draft or submit, or drop the confirm-time direction check", () => {
		const hardcodedDirection = mobileTradeView.replace("getTwapTriggerDirection(twapTriggerPx, markPx)", '"above"');
		expect(hardcodedDirection).not.toBe(mobileTradeView);
		expect(() => verifyMobileTwapTriggerDirectionContract(hardcodedDirection)).toThrow(
			/twapTriggerDirection initializer/,
		);

		const literalSubmitDirection = mobileTradeView.replace(
			"twapTriggerPx,\n\t\t\t\ttwapTriggerDirection,\n\t\t\t\ttwapStopPx,",
			'twapTriggerPx,\n\t\t\t\ttwapTriggerDirection: "above",\n\t\t\t\ttwapStopPx,',
		);
		expect(literalSubmitDirection).not.toBe(mobileTradeView);
		expect(() => verifyMobileTwapTriggerDirectionContract(literalSubmitDirection)).toThrow(
			/requestSubmit first argument.*twapTriggerDirection/,
		);

		const missingDraftDirection = mobileTradeView.replace(
			"twapTriggerPrice: twapTriggerPriceNum,\n\t\t\ttwapTriggerDirection,",
			"twapTriggerPrice: twapTriggerPriceNum,",
		);
		expect(missingDraftDirection).not.toBe(mobileTradeView);
		expect(() => verifyMobileTwapTriggerDirectionContract(missingDraftDirection)).toThrow(
			/draft.*twapTriggerDirection/,
		);

		const deletedDirectionCheck = mobileTradeView.replace(
			"if (!liveDirection || liveDirection !== input.twapTriggerDirection) return false;",
			"",
		);
		expect(deletedDirectionCheck).not.toBe(mobileTradeView);
		expect(() => verifyMobileTwapTriggerDirectionContract(deletedDirectionCheck)).toThrow(
			/canExecuteOrder.*direction mismatch/,
		);

		const deletedLiveDirection = mobileTradeView.replace(
			"const liveDirection = getTwapTriggerDirection(input.twapTriggerPx, markPx);",
			'const liveDirection = "above";',
		);
		expect(deletedLiveDirection).not.toBe(mobileTradeView);
		expect(() => verifyMobileTwapTriggerDirectionContract(deletedLiveDirection)).toThrow(
			/canExecuteOrder.*liveDirection/,
		);

		const disconnectedGuard = mobileTradeView.replace(
			"useOrderConfirmation({ execute: executeSubmit, canExecute: canExecuteOrder })",
			"useOrderConfirmation({ execute: executeSubmit })",
		);
		expect(disconnectedGuard).not.toBe(mobileTradeView);
		expect(() => verifyMobileTwapTriggerDirectionContract(disconnectedGuard)).toThrow(
			/useOrderConfirmation.*canExecuteOrder/,
		);
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

function isGetTwapTriggerDirectionCall(
	expr: ts.Expression | undefined,
	expectedTriggerCheck: (arg: ts.Expression) => boolean,
): boolean {
	if (!expr) return false;
	const unwrapped = unwrapExpression(expr);
	if (!ts.isCallExpression(unwrapped)) return false;
	if (!isIdentifierNamed(unwrapped.expression, "getTwapTriggerDirection")) return false;
	if (unwrapped.arguments.length !== 2) return false;
	return (
		expectedTriggerCheck(unwrapExpression(unwrapped.arguments[0])) &&
		isIdentifierNamed(unwrapExpression(unwrapped.arguments[1]), "markPx")
	);
}

function verifyMobileTwapTriggerDirectionContract(source: string): void {
	const sf = ts.createSourceFile("mobile-trade-view.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

	const directionDecl = findNode(
		sf,
		(node): node is ts.VariableDeclaration =>
			ts.isVariableDeclaration(node) && isIdentifierNamed(node.name, "twapTriggerDirection"),
	);
	if (!directionDecl?.initializer) {
		throw new Error("Missing twapTriggerDirection variable declaration");
	}
	const directionInit = unwrapExpression(directionDecl.initializer);
	if (
		!ts.isConditionalExpression(directionInit) ||
		!isGetTwapTriggerDirectionCall(directionInit.whenTrue, (arg) => isIdentifierNamed(arg, "twapTriggerPx")) ||
		unwrapExpression(directionInit.whenFalse).kind !== ts.SyntaxKind.NullKeyword
	) {
		throw new Error(
			"Expected twapTriggerDirection initializer to compute getTwapTriggerDirection(twapTriggerPx, markPx) or null",
		);
	}

	const handleSubmitFn = findNode(
		sf,
		(node): node is ts.FunctionDeclaration =>
			ts.isFunctionDeclaration(node) && isIdentifierNamed(node.name, "handleSubmit"),
	);
	if (!handleSubmitFn?.body) {
		throw new Error("Missing handleSubmit function");
	}

	const draftDecl = findNode(
		handleSubmitFn.body,
		(node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && isIdentifierNamed(node.name, "draft"),
	);
	if (!draftDecl?.initializer || !ts.isObjectLiteralExpression(unwrapExpression(draftDecl.initializer))) {
		throw new Error("Missing draft object literal in handleSubmit");
	}
	const draftObj = unwrapExpression(draftDecl.initializer) as ts.ObjectLiteralExpression;
	const draftDirectionValue = getObjectPropertyExpression(draftObj, "twapTriggerDirection");
	if (!isIdentifierNamed(draftDirectionValue ?? undefined, "twapTriggerDirection")) {
		throw new Error("Expected confirmation draft to bind twapTriggerDirection from the computed variable");
	}

	const requestSubmitCall = findNode(
		handleSubmitFn.body,
		(node): node is ts.CallExpression =>
			ts.isCallExpression(node) && isPropertyAccess(node.expression, "confirmation", "requestSubmit"),
	);
	if (!requestSubmitCall || requestSubmitCall.arguments.length < 2) {
		throw new Error("Missing confirmation.requestSubmit(input, draft) call in handleSubmit");
	}
	const submitInputArg = unwrapExpression(requestSubmitCall.arguments[0]);
	if (!ts.isObjectLiteralExpression(submitInputArg)) {
		throw new Error("Expected confirmation.requestSubmit first argument to be an object literal");
	}
	if (!isIdentifierNamed(getObjectPropertyExpression(submitInputArg, "twapTriggerPx") ?? undefined, "twapTriggerPx")) {
		throw new Error("Expected confirmation.requestSubmit first argument to pass twapTriggerPx");
	}
	if (
		!isIdentifierNamed(
			getObjectPropertyExpression(submitInputArg, "twapTriggerDirection") ?? undefined,
			"twapTriggerDirection",
		)
	) {
		throw new Error(
			"Expected confirmation.requestSubmit first argument to pass twapTriggerDirection from the computed variable",
		);
	}
	if (!isIdentifierNamed(getObjectPropertyExpression(submitInputArg, "twapStopPx") ?? undefined, "twapStopPx")) {
		throw new Error("Expected confirmation.requestSubmit first argument to pass twapStopPx");
	}
	if (!isIdentifierNamed(unwrapExpression(requestSubmitCall.arguments[1]), "draft")) {
		throw new Error("Expected confirmation.requestSubmit second argument to be draft");
	}

	const canExecuteFn = findNode(
		sf,
		(node): node is ts.FunctionDeclaration =>
			ts.isFunctionDeclaration(node) && isIdentifierNamed(node.name, "canExecuteOrder"),
	);
	if (!canExecuteFn?.body) {
		throw new Error("Missing canExecuteOrder function");
	}

	const liveDirectionDecl = findNode(
		canExecuteFn.body,
		(node): node is ts.VariableDeclaration =>
			ts.isVariableDeclaration(node) && isIdentifierNamed(node.name, "liveDirection"),
	);
	if (
		!liveDirectionDecl?.initializer ||
		!isGetTwapTriggerDirectionCall(liveDirectionDecl.initializer, (arg) =>
			isPropertyAccess(arg, "input", "twapTriggerPx"),
		)
	) {
		throw new Error(
			"Expected canExecuteOrder to recompute liveDirection via getTwapTriggerDirection(input.twapTriggerPx, markPx)",
		);
	}

	const directionMismatchGuard = findNode(canExecuteFn.body, (node): node is ts.IfStatement => {
		if (!ts.isIfStatement(node)) return false;
		const returnsFalse = Boolean(
			findNode(
				node.thenStatement,
				(inner): inner is ts.ReturnStatement =>
					ts.isReturnStatement(inner) && inner.expression?.kind === ts.SyntaxKind.FalseKeyword,
			),
		);
		if (!returnsFalse) return false;
		const checksMissingLiveDirection = Boolean(
			findNode(
				node.expression,
				(inner): inner is ts.PrefixUnaryExpression =>
					ts.isPrefixUnaryExpression(inner) &&
					inner.operator === ts.SyntaxKind.ExclamationToken &&
					isIdentifierNamed(unwrapExpression(inner.operand), "liveDirection"),
			),
		);
		const checksMismatch = Boolean(
			findNode(node.expression, (inner): inner is ts.BinaryExpression => {
				if (!ts.isBinaryExpression(inner)) return false;
				if (inner.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return false;
				const left = unwrapExpression(inner.left);
				const right = unwrapExpression(inner.right);
				return (
					(isIdentifierNamed(left, "liveDirection") && isPropertyAccess(right, "input", "twapTriggerDirection")) ||
					(isPropertyAccess(left, "input", "twapTriggerDirection") && isIdentifierNamed(right, "liveDirection"))
				);
			}),
		);
		return checksMissingLiveDirection && checksMismatch;
	});
	if (!directionMismatchGuard) {
		throw new Error(
			"Expected canExecuteOrder to return false on direction mismatch (!liveDirection || liveDirection !== input.twapTriggerDirection)",
		);
	}

	const useOrderConfirmationCall = findNode(
		sf,
		(node): node is ts.CallExpression =>
			ts.isCallExpression(node) && isIdentifierNamed(node.expression, "useOrderConfirmation"),
	);
	if (
		!useOrderConfirmationCall ||
		useOrderConfirmationCall.arguments.length < 1 ||
		!ts.isObjectLiteralExpression(unwrapExpression(useOrderConfirmationCall.arguments[0]))
	) {
		throw new Error("Missing useOrderConfirmation options object");
	}
	const confirmationOptions = unwrapExpression(useOrderConfirmationCall.arguments[0]) as ts.ObjectLiteralExpression;
	if (
		!isIdentifierNamed(getObjectPropertyExpression(confirmationOptions, "canExecute") ?? undefined, "canExecuteOrder")
	) {
		throw new Error("Expected useOrderConfirmation to pass canExecute: canExecuteOrder");
	}
}
