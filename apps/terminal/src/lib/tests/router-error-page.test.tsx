// @vitest-environment jsdom

import { act, Component, type ReactNode, Suspense } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterErrorPage } from "@/components/pages/router-error-page";
import { createLazyComponent } from "@/lib/lazy";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const routerMocks = vi.hoisted(() => ({
	invalidate: vi.fn().mockResolvedValue(undefined),
	reportClientError: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-router")>();
	return {
		...actual,
		useRouter: () => ({ invalidate: routerMocks.invalidate }),
	};
});

vi.mock("@/lib/error-reporting/client", () => ({
	reportClientError: routerMocks.reportClientError,
}));

class TestBoundary extends Component<
	{ children: ReactNode; onError: (error: Error) => void },
	{ error: Error | null }
> {
	override state: { error: Error | null } = { error: null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	override componentDidCatch(error: Error) {
		this.props.onError(error);
	}

	override render() {
		return this.state.error ? null : this.props.children;
	}
}

describe("RouterErrorPage reload recovery", () => {
	let container: HTMLDivElement;
	let root: Root;
	const originalLocation = window.location;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		routerMocks.invalidate.mockClear();
		routerMocks.reportClientError.mockClear();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		Object.defineProperty(window, "location", {
			configurable: true,
			value: originalLocation,
		});
		vi.restoreAllMocks();
	});

	it("reloads the page instead of calling router.invalidate() so cached lazyRouteComponent load errors can recover", async () => {
		const reload = vi.fn();
		Object.defineProperty(window, "location", {
			configurable: true,
			value: { ...originalLocation, reload },
		});

		const chunkFailure = new Error("Network failure while loading route chunk");
		let attempts = 0;
		const LazyRoute = createLazyComponent(async () => {
			attempts += 1;
			if (attempts === 1) throw chunkFailure;
			return {
				Page: function RecoveredPage() {
					return <div>Recovered</div>;
				},
			};
		}, "Page");

		let caughtError: Error | null = null;
		await act(async () => {
			root.render(
				<TestBoundary
					onError={(err) => {
						caughtError = err;
					}}
				>
					<Suspense fallback={null}>
						<LazyRoute />
					</Suspense>
				</TestBoundary>,
			);
			await Promise.resolve();
		});

		expect(caughtError).toBe(chunkFailure);
		expect(attempts).toBe(1);

		let secondError: Error | null = null;
		await act(async () => {
			root.render(
				<TestBoundary
					key="retry-without-reload"
					onError={(err) => {
						secondError = err;
					}}
				>
					<Suspense fallback={null}>
						<LazyRoute />
					</Suspense>
				</TestBoundary>,
			);
			await Promise.resolve();
		});
		expect(secondError).toBe(chunkFailure);
		expect(attempts).toBe(1);

		act(() => {
			root.render(<RouterErrorPage error={chunkFailure} reset={vi.fn()} />);
		});

		const reloadButton = container.querySelector<HTMLButtonElement>("button");
		expect(reloadButton?.textContent).toBe("Reload terminal");

		act(() => {
			reloadButton?.click();
		});

		expect(reload).toHaveBeenCalledTimes(1);
		expect(routerMocks.invalidate).not.toHaveBeenCalled();
	});
});
