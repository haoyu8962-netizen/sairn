import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installChartLibrary, readChartLibraryManifest, verifyChartLibrary } from "./fetch-chart-library.mjs";

const CONTENTS = { "charting_library.js": "loader", "bundles/a.js": "bundle" };

function sha256(text) {
	return createHash("sha256").update(text).digest("hex");
}

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "chart-library-test-"));
	const source = join(root, "source");
	mkdirSync(join(source, "bundles"), { recursive: true });
	for (const [path, text] of Object.entries(CONTENTS)) writeFileSync(join(source, path), text);
	const manifestPath = join(root, "manifest.json");
	const files = Object.entries(CONTENTS).map(([path, text]) => ({ path, sha256: sha256(text), size: text.length }));
	writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, files }));
	return { root, source, target: join(root, "public", "charting_library"), manifestPath };
}

test("installs exactly the manifest files and leaves source extras behind", async () => {
	const { root, source, target, manifestPath } = fixture();
	try {
		writeFileSync(join(source, "README.md"), "not part of the package");
		mkdirSync(join(root, "public"));
		const files = await readChartLibraryManifest(manifestPath);
		await installChartLibrary({ source, target, files });
		assert.deepEqual(readdirSync(target).sort(), ["bundles", "charting_library.js"]);
		assert.equal(readFileSync(join(target, "bundles", "a.js"), "utf8"), "bundle");
		await verifyChartLibrary(target, files, { exact: true });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("refuses a source whose file differs from the manifest and keeps the installed copy", async () => {
	const { root, source, target, manifestPath } = fixture();
	try {
		mkdirSync(target, { recursive: true });
		writeFileSync(join(target, "keep.txt"), "previous install");
		writeFileSync(join(source, "bundles", "a.js"), "bundlf");
		const files = await readChartLibraryManifest(manifestPath);
		await assert.rejects(installChartLibrary({ source, target, files }), /does not match its manifest SHA-256/);
		assert.equal(readFileSync(join(target, "keep.txt"), "utf8"), "previous install");
		assert.equal(readdirSync(join(root, "public")).length, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("refuses a source that is missing a manifest file", async () => {
	const { root, source, target, manifestPath } = fixture();
	try {
		rmSync(join(source, "charting_library.js"));
		const files = await readChartLibraryManifest(manifestPath);
		await assert.rejects(installChartLibrary({ source, target, files }), /file is missing: charting_library\.js/);
		assert.equal(existsSync(target), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("an installed directory with a file the manifest does not list fails the exact check", async () => {
	const { root, source, manifestPath } = fixture();
	try {
		const files = await readChartLibraryManifest(manifestPath);
		await verifyChartLibrary(source, files, { exact: true });
		writeFileSync(join(source, "bundles", "extra.js"), "x");
		await assert.rejects(verifyChartLibrary(source, files, { exact: true }), /absent from the manifest: bundles\/extra\.js/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("rejects manifest paths that leave the library directory", async () => {
	const { root, manifestPath } = fixture();
	try {
		writeFileSync(manifestPath, JSON.stringify({ files: [{ path: "../evil.js", sha256: sha256("x"), size: 1 }] }));
		await assert.rejects(readChartLibraryManifest(manifestPath), /invalid entry/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

for (const [label, linkPath, outside, kind] of [
	["a directory on a manifest path that leads outside the source", "bundles", "elsewhere", "dir"],
	["a directory on a manifest path that leads to another directory of the source", "bundles", "source/vendor", "dir"],
	["a manifest file", "bundles/a.js", "elsewhere.js", "file"],
]) {
	test(`refuses a source where ${label} is a symbolic link and keeps the installed copy`, async (t) => {
		const { root, source, target, manifestPath } = fixture();
		t.after(() => rmSync(root, { recursive: true, force: true }));
		const link = join(source, linkPath);
		const destination = join(root, outside);
		renameSync(link, destination);
		symlinkSync(destination, link, kind);
		mkdirSync(target, { recursive: true });
		writeFileSync(join(target, "keep.txt"), "previous install");
		const files = await readChartLibraryManifest(manifestPath);
		await assert.rejects(installChartLibrary({ source, target, files }), /not a (?:real directory|regular file): bundles\/a\.js/);
		assert.equal(readFileSync(join(target, "keep.txt"), "utf8"), "previous install");
	});
}

test("follows a source root that the operator names through a symbolic link", async (t) => {
	const { root, source, target, manifestPath } = fixture();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const alias = join(root, "source-alias");
	symlinkSync(source, alias, "dir");
	const files = await readChartLibraryManifest(manifestPath);
	await installChartLibrary({ source: alias, target, files });
	await verifyChartLibrary(target, files, { exact: true });
});

function runFailingClone(t, repository) {
	const { root, manifestPath } = fixture();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const script = join(root, "scripts", "fetch-chart-library.mjs");
	mkdirSync(join(root, "scripts"));
	mkdirSync(join(root, "deploy", "manifests"), { recursive: true });
	copyFileSync(new URL("./fetch-chart-library.mjs", import.meta.url), script);
	copyFileSync(manifestPath, join(root, "deploy", "manifests", "tradingview-charting-library.json"));
	const bin = join(root, "bin");
	mkdirSync(bin);
	const argsFile = join(root, "git-args.json");
	writeFileSync(
		join(bin, "git"),
		`#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));\nconsole.error("synthetic git failure");\nprocess.exit(128);\n`,
		{ mode: 0o700 },
	);
	const result = spawnSync(process.execPath, [realpathSync(script)], {
		cwd: root,
		encoding: "utf8",
		env: { PATH: bin, TMPDIR: root, CHART_LIBRARY_REPOSITORY: repository },
	});
	assert.equal(result.status, 1);
	return { args: JSON.parse(readFileSync(argsFile, "utf8")), stderr: result.stderr };
}

test("hands the repository to git clone after the end of its options", (t) => {
	const repository = "--upload-pack=touch injected";
	const { args } = runFailingClone(t, repository);
	assert.deepEqual(args.slice(0, -1), ["clone", "--quiet", "--depth", "1", "--", repository]);
});

test("a failed clone keeps the Git diagnostics and leaves credentials in the repository address out", (t) => {
	const { stderr } = runFailingClone(t, "https://reader:s3cret-token@git.example.test/owner/library.git");
	assert.match(stderr, /synthetic git failure/);
	assert.match(stderr, /Cannot clone the private chart library from https:\/\/git\.example\.test\/owner\/library\.git/);
	assert.equal(stderr.includes("s3cret-token"), false);
	assert.equal(stderr.includes("reader"), false);
});
