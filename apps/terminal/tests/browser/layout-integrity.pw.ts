import { expect, test } from "@playwright/test";
import { findLayoutIntegrityIssues } from "./layout-integrity";

const CASES = `
<style>
	body { margin: 0; font: 14px/20px sans-serif; }
	.card { width: 120px; border: 1px solid #888; padding: 4px; margin: 8px; }
	.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.clamp { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; }
	.clip { overflow: hidden; height: 20px; }
	.scroll { overflow-x: auto; white-space: nowrap; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	.badge { position: relative; top: 14px; }
</style>
<main id="root">
	<div class="card" data-testid="fits"><span class="truncate" style="display:block">Short</span></div>
	<div class="card" data-testid="ellipsis"><span class="truncate" style="display:block">A long market name that cannot fit</span></div>
	<div class="card" data-testid="wraps"><span style="display:block">A long market name that simply wraps onto more lines</span></div>
	<div class="card" data-testid="clamped"><p class="clamp">A long market name that is clamped to one line</p></div>
	<div class="card clip" data-testid="clipped-badge"><span>Name</span><span class="badge">xyz</span></div>
	<div class="card" data-testid="screen-reader"><span class="sr-only">A long description only for screen readers that is clipped</span>Visible</div>
	<div class="card scroll" data-testid="scrolls">A long row of chips that scrolls sideways inside its strip</div>
	<div class="card" data-testid="hidden" style="display:none"><span class="truncate" style="display:block">A long hidden name that would be cut off</span></div>
	<div class="card clip" data-testid="clipped-icon"><svg width="16" height="16" style="position:relative;top:12px"></svg></div>
	<div class="card" data-testid="allowed"><span class="truncate" style="display:block">An accepted long label that is cut off</span></div>
</main>`;

test("reports cut-off text and clipped elements, and nothing that wraps, scrolls or is screen-reader-only", async ({
	page,
}) => {
	await page.setContent(CASES);
	const findings = await findLayoutIntegrityIssues(page, {
		root: "#root",
		exceptions: [{ selector: '[data-testid="allowed"]', reason: "self-test exception" }],
	});
	const summary = findings.map((finding) => `${finding.kind}:${finding.path.split(" › ")[0]}:${finding.text}`);
	expect(findings.find((finding) => finding.text === "xyz")?.path).toBe("clipped-badge › «Name» › span");
	expect(summary).toEqual([
		"truncated:ellipsis:A long market name that cannot fit",
		"truncated:clamped:A long market name that is clamped to one line",
		"clipped:clipped-badge:xyz",
		"clipped:clipped-icon:svg",
	]);
});

test("requires its root and honours the tolerance", async ({ page }) => {
	await page.setContent('<main id="root"><div style="width:100px;overflow:hidden;white-space:nowrap">x</div></main>');
	await expect(findLayoutIntegrityIssues(page, { root: "#missing" })).rejects.toThrow(/Missing layout-integrity root/);
	expect(await findLayoutIntegrityIssues(page, { root: "#root", tolerance: 0 })).toEqual([]);
});
