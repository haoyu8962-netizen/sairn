#!/usr/bin/env node
// Static deployment of the trading terminal: uploads the client build to S3 in an order that never
// lets a new shell reference missing assets, invalidates CloudFront, updates the API Lambda and
// verifies the public origin. Mutation commands only print plans without `--execute`.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { collectInlineScriptHashes, collectInlineScripts, listPrerenderedPages, parseAttributes } from "../../scripts/collect-inline-script-hashes.mjs";
import { SURFACE_PRELOAD_META } from "../../scripts/inject-shell-preloads.mjs";
import { applyDistributionAliases } from "./distribution-config.mjs";
import { fillScriptHashes, hasScriptHashLines, missingScriptHashes, parseScriptHashes, readEdgeConfig, rotateScriptHashes } from "./function-code.mjs";

export const PRECOMPRESSED_EXTENSIONS = new Set([".br", ".gz", ".zst"]);
/** Browsers revalidate every navigation; the edge answers from cache for a minute and refreshes in the background. */
export const HTML_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
export const NO_STORE = "no-store";
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const REVALIDATE_CACHE_CONTROL = "public, max-age=0, must-revalidate";
/** CloudFront signs Lambda origin requests without their body; POST callers send the body hash themselves. */
export const PAYLOAD_HASH_HEADER = "x-amz-content-sha256";
const NO_STORE_FILES = new Set(["build-meta.json", "sw.js"]);
/** TradingView writes a 20-hex content hash into every bundle file name, so those never change in place. */
const HASHED_CHART_BUNDLE = /^charting_library\/bundles\/[^/]+\.[0-9a-f]{20}(\.rtl)?\.[a-z0-9]+$/;
const MAX_KEYS_PER_COMMAND = 500;
/** The build copies the TradingView loader under a 16-hex content hash; the plain `charting_library.js` stays revalidated. */
const HASHED_CHART_ENTRY = /^charting_library\/charting_library\.[0-9a-f]{16}\.js$/;
/** The build injects the trade startup closure into the shell; a shell with fewer links skipped that step. */
const MIN_SHELL_PRELOADS = 20;

/** Cache policy for one object in the public directory; `null` means the file is not uploaded. */
export function objectCacheControl(relativePath) {
	const key = relativePath.replaceAll("\\", "/");
	if (PRECOMPRESSED_EXTENSIONS.has(extname(key))) return null;
	if (key.startsWith("assets/") || HASHED_CHART_BUNDLE.test(key) || HASHED_CHART_ENTRY.test(key)) return IMMUTABLE_CACHE_CONTROL;
	if (key.startsWith("charting_library/") || /^tradingview-theme-.*\.css$/.test(key)) return REVALIDATE_CACHE_CONTROL;
	if (NO_STORE_FILES.has(key)) return NO_STORE;
	if (key.endsWith(".html")) return HTML_CACHE_CONTROL;
	return REVALIDATE_CACHE_CONTROL;
}

/** HTML and build metadata go last so a viewer never receives a shell whose assets are not there yet. */
export function isLatePhaseObject(relativePath) {
	const key = relativePath.replaceAll("\\", "/");
	return key.endsWith(".html") || key === "build-meta.json";
}

export function listPublicFiles(publicDir) {
	const files = [];
	function walk(directory) {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.isFile()) files.push(relative(publicDir, path).replaceAll("\\", "/"));
		}
	}
	walk(publicDir);
	return files.sort();
}

export function planUpload(files) {
	const early = [];
	const late = [];
	for (const file of files) {
		const cacheControl = objectCacheControl(file);
		if (cacheControl === null) continue;
		(isLatePhaseObject(file) ? late : early).push({ file, cacheControl });
	}
	return { early, late };
}

function groupByCacheControl(items) {
	const groups = new Map();
	for (const item of items) {
		const group = groups.get(item.cacheControl) ?? [];
		group.push(item.file);
		groups.set(item.cacheControl, group);
	}
	return groups;
}

/** The file a viewer's navigation receives; it is always the last object an upload writes. */
export const SHELL_KEY = "_shell.html";
export const BUILD_META_KEY = "build-meta.json";

/**
 * The stages of an upload, in order. The classification is by path, through `objectCacheControl`:
 * every file under `assets/`, the TradingView bundles whose names carry a 20-hex hash and the chart
 * entry copy with a 16-hex hash are `immutable` and go through `aws s3 sync`, which skips a key that
 * is already in the bucket with the same size and a newer timestamp. Nothing checks that a name
 * really contains a hash of the content; this relies on the build never emitting different content
 * under a name it has used before in those paths (Vite names every `assets/` file by its content
 * hash). Everything else is written with `aws s3 cp`, which always uploads, so a rollback from an
 * older worktree writes it back. The build metadata goes before the shell and the shell is the last
 * command, so a run never writes the shell before the metadata.
 */
export const SYNC_STAGES = Object.freeze({
	immutable: "files classified immutable by path (sync: skipped when the copy in the bucket has the same size and is not older)",
	mutable: "other files that are not HTML (always uploaded)",
	pages: "HTML pages other than the shell (always uploaded)",
	buildMeta: BUILD_META_KEY,
	retiredPages: "retired legal page copies of this shell",
	shell: SHELL_KEY,
});

/** Characters the AWS CLI reads as wildcards in `--include` / `--exclude` filters. */
const FILTER_WILDCARDS = /[*?[\]]/;

export function assertFilterSafeKeys(files) {
	const unsafe = files.filter((file) => FILTER_WILDCARDS.test(file));
	if (unsafe.length > 0) {
		throw new Error(
			`${unsafe.length} file name(s) contain a character the AWS CLI reads as a filter wildcard (* ? [ ]): ${unsafe.join(", ")}. A filter for them could skip the file or match others, so nothing was uploaded; rename them in the build`,
		);
	}
}

/**
 * The AWS CLI joins every filter to the absolute path of the source directory before matching, so a
 * wildcard character in that path changes what `--exclude "*"` and each `--include` match: with a
 * pair of brackets in a directory name nothing is excluded and every command uploads every file.
 */
export function assertFilterSafeDirectory(publicDir) {
	const directory = resolve(publicDir);
	if (FILTER_WILDCARDS.test(directory)) {
		throw new Error(
			`The build directory ${directory} has a character the AWS CLI reads as a filter wildcard (* ? [ ]) in its absolute path. The CLI joins every --include and --exclude filter to that path, so a command could upload files that belong to another command, the shell with the immutable cache policy among them; nothing was uploaded. Build or copy the release into a directory whose absolute path has none of these characters`,
		);
	}
}

function filteredCommand(verb, { publicDir, bucket, keys, cacheControl }) {
	return [
		"s3",
		verb,
		publicDir,
		`s3://${bucket}`,
		...(verb === "cp" ? ["--recursive"] : []),
		"--exclude",
		"*",
		...keys.flatMap((key) => ["--include", key]),
		"--cache-control",
		cacheControl,
		"--no-progress",
	];
}

function singleFileCommand({ publicDir, bucket, key }) {
	return ["s3", "cp", join(publicDir, key), `s3://${bucket}/${key}`, "--cache-control", objectCacheControl(key), "--no-progress"];
}

/**
 * The ordered upload as `{ stage, command }` steps. Each `--include` is a file key, and a build
 * directory or a key that contains a filter wildcard is refused before any command is built, so
 * every filter matches exactly its own file. No command touches objects from another release and
 * none deletes anything: viewers holding an older shell keep working until their next navigation.
 */
export function buildSyncPlan({ publicDir, bucket, files }) {
	assertFilterSafeDirectory(publicDir);
	const { early, late } = planUpload(files);
	assertFilterSafeKeys([...early, ...late].map((item) => item.file));
	const steps = [];
	for (const [cacheControl, keys] of groupByCacheControl(early)) {
		const stage = cacheControl === IMMUTABLE_CACHE_CONTROL ? "immutable" : "mutable";
		steps.push({ stage, command: filteredCommand(stage === "immutable" ? "sync" : "cp", { publicDir, bucket, keys, cacheControl }) });
	}
	steps.sort((left, right) => Number(left.stage === "mutable") - Number(right.stage === "mutable"));
	const pages = late.filter((item) => item.file !== SHELL_KEY && item.file !== BUILD_META_KEY);
	for (const [cacheControl, keys] of groupByCacheControl(pages)) {
		steps.push({ stage: "pages", command: filteredCommand("cp", { publicDir, bucket, keys, cacheControl }) });
	}
	if (files.includes(BUILD_META_KEY)) steps.push({ stage: "buildMeta", command: singleFileCommand({ publicDir, bucket, key: BUILD_META_KEY }) });
	for (const command of buildRetiredPageCommands({ publicDir, bucket, files })) steps.push({ stage: "retiredPages", command });
	if (files.includes(SHELL_KEY)) steps.push({ stage: "shell", command: singleFileCommand({ publicDir, bucket, key: SHELL_KEY }) });
	return steps;
}

export function buildSyncCommands(options) {
	return buildSyncPlan(options).map((step) => step.command);
}

function stageNames(steps) {
	return [...new Set(steps.map((step) => `"${SYNC_STAGES[step.stage]}"`))];
}

/**
 * What this run knows after the command at `failedIndex` failed, and nothing more. S3 writes each
 * key atomically, so an object the failed command touched is absent, unchanged or this build's,
 * never a partial write, and a command can report a failure after its write succeeded (a lost
 * answer). The run cannot know what the bucket held before it started: an earlier interrupted run
 * may already have written some of these files, the build metadata included.
 */
export function describeSyncFailure({ plan, failedIndex, bucket }) {
	const failed = plan[failedIndex];
	const remainingStages = new Set(plan.slice(failedIndex).map((step) => step.stage));
	const completedStages = stageNames(plan.slice(0, failedIndex).filter((step) => !remainingStages.has(step.stage)));
	const partlyDone = plan.slice(0, failedIndex).some((step) => step.stage === failed.stage);
	const laterStages = stageNames(plan.slice(failedIndex + 1).filter((step) => step.stage !== failed.stage));
	const notRun = plan.slice(failedIndex + 1).filter((step) => step.stage === failed.stage).length;
	return [
		`The upload to s3://${bucket} stopped at command ${failedIndex + 1} of ${plan.length}, stage "${SYNC_STAGES[failed.stage]}".`,
		completedStages.length > 0 ? `Stages that returned success in this run: ${completedStages.join(", ")}.` : "No stage returned success in this run.",
		`${partlyDone ? "Earlier commands of the same stage returned success. " : ""}The objects of the failed command are in an unknown state: each is absent, unchanged or this build's, never a partial write.`,
		...(notRun > 0 ? [`${notRun} later command${notRun === 1 ? "" : "s"} of the same stage did not run.`] : []),
		laterStages.length > 0 ? `This run did not write the later stages: ${laterStages.join(", ")}.` : "No stage comes after it.",
		"This command does not know what the bucket held before this run: an earlier interrupted run may already have written some of these files.",
		"Run the same sync again unchanged, then verify.",
	].join(" ");
}

const CAUSE_DETAIL_LIMIT = 200;

/**
 * Why a plan command failed, in one short line. A failed `execFileSync` carries the whole command
 * line in its message, which for the first sync is one `--include` per content-hashed file; the
 * command was already printed before it ran, so only its verb, source and target are repeated.
 */
function describeCommandFailure(command, error) {
	const head = `aws ${command.slice(0, 4).join(" ")}`;
	if (typeof error?.status === "number") return `${head} exited with code ${error.status}; the aws output above this message has the reason`;
	if (typeof error?.signal === "string") return `${head} was ended by ${error.signal}`;
	const [detail] = (error instanceof Error ? error.message : String(error)).split("\n", 1);
	return `${head}: ${detail.length > CAUSE_DETAIL_LIMIT ? `${detail.slice(0, CAUSE_DETAIL_LIMIT)}…` : detail}`;
}

/** Runs the plan in order and stops at the first failure with a description of what this run wrote. */
export function runSyncPlan({ plan, bucket, run }) {
	for (const [index, step] of plan.entries()) {
		try {
			run(step.command);
		} catch (error) {
			throw new Error(`${describeSyncFailure({ plan, failedIndex: index, bucket })}\nCause: ${describeCommandFailure(step.command, error)}`);
		}
	}
}

/**
 * Standalone document pages that builds before ADR 0020 prerendered. Navigations reach the shell
 * now, but a file-like request such as `/terms/index.html` would still read the frozen copy. An
 * executing sync overwrites each of them with this build's shell instead of deleting it, so every
 * legal path answers the shell as on the official terminal, and a rollback whose older request
 * function still rewrites `/terms` to `/terms/index.html` keeps working until the older pages are
 * uploaded again. A build that still ships one of these pages keeps its own copy.
 */
export const RETIRED_PAGE_KEYS = ["cookies", "docs", "privacy", "risk", "support", "terms"].map(
	(route) => `${route}/index.html`,
);

export function buildRetiredPageCommands({ publicDir, bucket, files }) {
	return RETIRED_PAGE_KEYS.filter((key) => !files.includes(key)).map((key) => [
		"s3",
		"cp",
		join(publicDir, "_shell.html"),
		`s3://${bucket}/${key}`,
		"--cache-control",
		HTML_CACHE_CONTROL,
		"--content-type",
		"text/html; charset=utf-8",
		"--no-progress",
	]);
}

const FUNCTIONS_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "functions");
export const RESPONSE_FUNCTION_NAME = "gatu-terminal-response";
export const CLOUDFRONT_FUNCTIONS = [
	{ name: "gatu-terminal-request", file: "terminal-request.js" },
	{ name: RESPONSE_FUNCTION_NAME, file: "terminal-response.js" },
];

/** Where a release writes the response function filled with the build's inline script hashes; never the committed file. */
export function releaseFunctionPath(publicDir) {
	return resolve(publicDir, "..", "edge", "terminal-response.js");
}

/**
 * The committed response function with this build's inline script hashes as CURRENT and the live
 * function's CURRENT as PREVIOUS, so pages the edge still serves from the previous release stay
 * allowed until the invalidation and the shell's `s-maxage` have passed.
 */
export function prepareResponseFunction({ committedCode, buildHashes, liveCode = "", servedHashes = [] }) {
	if (buildHashes.length === 0) throw new Error("The build has no inline scripts; refusing to publish a policy that would allow none");
	const live = liveCode && hasScriptHashLines(liveCode) ? parseScriptHashes(liveCode) : { current: [], previous: [] };
	const sets = rotateScriptHashes({ build: buildHashes, live, served: servedHashes });
	return { code: fillScriptHashes(committedCode, sets), ...sets };
}

/** The routes a viewer can request for each prerendered page; the shell answers every client route. */
export function servedPageRoutes(publicDir) {
	return listPrerenderedPages(publicDir)
		.filter((page) => page === "_shell.html" || page.endsWith("/index.html"))
		.map((page) => (page === "_shell.html" ? "/trade/HYPE" : `/${page.slice(0, -"/index.html".length)}`));
}

/**
 * Inline script hashes of the pages the origin serves right now, so a rotation never drops them.
 * The retired legal page files are read by their file URL as well: an interrupted sync can leave one
 * of them on an older build than the shell, and navigations to `/terms` would only show the shell. A
 * bucket that never held such a file answers 404, which is skipped.
 */
export async function collectServedScriptHashes({ origin, publicDir, fetchImpl = fetch }) {
	const base = origin.replace(/\/+$/, "");
	const hashes = new Set();
	const headers = { accept: "text/html", "cache-control": "no-cache" };
	for (const route of servedPageRoutes(publicDir)) {
		const response = await fetchImpl(`${base}${route}`, { headers });
		if (!response.ok) throw new Error(`${route} answered ${response.status} while reading the served inline script hashes`);
		for (const script of collectInlineScripts(await response.text())) hashes.add(script.hash);
	}
	for (const key of RETIRED_PAGE_KEYS) {
		const response = await fetchImpl(`${base}/${key}`, { headers });
		if (response.status === 404) continue;
		if (!response.ok) throw new Error(`/${key} answered ${response.status} while reading the served inline script hashes`);
		for (const script of collectInlineScripts(await response.text())) hashes.add(script.hash);
	}
	return [...hashes].sort();
}

function functionComment(file) {
	return file === "terminal-request.js" ? "sairn shell rewrite" : "sairn route marker + csp";
}

/**
 * Updates a CloudFront Function from its file and publishes it to LIVE. `update-function` needs the
 * current ETag and `publish-function` the ETag the update returned, so the caller re-reads it in
 * between; the returned publish command ends with a placeholder for that value.
 */
export function buildFunctionUpdateCommands({ name, file, etag, comment }) {
	return [
		["cloudfront", "update-function", "--name", name, "--if-match", etag, "--function-config", `Comment=${comment},Runtime=cloudfront-js-2.0`, "--function-code", `fileb://${file}`],
		["cloudfront", "publish-function", "--name", name, "--if-match", "<updated-etag>"],
	];
}

async function releaseFunctions({ publicDir, functionsDir, origin, execute }) {
	const functions = CLOUDFRONT_FUNCTIONS.map((definition) => {
		const path = resolve(functionsDir, definition.file);
		if (!existsSync(path)) throw new Error(`No CloudFront Function code at ${path}`);
		return { ...definition, path, code: readFileSync(path, "utf8") };
	});
	const response = functions.find(({ name }) => name === RESPONSE_FUNCTION_NAME);
	if (!existsSync(join(publicDir, SHELL_KEY))) {
		throw new Error(`No ${SHELL_KEY} in ${publicDir}; the response function needs the build's inline script hashes`);
	}
	const buildHashes = collectInlineScriptHashes(publicDir).hashes;
	let prepared = prepareResponseFunction({ committedCode: response.code, buildHashes });
	response.path = releaseFunctionPath(publicDir);
	if (execute) {
		if (!origin) console.warn("No --origin given: the served pages' hashes are not checked; pass the CloudFront origin so a rotation cannot drop a page still online");
		const servedHashes = origin ? await collectServedScriptHashes({ origin, publicDir }) : [];
		prepared = prepareResponseFunction({ committedCode: response.code, buildHashes, liveCode: readLiveFunctionCode(response.name), servedHashes });
		response.code = prepared.code;
		mkdirSync(dirname(response.path), { recursive: true });
		writeFileSync(response.path, response.code);
		console.log(`Rendered ${response.path}: ${prepared.current.length} current + ${prepared.previous.length} previous inline script hashes`);
	} else {
		response.code = prepared.code;
		console.log(`Would render ${response.path} with ${prepared.current.length} current inline script hashes; execution reads the live function${origin ? ` and samples served pages at ${origin}` : ""}`);
	}
	const published = [];
	for (const { name, path, file, code } of functions) {
		let stage = "describe-function";
		let etag;
		let updatedEtag;
		let update;
		let publish;
		try {
			etag = execute ? readFunctionEtag(name) : "<etag>";
			[update, publish] = buildFunctionUpdateCommands({ name, file: path, etag, comment: functionComment(file) });
			stage = "update-function";
			runAws(update, execute);
			stage = "describe-function after the update";
			updatedEtag = execute ? readFunctionEtag(name) : "<updated-etag>";
			stage = "publish-function";
			publish = [...publish.slice(0, -1), updatedEtag];
			runAws(publish, execute);
			if (execute) published.push(`${name}: publish-function returned success.`);
		} catch (error) {
			throw new Error(describeFunctionFailure({ name, stage, code, etag, updatedEtag, published, cause: describeCommandFailure(stage === "update-function" ? update : stage === "publish-function" ? publish : ["cloudfront", "describe-function", "--name", name], error) }));
		}
	}
}

const FUNCTION_STAGE_STATUS = {
	"describe-function": "this run did not update or publish it.",
	"update-function": "its DEVELOPMENT code is in an unknown state (the update may have been applied although the command failed); this run did not publish it.",
	"describe-function after the update": "update-function returned success; this run did not publish it.",
	"publish-function": "update-function returned success; whether LIVE now runs the planned code is unknown.",
};

/**
 * What a failed `functions` run knows: which function returned success, where the failing one
 * stopped and the digest of the code it meant to publish. Publishing the same build again keeps the
 * live PREVIOUS hashes (`rotateScriptHashes`), so the same command can be run again once nothing else
 * is changing the functions.
 */
export function describeFunctionFailure({ name, stage, code, etag, updatedEtag, published = [], cause }) {
	return [
		...published,
		`${name}: ${stage} failed; ${FUNCTION_STAGE_STATUS[stage]}`,
		`Planned code SHA-256 for ${name}: ${sha256(code)}.`,
		...(etag ? [`ETag read before the update: ${etag}.`] : []),
		...(updatedEtag ? [`ETag read before the publish: ${updatedEtag}.`] : []),
		"Do not run lambda or sync yet. Compare the code of both functions in DEVELOPMENT and LIVE with the planned code (aws cloudfront get-function --name <name> --stage LIVE <file>, then shasum -a 256 <file>).",
		"Then run the same functions command again: it updates and publishes both functions from the same build, and publishing the same build keeps the live PREVIOUS hashes.",
		`Cause: ${cause}`,
	].join("\n");
}

function readFunctionEtag(name) {
	const { ETag } = readAwsJson(["cloudfront", "describe-function", "--name", name]);
	if (typeof ETag !== "string" || !ETag) throw new Error("AWS did not return an ETag");
	return ETag;
}

function chunk(items, size) {
	const chunks = [];
	for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
	return chunks;
}

/**
 * `aws s3 sync` skips unchanged files, so a cache policy change never reaches objects that are
 * already in the bucket. This rewrites the metadata of the selected objects with an in-bucket copy
 * (`--metadata-directive REPLACE`), grouped by cache policy and bounded per command. It never
 * uploads a local body: a shell or page must only reach the bucket through `sync`, which checks the
 * live edge policy and uploads assets first.
 */
export function buildReuploadCommands({ bucket, files, prefixes }) {
	const selected = files.filter((file) => prefixes.some((prefix) => file === prefix || file.startsWith(prefix)));
	const { early, late } = planUpload(selected);
	const commands = [];
	for (const phase of [early, late]) {
		for (const [cacheControl, keys] of groupByCacheControl(phase)) {
			for (const keyChunk of chunk(keys, MAX_KEYS_PER_COMMAND)) {
				const includes = keyChunk.flatMap((key) => ["--include", key]);
				commands.push([
					"s3",
					"cp",
					`s3://${bucket}`,
					`s3://${bucket}`,
					"--recursive",
					"--exclude",
					"*",
					...includes,
					"--metadata-directive",
					"REPLACE",
					"--cache-control",
					cacheControl,
					"--no-progress",
				]);
			}
		}
	}
	return commands;
}

export function buildInvalidationCommand(distributionId) {
	return ["cloudfront", "create-invalidation", "--distribution-id", distributionId, "--paths", "/*"];
}

/**
 * The only fields of a Lambda FunctionConfiguration a release prints. The full configuration that
 * `update-function-code` returns includes `Environment.Variables`, which hold the IPdata API key.
 */
export const LAMBDA_UPDATE_FIELDS = Object.freeze(["Version", "CodeSize", "CodeSha256", "State", "LastUpdateStatus"]);

export function buildLambdaCommands({ functionName, zipPath }) {
	const query = `{${LAMBDA_UPDATE_FIELDS.map((field) => `${field}: ${field}`).join(", ")}}`;
	return [
		["lambda", "update-function-code", "--function-name", functionName, "--zip-file", `fileb://${zipPath}`, "--publish", "--query", query, "--output", "json"],
		["lambda", "wait", "function-updated", "--function-name", functionName],
	];
}

/** One line from the update's answer, built from the allowed fields alone, whatever the answer holds. */
export function summarizeLambdaUpdate(output) {
	let parsed;
	try {
		parsed = JSON.parse(output);
	} catch {
		return "Lambda updated (the answer was not JSON and is not printed)";
	}
	const fields = LAMBDA_UPDATE_FIELDS.filter((field) => typeof parsed?.[field] === "string" || typeof parsed?.[field] === "number").map(
		(field) => `${field}=${parsed[field]}`,
	);
	return `Lambda updated: ${fields.join(" ")}`;
}

/** Whitespace, block comments or line comments, any number, as minified or hand-written code may put between a keyword and its specifier. */
const GAP = String.raw`(?:\s|/\*[\s\S]*?\*/|//[^\n]*(?:\n|$))*`;
const RELATIVE_IMPORT = new RegExp(String.raw`(?:\bfrom|\bimport${GAP}\(?)${GAP}(["'\`])(\.{1,2}/[^"'\`]*)\1`, "g");

/**
 * Relative module specifiers in a bundled entry; the release zips the entry file alone, so any of
 * them would be missing at run time. This is a text scan, not a parser, and it errs on the side of
 * refusing: a string such as `"from './x'"` inside the bundle also matches, which stops the upload
 * with a clear message rather than letting a split chunk through. The directory check
 * (`findExtraLambdaModules`) does not depend on syntax at all. It is not a parser and is not meant
 * to become one: forms such as `createRequire` reading a relative file are deliberately not
 * scanned. The last net is the probe right after the update, which fails when the uploaded entry
 * cannot load what it needs.
 */
export function findRelativeImports(code) {
	return [...new Set([...code.matchAll(RELATIVE_IMPORT)].map((match) => match[2]))];
}

const MODULE_FILE = /\.(?:mjs|cjs|js)$/i;

/**
 * Module files in the Lambda output directory other than the entries. `vite.lambda.config.ts`
 * empties `dist-lambda`, emits the two entries at its top level and names any shared chunk
 * `shared-[name].mjs`; the release adds only `.zip` files. Any other `.mjs`, `.js` or `.cjs`
 * file, at any depth and in any letter case, means the build split code out of an entry.
 */
export function findExtraLambdaModules(files, entries = LAMBDA_ENTRIES) {
	return files.filter((file) => MODULE_FILE.test(file) && !entries.includes(file));
}

/**
 * Files and symbolic links in the Lambda output directory, relative to it. Symbolic links are listed
 * apart because the walk does not follow them and the zip would carry whatever they point at.
 */
export function listLambdaOutput(directory) {
	const files = [];
	const symlinks = [];
	function walk(current) {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const path = join(current, entry.name);
			const name = relative(directory, path).replaceAll("\\", "/");
			if (entry.isSymbolicLink()) symlinks.push(name);
			else if (entry.isDirectory()) walk(path);
			else if (entry.isFile()) files.push(name);
		}
	}
	walk(directory);
	return { files: files.sort(), symlinks: symlinks.sort() };
}

export function assertNoExtraLambdaModules({ files, symlinks = [] }, entries = LAMBDA_ENTRIES) {
	if (symlinks.length > 0) {
		throw new Error(`The Lambda output holds symbolic links (${symlinks.join(", ")}); the build writes plain files only, so refusing to package it`);
	}
	const extra = findExtraLambdaModules(files, entries);
	if (extra.length > 0) {
		throw new Error(
			`The Lambda output holds ${extra.join(", ")} next to ${entries.join(", ")}; the build split a chunk out of an entry and the zip would carry the entry alone. Rebuild without shared chunks before uploading`,
		);
	}
}

export function assertSelfContainedLambdaEntry(code, entry) {
	const relative = findRelativeImports(code);
	if (relative.length > 0) {
		throw new Error(
			`${entry} imports ${relative.join(", ")}; the build split a shared chunk out of it and the zip would carry ${entry} alone. Keep the Lambda entries free of shared chunks before uploading`,
		);
	}
}

/** The Lambda bundles `build:lambda` emits; `check-lambda` and CI check each of them. */
export const LAMBDA_ENTRIES = Object.freeze(["index.mjs", "csp-report.mjs"]);

/**
 * Asks the public origin whether the API function answers right after an update. Both networks share
 * one function and it serves `$LATEST`, so a broken package fails every geo check at once; the probe
 * retries a few times only to ride out a single transient error.
 */
export async function probeApiAfterLambdaUpdate({
	origin,
	fetchImpl = fetch,
	attempts = 3,
	delayMs = 3_000,
	requestTimeoutMs = API_REQUEST_TIMEOUT_MS,
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
	const base = origin.replace(/\/+$/, "");
	let results = [];
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		results = [];
		for (const [name, run] of API_CHECKS) results.push(await settleCheck(name, () => run(base, fetchImpl, requestTimeoutMs)));
		if (results.every((result) => result.ok)) return { attempt, results };
		if (attempt < attempts) await sleep(delayMs);
	}
	const failures = results.filter((result) => !result.ok).map((result) => `${result.name}: ${result.detail}`);
	throw new Error(
		`The API function does not answer through ${base} after the update (${failures.join("; ")}). Both networks run this package now and fail closed on /api/geo. Upload the previous release's package with: node deploy/cloudfront/deploy.mjs lambda --function-name <name> --lambda-dir <previous release worktree>/apps/terminal/dist-lambda --origin ${base} --execute`,
	);
}

function assertLambdaProbeTarget({ origin, skipProbe }) {
	if (!origin && !skipProbe) {
		throw new Error("lambda --execute needs --origin to probe /api/health and /api/geo after the update (or --skip-probe for a function that does not serve them)");
	}
}

/**
 * Checks the bundle, zips it, updates the function, waits for the update and probes the origin, in
 * that order. Every side effect is injected so the order and the printed output can be tested.
 */
export async function releaseLambda({ functionName, bundle, zipPath, origin, skipProbe = false, execute, readBundle, listBundleDir, zip, run, capture, probe, log = console.log }) {
	const entry = bundle.split(/[\\/]/).at(-1);
	assertNoExtraLambdaModules(listBundleDir(), [...new Set([...LAMBDA_ENTRIES, entry])]);
	assertSelfContainedLambdaEntry(readBundle(bundle), entry);
	if (execute) assertLambdaProbeTarget({ origin, skipProbe });
	log(`zip -j ${zipPath} ${bundle}`);
	const [update, wait] = buildLambdaCommands({ functionName, zipPath });
	if (execute) {
		let expectedHash;
		try {
			expectedHash = zip(zipPath, bundle);
		} catch (error) {
			throw new Error(`Lambda ${functionName}: zip failed, so the function was not updated. Fix the local error and run the same command again. Cause: ${error instanceof Error ? error.message : String(error)}`);
		}
		let stage = "update-function-code";
		try {
			log(summarizeLambdaUpdate(capture(update, execute)));
			stage = "wait function-updated";
			run(wait, execute);
		} catch (error) {
			throw new Error(describeLambdaFailure({ functionName, stage, expectedHash, cause: describeCommandFailure(stage === "update-function-code" ? update : wait, error) }));
		}
	} else {
		capture(update, execute);
		run(wait, execute);
	}
	if (skipProbe) {
		log("Probe skipped (--skip-probe)");
		return;
	}
	if (!origin) {
		log("No --origin given: an executing update would refuse to run without the probe");
		return;
	}
	if (!execute) {
		log(`After the update: probe ${origin.replace(/\/+$/, "")}/api/health and /api/geo`);
		return;
	}
	const { attempt, results } = await probe(origin);
	log(`API probe through ${origin} passed${attempt > 1 ? ` on attempt ${attempt}` : ""}: ${results.map((result) => `${result.name}${result.detail ? ` (${result.detail})` : ""}`).join(", ")}`);
}

const LAMBDA_STAGE_STATUS = {
	"update-function-code": "the update may or may not have been applied (a command can fail after AWS accepted it); this run did not wait or probe.",
	"wait function-updated": "update-function-code returned success, but the waiter did not see LastUpdateStatus=Successful; this run did not probe.",
};

/**
 * What a failed Lambda update knows, and the one read-only command that tells the rest. The query
 * keeps the answer to status fields: the full configuration holds the environment variables.
 */
export function describeLambdaFailure({ functionName, stage, expectedHash, cause }) {
	const query = "{Version: Version, RevisionId: RevisionId, CodeSha256: CodeSha256, State: State, LastUpdateStatus: LastUpdateStatus, LastUpdateStatusReason: LastUpdateStatusReason}";
	return [
		`Lambda ${functionName}: ${stage} failed; ${LAMBDA_STAGE_STATUS[stage]}`,
		`Do not run sync yet. Read the function's state, never without --query: aws lambda get-function-configuration --function-name ${functionName} --query "${query}" --output json --profile <the aws profile printed above>`,
		`CodeSha256 ${expectedHash} means $LATEST runs this package; any other value means it does not.`,
		"Once LastUpdateStatus is no longer InProgress, run the same lambda command again: it uploads this package again, waits and probes. If LastUpdateStatus is Failed, LastUpdateStatusReason says why.",
		`Cause: ${cause}`,
	].join("\n");
}

function findChartBundle(publicDir) {
	const directory = join(publicDir, "charting_library", "bundles");
	if (!existsSync(directory)) return undefined;
	const files = readdirSync(directory).filter((file) => HASHED_CHART_BUNDLE.test(`charting_library/bundles/${file}`));
	return files.find((file) => file.startsWith("runtime.")) ?? files.find((file) => file.endsWith(".js"));
}

function sha256(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}

function expectThat(condition, message) {
	if (!condition) throw new Error(message);
}

async function settleCheck(name, run) {
	try {
		const detail = await run();
		return { name, ok: true, detail: detail ?? "" };
	} catch (error) {
		return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * One deadline for a request and the reading of its body. Every API check asks this many
 * milliseconds at most per request, so the post-update probe ends within
 * `attempts × (checks × timeout) + (attempts − 1) × delay` (3 × 2 × 10 s + 2 × 3 s by default).
 */
export const API_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Fetches `url` and reads its body as text before `timeoutMs` passes. The signal aborts a fetch that
 * honours it; the timer settles the race even when the fetch implementation or the body ignores it.
 */
async function fetchTextWithin(fetchImpl, url, init, timeoutMs) {
	const controller = new AbortController();
	let timer;
	const deadline = new Promise((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new Error(`no answer from ${new URL(url).pathname} within ${timeoutMs} ms`));
		}, timeoutMs);
	});
	try {
		return await Promise.race([
			(async () => {
				const response = await fetchImpl(url, { ...init, signal: controller.signal });
				return { status: response.status, headers: response.headers, text: await response.text() };
			})(),
			deadline,
		]);
	} finally {
		clearTimeout(timer);
	}
}

const STARTUP_RELATIONS = new Set(["modulepreload", "preload", "stylesheet"]);
const ASSET_MEDIA_TYPES = {
	".css": new Set(["text/css"]),
	".html": new Set(["text/html"]),
	".js": new Set(["text/javascript", "application/javascript", "application/x-javascript"]),
	".woff": new Set(["font/woff", "application/font-woff"]),
	".woff2": new Set(["font/woff2"]),
};

function isSameOriginPath(href) {
	return typeof href === "string" && href.startsWith("/") && !href.startsWith("//");
}

function readStartupAssets(html) {
	const assets = new Set();
	const modules = new Set();
	const metaLists = new Map();
	const markup = html.replace(/<!--[\s\S]*?-->/g, "");
	for (const [, scriptAttrs, tag, attrs] of markup.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script\s*>|<(link|meta)\b([^>]*)>/gi)) {
		const attributes = parseAttributes(scriptAttrs ?? attrs);
		if (scriptAttrs !== undefined) {
			const src = attributes.get("src");
			if (isSameOriginPath(src)) assets.add(src);
		} else if (tag.toLowerCase() === "link") {
			const relations = attributes.get("rel")?.toLowerCase().split(/\s+/) ?? [];
			const href = attributes.get("href");
			if (!isSameOriginPath(href) || !relations.some((rel) => STARTUP_RELATIONS.has(rel))) continue;
			if (relations.includes("modulepreload") && href.startsWith("/assets/")) modules.add(href);
			if (!HASHED_CHART_ENTRY.test(href.slice(1))) assets.add(href);
		} else {
			const name = attributes.get("name");
			if (!Object.values(SURFACE_PRELOAD_META).includes(name)) continue;
			expectThat(!metaLists.has(name), `the local shell lists ${name} more than once`);
			metaLists.set(name, (attributes.get("content") ?? "").split(/\s+/).filter(Boolean));
		}
	}
	expectThat(modules.size >= MIN_SHELL_PRELOADS, `only ${modules.size} modulepreload links in the local shell`);
	for (const name of [SURFACE_PRELOAD_META.desktop, SURFACE_PRELOAD_META.mobile, SURFACE_PRELOAD_META.chart]) {
		expectThat(metaLists.has(name), `the local shell has no ${name} metadata`);
	}
	const catalogs = metaLists.get(SURFACE_PRELOAD_META.catalogs);
	if (catalogs) expectThat(catalogs.length > 0, `the local shell lists no locale catalogs in ${SURFACE_PRELOAD_META.catalogs}`);
	for (const paths of metaLists.values()) for (const href of paths) assets.add(href);
	return { assets: [...assets], moduleCount: modules.size };
}

async function checkPublishedAsset(href, publicDir, fetchAsset) {
	expectThat(/^\/(?:[\w.@+-]+\/)*[\w.@+-]+$/.test(href) && !href.split("/").some((part) => part === "." || part === ".."), `invalid startup asset path ${href}`);
	const key = href.slice(1);
	const localPath = join(publicDir, key);
	expectThat(existsSync(localPath), `${href} is not in the local build`);
	const localHash = sha256(readFileSync(localPath));
	const response = await fetchAsset(href);
	expectThat(response.status === 200, `${href} status ${response.status}`);
	const type = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
	expectThat(ASSET_MEDIA_TYPES[extname(key)]?.has(type), `${href} has unexpected content-type ${type ?? "missing"}`);
	const cache = response.headers.get("cache-control");
	expectThat(cache === objectCacheControl(key), `${href} has unexpected cache-control ${cache}`);
	expectThat(sha256(Buffer.from(await response.arrayBuffer())) === localHash, `${href} body differs from the local build`);
}

function readReferralDecision(text) {
	const decision = JSON.parse(text);
	expectThat(Number.isFinite(decision?.checkedAt), "referral decision has no checkedAt");
	if (decision.status === "unavailable") {
		const reason = /^(budget_exhausted|invalid_response|missing_config|missing_ip|provider_error)$/.test(decision.reason) ? decision.reason : "unrecognized reason";
		throw new Error(`referral geo unavailable (${reason})`);
	}
	expectThat(decision.status === "allowed" || decision.status === "blocked", "referral decision has an unknown status");
	expectThat(typeof decision.country === "string" && /^[A-Z]{2}$/.test(decision.country), "referral decision has no country");
	if (decision.status === "allowed") expectThat(Number.isFinite(decision.ttlMs) && decision.ttlMs > 0, "allowed referral decision has no positive ttlMs");
	else expectThat(decision.reason === "proxy" || decision.reason === "jurisdiction", "blocked referral decision has no valid reason");
	return `status ${decision.status}`;
}

async function checkGeoVerdict(base, fetchImpl, timeoutMs = API_REQUEST_TIMEOUT_MS) {
	const response = await fetchTextWithin(fetchImpl, `${base}/api/geo`, { headers: { accept: "application/json" } }, timeoutMs);
	expectThat(response.status === 200, `status ${response.status}: ${response.text.slice(0, 120)}`);
	const verdict = JSON.parse(response.text);
	expectThat(typeof verdict?.country === "string" && /^[A-Z]{2}$/.test(verdict.country), "verdict has no country");
	expectThat(typeof verdict.proxy === "boolean" && typeof verdict.tradeRestricted === "boolean", "verdict must include boolean proxy and tradeRestricted");
	return `country ${verdict.country}`;
}

async function checkHealthProbe(base, fetchImpl, timeoutMs = API_REQUEST_TIMEOUT_MS) {
	const response = await fetchTextWithin(fetchImpl, `${base}/api/health`, {}, timeoutMs);
	expectThat(response.status === 204, `status ${response.status}`);
	expectThat(response.headers.get("cache-control") === NO_STORE, `cache-control ${response.headers.get("cache-control")}`);
}

/** The checks `verify` and the post-update Lambda probe share. */
const API_CHECKS = [
	["health probe answers 204", checkHealthProbe],
	["geo endpoint answers with a real verdict", checkGeoVerdict],
];

/**
 * Checks the public origin exactly the way the old Node health check did, but through CloudFront:
 * shell parity with the local build, security and preconnect headers, the live geo
 * endpoint, referral deep-link headers, and 404s for missing files.
 */
export async function verifyDeployment({ origin, publicDir, network, fetchImpl = fetch, scriptHashesMode = "report-only", imageSourcesMode = "report-only", requestTimeoutMs = API_REQUEST_TIMEOUT_MS }) {
	const base = origin.replace(/\/+$/, "");
	const deadlines = new Set();
	/**
	 * Every other request of verify carries its own deadline as an abort signal, which ends a fetch,
	 * or the reading of its body, that hangs. The timers are ordinary ones (`AbortSignal.timeout`
	 * does not keep the event loop alive) and `check` clears them when its check settles.
	 */
	function request(url, init = {}) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(new Error(`no answer from ${new URL(url).pathname} within ${requestTimeoutMs} ms`)), requestTimeoutMs);
		deadlines.add(timer);
		return fetchImpl(url, { ...init, signal: controller.signal });
	}
	const expectedApiOrigin = network === "testnet" ? "https://api.hyperliquid-testnet.xyz" : "https://api.hyperliquid.xyz";
	const shell = readFileSync(join(publicDir, "_shell.html"));
	const buildMeta = JSON.parse(readFileSync(join(publicDir, "build-meta.json"), "utf8"));
	const results = [];
	async function check(name, run) {
		try {
			results.push(await settleCheck(name, run));
		} finally {
			for (const timer of deadlines) clearTimeout(timer);
			deadlines.clear();
		}
	}
	const expect = expectThat;

	await check("shell for a trade navigation", async () => {
		const response = await request(`${base}/trade/HYPE`, { headers: { accept: "text/html" } });
		expect(response.status === 200, `status ${response.status}`);
		expect(sha256(Buffer.from(await response.arrayBuffer())) === sha256(shell), "body differs from local _shell.html");
		expect(response.headers.get("content-security-policy"), "missing content-security-policy");
		const link = response.headers.get("link") ?? "";
		expect(link.includes(`<${expectedApiOrigin}>`) && link.includes("preconnect"), `missing ${expectedApiOrigin} preconnect`);
		return `csp ok, preconnect ${expectedApiOrigin}`;
	});
	await check("legal pages match the build", async () => {
		const summary = { shell: 0, standalone: 0 };
		for (const key of RETIRED_PAGE_KEYS) {
			const localPage = join(publicDir, key);
			const standalone = existsSync(localPage);
			const expected = sha256(standalone ? readFileSync(localPage) : shell);
			const expectedName = standalone ? `local ${key}` : "local _shell.html";
			const route = `/${key.slice(0, -"/index.html".length)}`;
			for (const path of [route, `/${key}`]) {
				const response = await request(`${base}${path}`, { headers: { accept: "text/html" } });
				expect(response.status === 200, `${path} status ${response.status}`);
				expect(sha256(Buffer.from(await response.arrayBuffer())) === expected, `${path} body differs from ${expectedName}`);
			}
			summary[standalone ? "standalone" : "shell"] += 1;
		}
		return `${summary.shell} shell, ${summary.standalone} standalone`;
	});
	await check("build metadata parity", async () => {
		const response = await request(`${base}/build-meta.json`);
		expect(response.status === 200, `status ${response.status}`);
		const remote = await response.json();
		expect(remote.commit === buildMeta.commit && remote.release === buildMeta.release, "remote build-meta differs");
		const localGates = describeGateState(releaseGateState(buildMeta));
		const remoteGates = describeGateState(releaseGateState(remote));
		expect(remoteGates === localGates, `remote release gates (${remoteGates}) differ from the local build (${localGates})`);
		const differing = [...new Set([...Object.keys(remote), ...Object.keys(buildMeta)])].filter((key) => !isDeepStrictEqual(remote[key], buildMeta[key]));
		expect(differing.length === 0, `remote build-meta differs from the local build in ${differing.join(", ")}`);
		return `${remote.commit.slice(0, 8)} / ${remote.release} / ${remoteGates}`;
	});
	await check("geo endpoint answers with a real verdict", () => checkGeoVerdict(base, fetchImpl, requestTimeoutMs));
	let referralReply;
	await check("signed lambda post with a payload hash", async () => {
		const body = JSON.stringify({ override: null });
		const response = await request(`${base}/api/referral-geo`, {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				origin: base,
				"sec-fetch-site": "same-origin",
				[PAYLOAD_HASH_HEADER]: sha256(Buffer.from(body, "utf8")),
			},
			body,
		});
		const text = await response.text();
		expect(response.status === 200, `status ${response.status}: ${text.slice(0, 120)}`);
		referralReply = text;
		return `HTTP ${response.status}`;
	});
	await check("referral geo answers with a decision", () => {
		expect(referralReply !== undefined, "the signed POST did not complete successfully");
		return readReferralDecision(referralReply);
	});
	await check("referral deep link headers", async () => {
		const response = await request(`${base}/join/__sairn_healthcheck__`, { headers: { accept: "text/html" } });
		expect(response.status === 200, `status ${response.status}`);
		expect(response.headers.get("cache-control") === "no-store", "cache-control must be no-store");
		expect(response.headers.get("referrer-policy") === "no-referrer", "referrer-policy must be no-referrer");
		expect((response.headers.get("x-robots-tag") ?? "").includes("noindex"), "x-robots-tag must be noindex");
		expect(response.headers.get("x-sairn-route") === "referral-join", "x-sairn-route marker missing");
	});
	await check("pairing page headers", async () => {
		const response = await request(`${base}/mobile-agent-sync`, { headers: { accept: "text/html" } });
		expect(response.status === 200, `status ${response.status}`);
		expect(response.headers.get("cache-control") === "no-store", "cache-control must be no-store");
		expect(response.headers.get("referrer-policy") === "no-referrer", "referrer-policy must be no-referrer");
		expect(response.headers.get("x-sairn-route") === "mobile-agent-sync", "x-sairn-route marker missing");
	});
	await check("missing files stay 404", async () => {
		for (const path of ["/missing.webmanifest", "/.env"]) {
			const response = await request(`${base}${path}`);
			expect(response.status === 404, `${path} status ${response.status}`);
		}
		const asset = await request(`${base}/assets/missing-${Date.now()}.js`);
		expect(asset.status === 404, `asset status ${asset.status}`);
		const chart = await request(`${base}/charting_library/missing-${Date.now()}.js`);
		expect(chart.status === 404, `chart status ${chart.status}`);
		const serverFn = await request(`${base}/_serverFn/abc`);
		expect(serverFn.status === 404, `server function status ${serverFn.status}`);
	});
	const fetchAsset = (href) => request(`${base}${href}`, { redirect: "error" });
	await check("chart entry is immutable and preloaded by the shell", async () => {
		const href = /<link rel="preload" href="(\/charting_library\/charting_library\.[0-9a-f]{16}\.js)" as="script"/.exec(shell.toString("utf8"))?.[1];
		expect(href, "the local shell does not preload a content-hashed chart entry");
		await checkPublishedAsset(href, publicDir, fetchAsset);
		const plain = await request(`${base}/charting_library/charting_library.js`);
		expect(plain.headers.get("cache-control") === REVALIDATE_CACHE_CONTROL, `unhashed entry cache-control ${plain.headers.get("cache-control")}`);
		return href;
	});
	await check("shell preloads the startup closure", async () => {
		const { assets, moduleCount } = readStartupAssets(shell.toString("utf8"));
		const batchSize = 8;
		for (let start = 0; start < assets.length; start += batchSize) {
			const batch = assets.slice(start, start + batchSize);
			const results = await Promise.allSettled(batch.map((href) => checkPublishedAsset(href, publicDir, fetchAsset)));
			const failures = results.filter((result) => result.status === "rejected");
			expect(failures.length === 0, failures.map((result) => result.reason.message).join("; "));
		}
		return `${moduleCount} modulepreload links, ${assets.length} assets verified`;
	});
	await check("service worker matches the build", () => checkPublishedAsset("/sw.js", publicDir, fetchAsset));
	await check("inline scripts are allowed by the edge policy", async () => {
		const pages = listPrerenderedPages(publicDir).filter((page) => page === "_shell.html" || page.endsWith("/index.html"));
		const headerName = scriptHashesMode === "enforce" ? "content-security-policy" : "content-security-policy-report-only";
		let total = 0;
		for (const page of pages) {
			const route = page === "_shell.html" ? "/trade/HYPE" : `/${page.slice(0, -"/index.html".length)}`;
			const response = await request(`${base}${route}`, { headers: { accept: "text/html" } });
			expect(response.status === 200, `${route} status ${response.status}`);
			const hashes = collectInlineScripts(await response.text()).map((script) => script.hash);
			const scriptSrc = /(?:^|;\s*)script-src ([^;]*)/.exec(response.headers.get(headerName) ?? "")?.[1];
			expect(scriptSrc !== undefined, `${route} has no ${headerName} with a script-src`);
			for (const hash of hashes) expect(scriptSrc.includes(`'${hash}'`), `${route}: ${headerName} does not allow inline script ${hash}`);
			if (scriptHashesMode === "enforce") expect(!scriptSrc.includes("'unsafe-inline'"), `${route}: script-src still allows 'unsafe-inline'`);
			total += hashes.length;
		}
		return `${pages.length} pages, ${total} inline scripts, ${scriptHashesMode}`;
	});
	await check("image sources follow the edge config", async () => {
		const response = await request(`${base}/trade/HYPE`, { headers: { accept: "text/html" } });
		const headerName = imageSourcesMode === "enforce" ? "content-security-policy" : "content-security-policy-report-only";
		const imgSrc = /(?:^|;\s*)img-src ([^;]*)/.exec(response.headers.get(headerName) ?? "")?.[1];
		expect(imgSrc !== undefined, `no ${headerName} with an img-src`);
		const sources = imgSrc.split(" ");
		expect(sources.includes("'self'") && !sources.includes("https:"), `${headerName} img-src still allows any https origin: ${imgSrc}`);
		return `${sources.length} sources, ${imageSourcesMode}`;
	});
	await check("health probe answers 204", () => checkHealthProbe(base, fetchImpl, requestTimeoutMs));
	await check("shell repeats from the edge", async () => {
		await request(`${base}/trade/HYPE`, { headers: { accept: "text/html" } });
		const response = await request(`${base}/trade/HYPE`, { headers: { accept: "text/html" } });
		expect(response.headers.get("cache-control") === HTML_CACHE_CONTROL, `cache-control ${response.headers.get("cache-control")}`);
		const cache = response.headers.get("x-cache") ?? "";
		expect(/^(Hit|RefreshHit) from cloudfront/.test(cache), `x-cache ${cache || "missing"}`);
		return cache;
	});
	await check("chart bundles are immutable at the edge", async () => {
		const bundle = findChartBundle(publicDir);
		expect(bundle, "no hashed chart bundle in the local build");
		await request(`${base}/charting_library/bundles/${bundle}`);
		const response = await request(`${base}/charting_library/bundles/${bundle}`);
		expect(response.status === 200, `status ${response.status}`);
		expect(response.headers.get("cache-control") === IMMUTABLE_CACHE_CONTROL, `cache-control ${response.headers.get("cache-control")}`);
		const cache = response.headers.get("x-cache") ?? "";
		expect(/^(Hit|RefreshHit) from cloudfront/.test(cache), `x-cache ${cache || "missing"}`);
		return `${bundle} ${cache}`;
	});
	if (network === "testnet") {
		await check("testnet stays out of search results", async () => {
			const response = await request(`${base}/trade/HYPE`, { headers: { accept: "text/html" } });
			expect((response.headers.get("x-robots-tag") ?? "").includes("noindex"), "x-robots-tag must be noindex");
		});
	}
	return results;
}

export const DEFAULT_RELEASE_PROFILE = "gatu-edge";

/** The AWS CLI profile for every command: `--profile`, else `AWS_PROFILE`, else the release user. */
export function resolveAwsProfile({ profile, env = process.env }) {
	const chosen = (profile ?? env.AWS_PROFILE ?? DEFAULT_RELEASE_PROFILE).trim();
	if (!chosen) throw new Error("An AWS profile name is required");
	return chosen;
}

/** Releases run as the restricted IAM user, never as the account root; see deploy/cloudfront/iam/. */
export function assertReleaseIdentity(identityArn) {
	if (typeof identityArn !== "string" || identityArn.length === 0) throw new Error("Could not read the AWS caller identity");
	if (/:root$/.test(identityArn)) throw new Error(`Refusing to release as the account root (${identityArn}); use the ${DEFAULT_RELEASE_PROFILE} IAM user`);
	if (!/:(user|assumed-role)\//.test(identityArn)) throw new Error(`Unexpected release identity ${identityArn}`);
	return identityArn;
}

let awsProfile;

function parseOrigin(value) {
	let url;
	try {
		url = new URL(value);
	} catch {}
	if (!url || !/^https?:\/\/[^/\\]/i.test(value) || /[\\\s]/.test(value) || url.username || url.password || url.pathname !== "/" || /[?#]/.test(value)) {
		throw new Error("--origin must be an absolute HTTP(S) origin without credentials, path, query or fragment");
	}
	return url.origin;
}

function readArgs(command, args) {
	const { required, optional } = COMMAND_OPTIONS[command];
	const allowed = new Set([...required, ...optional]);
	const seen = new Set();
	const options = {
		execute: false,
		publicDir: "apps/terminal/.output/public",
		lambdaDir: "apps/terminal/dist-lambda",
		lambdaEntry: "index.mjs",
		functionsDir: FUNCTIONS_DIR,
		skipProbe: false,
		network: "mainnet",
		acknowledged: [],
	};
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		const equals = argument.indexOf("=");
		const flag = equals === -1 ? argument : argument.slice(0, equals);
		if (!allowed.has(flag)) throw new Error(`Unknown argument ${flag} for ${command}`);
		const valueOption = VALUE_OPTIONS[flag];
		if (seen.has(flag) && !valueOption?.[2]) throw new Error(`${flag} may only be specified once`);
		seen.add(flag);
		if (!valueOption) {
			if (equals !== -1) throw new Error(`${flag} must be a bare flag`);
			if (flag === "--execute") options.execute = true;
			else if (flag === "--skip-probe") options.skipProbe = true;
			else options.acknowledged.push(RELEASE_GATES.find((gate) => gate.option === flag).id);
			continue;
		}
		const [key, , repeatable] = valueOption;
		const value = equals === -1 ? args[++index] : argument.slice(equals + 1);
		if (!value?.trim() || value.startsWith("--")) throw new Error(`${flag} requires a value`);
		if (repeatable) (options[key] ??= []).push(value);
		else options[key] = value;
	}
	for (const flag of required) if (!seen.has(flag)) throw new Error(`${flag} is required`);
	if (options.origin) options.origin = parseOrigin(options.origin);
	if (options.network !== "mainnet" && options.network !== "testnet") throw new Error("--network must be mainnet or testnet");
	if (command === "lambda" && options.execute) assertLambdaProbeTarget(options);
	if (command === "aliases") applyDistributionAliases({}, options);
	return options;
}

function usage() {
	const commandLines = Object.entries(COMMAND_OPTIONS).map(([command, { required, optional }]) => {
		const format = (flag) => {
			const option = VALUE_OPTIONS[flag];
			return option ? `${flag} ${option[1]}` : flag;
		};
		return `  ${[command, ...required.map(format), ...optional.map((flag) => `[${format(flag)}]`)].join(" ")}`;
	});
	return [
		`usage: node deploy/cloudfront/deploy.mjs <${Object.keys(COMMAND_OPTIONS).join("|")}>`,
		...commandLines,
		"--only and --alias can be repeated. Boolean options take no value.",
		"Without --execute, mutation commands only print a local plan. verify contacts the public origin.",
	].join("\n");
}

function awsArgs(args) {
	return awsProfile ? [...args, "--profile", awsProfile] : args;
}

function runAws(args, execute) {
	const full = awsArgs(args);
	console.log(`aws ${full.map((arg) => (/[\s*{}]/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`);
	if (!execute) return;
	execFileSync("aws", full, { stdio: ["ignore", "inherit", "inherit"] });
}

/** Runs a program and returns its standard output instead of letting it reach this process's output. */
export function captureCommand(file, args) {
	return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 16 * 1024 * 1024 });
}

/** Runs a command whose answer is printed only through a caller's summary; nothing it returns reaches the log as is. */
function captureAws(args, execute) {
	const full = awsArgs(args);
	console.log(`aws ${full.map((arg) => (/[\s*{}]/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`);
	if (!execute) return "";
	return captureCommand("aws", full);
}

function readS3Object(bucket, key) {
	return execFileSync("aws", awsArgs(["s3", "cp", `s3://${bucket}/${key}`, "-", "--no-progress"]), { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 16 * 1024 * 1024 });
}

/** Source maps would publish the source of every chunk next to it; the build emits none. */
export function assertNoSourceMaps(files) {
	const maps = files.filter((file) => file.endsWith(".map"));
	if (maps.length > 0) throw new Error(`The build contains ${maps.length} source map(s), for example ${maps.slice(0, 3).join(", ")}; refusing to publish them`);
}

function readAwsJson(args) {
	return JSON.parse(
		execFileSync("aws", [...awsArgs(args), "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }),
	);
}

/** The code CloudFront currently runs for a function; `get-function` writes it to a file. */
function readLiveFunctionCode(name) {
	const outFile = join(tmpdir(), `${name}-live-${process.pid}.js`);
	try {
		readAwsJson(["cloudfront", "get-function", "--name", name, "--stage", "LIVE", outFile]);
		return readFileSync(outFile, "utf8");
	} finally {
		rmSync(outFile, { force: true });
	}
}

/** Uploading pages whose inline scripts the live policy does not allow would be an outage under `enforce`. */
function assertLivePolicyAllowsBuild(publicDir) {
	const build = collectInlineScriptHashes(publicDir);
	const missing = missingScriptHashes(readLiveFunctionCode(RESPONSE_FUNCTION_NAME), build.hashes);
	if (missing.length > 0) {
		throw new Error(
			`The live ${RESPONSE_FUNCTION_NAME} function does not allow ${missing.length} of this build's ${build.hashes.length} inline script hashes; run: node deploy/cloudfront/deploy.mjs functions --execute`,
		);
	}
	console.log(`The live edge policy allows all ${build.hashes.length} inline script hashes of this build`);
}

/**
 * Build flags that expose a funds or credential path. `build-meta.json` records what the build
 * actually baked in, and an upload that turns one on needs the operator to say so again: the value
 * in `.env.local` alone is not an acknowledgement. Naming a gate the build does not expose is
 * refused too, because the operator and the artifact then disagree about what is being released.
 */
export const RELEASE_GATES = Object.freeze([
	{
		id: "sponsored-mainnet-deposits",
		option: "--allow-sponsored-mainnet-deposits",
		label: "sponsored Mainnet CCTP deposits",
		read: (buildMeta) => buildMeta.cctpDeposits?.mainnetSponsoredWallet,
	},
	{
		id: "mobile-pairing",
		option: "--allow-mobile-pairing",
		label: "Mobile Agent pairing",
		read: (buildMeta) => {
			const pairing = buildMeta.mobileSync;
			if (typeof pairing?.enabled === "boolean") return pairing.enabled;
			if (typeof pairing?.createAndReveal !== "boolean" || typeof pairing?.importFromQr !== "boolean") return undefined;
			return pairing.createAndReveal || pairing.importFromQr;
		},
	},
	{
		id: "mainnet-card-funding",
		option: "--allow-mainnet-card-funding",
		label: "Mainnet card funding",
		read: (buildMeta) => buildMeta.privyFiatFunding?.mainnet,
	},
]);

/** The gate state of a build, compared between the local artifact and the live origin. */
export function releaseGateState(buildMeta) {
	return Object.fromEntries(
		RELEASE_GATES.map((gate) => {
			const exposed = gate.read(buildMeta);
			if (typeof exposed !== "boolean") throw new Error(`build-meta.json does not record ${gate.label}; rebuild with the current source`);
			return [gate.id, exposed];
		}),
	);
}

export function evaluateReleaseGates({ buildMeta, acknowledged = [] }) {
	const state = releaseGateState(buildMeta);
	const problems = [];
	for (const gate of RELEASE_GATES) {
		const named = acknowledged.includes(gate.id);
		if (state[gate.id] && !named) problems.push(`This build exposes ${gate.label}; pass ${gate.option} to acknowledge it, or rebuild with the flag off`);
		if (!state[gate.id] && named) problems.push(`${gate.option} was passed but this build does not expose ${gate.label}; rebuild with the flag on, or drop the option`);
	}
	return { state, problems };
}

function describeGateState(state) {
	return Object.entries(state)
		.map(([id, exposed]) => `${id}=${exposed ? "on" : "off"}`)
		.join(" ");
}

/** The files a viewer receives first; a sync that stopped early must never look like a release. */
export const RELEASE_MARKER_FILES = [SHELL_KEY, BUILD_META_KEY];

/**
 * Compares the bytes of each marker in the bucket with the local build. Sizes are not enough: the
 * shell and the build metadata of consecutive releases often have the same size, so a skipped
 * upload would pass a size check.
 */
export function assertReleaseMarkersUploaded({ bucket, publicDir, readObject }) {
	for (const file of RELEASE_MARKER_FILES) {
		const local = sha256(readFileSync(join(publicDir, file)));
		const body = readObject(bucket, file);
		const remote = body === undefined || body === null ? "missing" : sha256(body);
		if (remote !== local) {
			throw new Error(
				`${file} in s3://${bucket} (sha256 ${remote.slice(0, 12)}) differs from the local build (sha256 ${local.slice(0, 12)}); the upload did not finish, run the same sync again`,
			);
		}
	}
}

/**
 * The `sync` command: checks the gates and the build, uploads in plan order and, when executing,
 * compares the release markers last. Side effects are injected so the order can be tested.
 */
export function releaseStatic({
	publicDir,
	bucket,
	execute,
	acknowledged = [],
	listFiles = listPublicFiles,
	assertLivePolicy,
	run,
	readObject,
	log = console.log,
	warn = console.warn,
}) {
	assertFilterSafeDirectory(publicDir);
	if (!existsSync(join(publicDir, SHELL_KEY))) throw new Error(`No ${SHELL_KEY} in ${publicDir}; run pnpm build first`);
	const gates = evaluateReleaseGates({ buildMeta: JSON.parse(readFileSync(join(publicDir, BUILD_META_KEY), "utf8")), acknowledged });
	log(`release gates: ${describeGateState(gates.state)}`);
	if (gates.problems.length > 0) {
		if (execute) throw new Error(gates.problems.join("\n"));
		for (const problem of gates.problems) warn(`An executing sync would refuse this build: ${problem}`);
	}
	const files = listFiles(publicDir);
	assertNoSourceMaps(files);
	if (execute) assertLivePolicy(publicDir);
	const plan = buildSyncPlan({ publicDir, bucket, files });
	runSyncPlan({ plan, bucket, run });
	if (!execute) return;
	assertReleaseMarkersUploaded({ bucket, publicDir, readObject });
	log(`Release markers match the local build byte for byte: ${RELEASE_MARKER_FILES.join(", ")}`);
}

const AWS_OPTIONS = ["--execute", "--profile"];
const COMMAND_OPTIONS = {
	sync: { required: ["--bucket"], optional: [...AWS_OPTIONS, "--public-dir", ...RELEASE_GATES.map((gate) => gate.option)] },
	reupload: { required: ["--bucket", "--only"], optional: [...AWS_OPTIONS, "--public-dir"] },
	invalidate: { required: ["--distribution"], optional: AWS_OPTIONS },
	aliases: { required: ["--distribution", "--alias", "--certificate-arn"], optional: AWS_OPTIONS },
	lambda: { required: ["--function-name"], optional: [...AWS_OPTIONS, "--lambda-dir", "--lambda-entry", "--origin", "--skip-probe"] },
	"check-lambda": { required: [], optional: ["--lambda-dir"] },
	functions: { required: [], optional: [...AWS_OPTIONS, "--functions-dir", "--public-dir", "--origin"] },
	verify: { required: ["--origin"], optional: ["--public-dir", "--network"] },
};

const VALUE_OPTIONS = {
	"--bucket": ["bucket", "B"],
	"--only": ["prefixes", "PREFIX", true],
	"--alias": ["aliases", "HOST", true],
	"--certificate-arn": ["certificateArn", "ARN"],
	"--distribution": ["distributionId", "ID"],
	"--function-name": ["functionName", "F"],
	"--lambda-dir": ["lambdaDir", "DIR"],
	"--lambda-entry": ["lambdaEntry", "FILE"],
	"--functions-dir": ["functionsDir", "DIR"],
	"--public-dir": ["publicDir", "DIR"],
	"--origin": ["origin", "URL"],
	"--network": ["network", "mainnet|testnet"],
	"--profile": ["profile", "NAME"],
};

export async function main(argv) {
	const [command, ...args] = argv;
	if (!Object.hasOwn(COMMAND_OPTIONS, command)) {
		console.error(usage());
		return 2;
	}
	const options = readArgs(command, args);
	const publicDir = resolve(options.publicDir);
	if (command !== "verify" && command !== "check-lambda") {
		awsProfile = resolveAwsProfile({ profile: options.profile });
		console.log(`aws profile: ${awsProfile}`);
		if (options.execute) assertReleaseIdentity(readAwsJson(["sts", "get-caller-identity"]).Arn);
	}
	switch (command) {
		case "sync": {
			releaseStatic({
				publicDir,
				bucket: options.bucket,
				execute: options.execute,
				acknowledged: options.acknowledged,
				assertLivePolicy: assertLivePolicyAllowsBuild,
				run: (command) => runAws(command, options.execute),
				readObject: readS3Object,
			});
			break;
		}
		case "reupload": {
			const { bucket, prefixes } = options;
			const commands = buildReuploadCommands({ bucket, files: listPublicFiles(publicDir), prefixes });
			if (commands.length === 0) throw new Error(`No uploadable files match ${prefixes.join(", ")}`);
			for (const command of commands) runAws(command, options.execute);
			break;
		}
		case "invalidate":
			runAws(buildInvalidationCommand(options.distributionId), options.execute);
			break;
		case "aliases": {
			const { distributionId, aliases, certificateArn } = options;
			if (!options.execute) {
				console.log(`Distribution ${distributionId}: read current config and ETag, set aliases ${aliases.join(", ")} with certificate ${certificateArn}, update and wait for deployment`);
				break;
			}
			const live = readAwsJson(["cloudfront", "get-distribution-config", "--id", distributionId]);
			const updated = applyDistributionAliases(live.DistributionConfig, { aliases, certificateArn });
			const file = join(tmpdir(), `sairn-distribution-${distributionId}-${process.pid}.json`);
			writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
			console.log(`Distribution ${distributionId}: aliases ${aliases.join(", ")} with certificate ${certificateArn} (ETag ${live.ETag}) → ${file}`);
			runAws(
				["cloudfront", "update-distribution", "--id", distributionId, "--if-match", live.ETag, "--distribution-config", `file://${file}`],
				options.execute,
			);
			runAws(["cloudfront", "wait", "distribution-deployed", "--id", distributionId], options.execute);
			break;
		}
		case "lambda": {
			const functionName = options.functionName;
			const bundle = resolve(options.lambdaDir, options.lambdaEntry);
			if (!existsSync(bundle) || !statSync(bundle).isFile()) throw new Error(`No Lambda bundle at ${bundle}; run pnpm --filter @sairn/terminal build:lambda`);
			await releaseLambda({
				functionName,
				bundle,
				zipPath: resolve(options.lambdaDir, `${options.lambdaEntry.replace(/\.mjs$/, "")}.zip`),
				origin: options.origin,
				skipProbe: options.skipProbe,
				execute: options.execute,
				readBundle: (path) => readFileSync(path, "utf8"),
				listBundleDir: () => listLambdaOutput(options.lambdaDir),
				zip: (zipPath, path) => {
					execFileSync("zip", ["-j", "-q", zipPath, path], { stdio: "inherit" });
					return createHash("sha256").update(readFileSync(zipPath)).digest("base64");
				},
				run: runAws,
				capture: captureAws,
				probe: (origin) => probeApiAfterLambdaUpdate({ origin }),
			});
			break;
		}
		case "check-lambda": {
			assertNoExtraLambdaModules(listLambdaOutput(options.lambdaDir));
			for (const entry of LAMBDA_ENTRIES) {
				const bundle = resolve(options.lambdaDir, entry);
				if (!existsSync(bundle)) throw new Error(`No Lambda bundle at ${bundle}; run pnpm --filter @sairn/terminal build:lambda`);
				assertSelfContainedLambdaEntry(readFileSync(bundle, "utf8"), entry);
			}
			console.log(`Lambda entries are self-contained: ${LAMBDA_ENTRIES.join(", ")}`);
			break;
		}
		case "functions":
			await releaseFunctions({ ...options, publicDir });
			break;
		case "verify": {
			const results = await verifyDeployment({
				origin: options.origin,
				publicDir,
				network: options.network,
				scriptHashesMode: readEdgeConfig().cspScriptHashes,
				imageSourcesMode: readEdgeConfig().cspImageSources,
			});
			for (const result of results) console.log(`${result.ok ? "ok  " : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
			return results.some((result) => !result.ok) ? 1 : 0;
		}
	}
	return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2)).then((status) => {
		process.exitCode = status;
	}).catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
