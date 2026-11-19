import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { main } from "./deploy.mjs";

/**
 * Several cases run `--execute` against the real resource names with `execFileSync` replaced. If that
 * replacement ever stopped reaching deploy.mjs, the real CLI must still be unreachable: no `aws` on
 * the search path, no credentials and a profile that does not exist.
 */
const FENCED_ENV = [
	"PATH",
	"AWS_PROFILE",
	"AWS_CONFIG_FILE",
	"AWS_SHARED_CREDENTIALS_FILE",
	"AWS_EC2_METADATA_DISABLED",
	"AWS_ACCESS_KEY_ID",
	"AWS_SECRET_ACCESS_KEY",
	"AWS_SESSION_TOKEN",
];
const FENCED_PROFILE = "sairn-test-no-such-profile";

function fenceRealAws(t, directory) {
	const saved = Object.fromEntries(FENCED_ENV.map((name) => [name, process.env[name]]));
	const emptyBin = join(directory, "no-binaries");
	fs.mkdirSync(emptyBin);
	Object.assign(process.env, {
		PATH: emptyBin,
		AWS_PROFILE: FENCED_PROFILE,
		AWS_CONFIG_FILE: join(directory, "no-aws-config"),
		AWS_SHARED_CREDENTIALS_FILE: join(directory, "no-aws-credentials"),
		AWS_EC2_METADATA_DISABLED: "true",
	});
	for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]) delete process.env[name];
	t.after(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});
}

function cliHarness(t, { responseFunction = true, activeGates = false, fail, refuseWrite } = {}) {
	const directory = fs.mkdtempSync(join(tmpdir(), "sairn-deploy-cli-"));
	fenceRealAws(t, directory);
	const publicDir = join(directory, "public");
	const functionsDir = join(directory, "functions");
	const lambdaDir = join(directory, "lambda");
	for (const dir of [publicDir, functionsDir, lambdaDir]) fs.mkdirSync(dir);
	fs.writeFileSync(join(publicDir, "_shell.html"), "<html><script>boot()</script></html>");
	fs.writeFileSync(
		join(publicDir, "build-meta.json"),
		JSON.stringify({
			mobileSync: { enabled: activeGates },
			cctpDeposits: { mainnetSponsoredWallet: activeGates },
			privyFiatFunding: { mainnet: activeGates },
		}),
	);
	for (const file of ["terminal-request.js", "terminal-response.js"]) {
		if (file === "terminal-response.js" && !responseFunction) continue;
		fs.copyFileSync(new URL(`./functions/${file}`, import.meta.url), join(functionsDir, file));
	}
	for (const file of ["index.mjs", "csp-report.mjs"])
		fs.writeFileSync(join(lambdaDir, file), "export const handler = () => {};");

	const events = [];
	const output = [];
	const realWrite = fs.writeFileSync;
	const generated = [];
	t.mock.method(fs, "writeFileSync", (file) => {
		events.push(`write ${file}`);
		if (refuseWrite?.(file)) throw Object.assign(new Error(`EEXIST: file already exists, open '${file}'`), { code: "EEXIST" });
	});
	t.mock.method(fs, "mkdirSync", (file) => events.push(`mkdir ${file}`));
	t.mock.method(fs, "rmSync", (file) => events.push(`remove ${file}`));
	t.mock.method(childProcess, "execFileSync", (file, args) => {
		const [service, operation] = args;
		const stage = args.includes("--stage") ? args[args.indexOf("--stage") + 1] : undefined;
		events.push(`${file} ${service} ${operation}${stage ? ` ${stage}` : ""}`);
		if (fail?.({ file, service, operation, args }))
			throw Object.assign(new Error("simulated subprocess failure"), { status: 254 });
		if (file === "zip") {
			realWrite(args[2], "synthetic archive");
			return "";
		}
		assert.equal(file, "aws");
		assert.ok(args.includes(FENCED_PROFILE), "every aws command carries the fenced profile");
		if (service === "sts") return JSON.stringify({ Arn: "arn:aws:iam::fixture:user/tester" });
		if (operation === "get-distribution-config") return JSON.stringify({ ETag: "dist-etag", DistributionConfig: {} });
		if (operation === "get-function") {
			const outputPath = args[args.indexOf("--stage") + 2];
			realWrite(outputPath, fs.readFileSync(join(functionsDir, "terminal-response.js")));
			generated.push(outputPath);
			return JSON.stringify({ ETag: "live-etag" });
		}
		if (operation === "describe-function") return JSON.stringify({ ETag: "function-etag" });
		if (operation === "update-function-code")
			return JSON.stringify({ Version: "26", CodeSha256: "aws-hash", LastUpdateStatus: "InProgress" });
		return "";
	});
	syncBuiltinESMExports();
	t.mock.method(globalThis, "fetch", async (url) => {
		const path = new URL(url).pathname;
		events.push(`http ${path}`);
		if (path === "/api/health") return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
		if (path === "/api/geo") return Response.json({ country: "GB", proxy: false, tradeRestricted: false });
		return new Response("<html><script>boot()</script></html>");
	});
	for (const method of ["log", "warn", "error"]) t.mock.method(console, method, (message) => output.push(message));
	t.after(() => {
		t.mock.restoreAll();
		syncBuiltinESMExports();
		fs.rmSync(directory, { recursive: true, force: true });
		for (const file of generated) fs.rmSync(file, { force: true });
	});
	return {
		events,
		output,
		publicDir,
		functionsDir,
		lambdaDir,
		invoke: (...args) => main(args),
	};
}

test("CLI help describes each command and the local-plan boundary", async (t) => {
	const harness = cliHarness(t);
	assert.equal(await harness.invoke("help"), 2);
	assert.deepEqual(harness.events, []);
	const [usage] = harness.output;
	assert.match(usage, /^usage: node deploy\/cloudfront\/deploy\.mjs </);
	assert.match(usage, /sync --bucket B .*\[--allow-mainnet-card-funding\]/);
	assert.match(usage, /verify --origin URL \[--public-dir DIR\] \[--network mainnet\|testnet\]/);
	assert.match(usage, /Boolean options take no value/);
	assert.match(usage, /verify contacts the public origin/);
});

test("CLI rejects unsafe or ambiguous options before any AWS, HTTP, file write or zip", async (t) => {
	const gates = ["--allow-sponsored-mainnet-deposits", "--allow-mobile-pairing", "--allow-mainnet-card-funding"];
	const cases = [
		["execute=false", () => ["invalidate", "--distribution", "D", "--execute=false"], /--execute.*bare/],
		...gates.map((gate) => [
			`${gate}=false`,
			(h) => [
				"sync",
				"--bucket",
				"b",
				"--public-dir",
				h.publicDir,
				"--execute",
				...gates.map((other) => (other === gate ? `${gate}=false` : other)),
			],
			/--allow-.*bare/,
		]),
		[
			"skip-probe=false",
			(h) => ["lambda", "--function-name", "api", "--lambda-dir", h.lambdaDir, "--skip-probe=false", "--execute"],
			/--skip-probe.*bare/,
		],
		[
			"missing value",
			(h) => ["lambda", "--function-name", "api", "--lambda-dir", h.lambdaDir, "--origin", "--execute", "--execute"],
			/--origin.*requires a value/,
		],
		[
			"duplicate value",
			() => ["invalidate", "--distribution", "A", "--distribution=B", "--execute"],
			/--distribution.*once/,
		],
		[
			"missing required probe target",
			(h) => ["lambda", "--function-name", "api", "--lambda-dir", h.lambdaDir, "--execute"],
			/lambda --execute needs --origin/,
		],
		[
			"verify cannot take execute",
			() => ["verify", "--origin", "https://site.example", "--execute"],
			/--execute.*verify/,
		],
		[
			"illegal origin",
			(h) => [
				"lambda",
				"--function-name",
				"api",
				"--lambda-dir",
				h.lambdaDir,
				"--origin",
				"ftp://site.example/a",
				"--execute",
			],
			/--origin.*HTTP/,
		],
		["missing required option", () => ["invalidate", "--execute"], /--distribution is required/],
		[
			"wrong subcommand",
			() => ["invalidate", "--distribution", "D", "--skip-probe", "--execute"],
			/--skip-probe.*invalidate/,
		],
		[
			"unknown network",
			() => ["verify", "--origin", "https://site.example", "--network", "typo"],
			/--network.*mainnet.*testnet/,
		],
	];
	for (const [label, args, expected] of cases) {
		await t.test(label, async (subtest) => {
			const harness = cliHarness(subtest, { activeGates: true });
			const result = await harness.invoke(...args(harness)).then(
				() => undefined,
				(error) => error,
			);
			assert.match(
				result?.message ?? "accepted input",
				expected,
				JSON.stringify({ error: result?.message, effects: harness.events, output: harness.output }),
			);
			assert.deepEqual(harness.events, []);
		});
	}
});

test("CLI dry runs for every mutation and the Lambda check only read local inputs", async (t) => {
	const commands = {
		sync: (h) => ["--bucket", "b", "--public-dir", h.publicDir],
		reupload: (h) => ["--bucket", "b", "--public-dir", h.publicDir, "--only=build-meta", "--only", "_shell"],
		invalidate: () => ["--distribution=D"],
		aliases: () => [
			"--distribution=D",
			"--alias",
			"one.example",
			"--alias=two.example",
			"--certificate-arn",
			`arn:aws:acm:us-east-1:${"0".repeat(12)}:certificate/abcd`,
		],
		lambda: (h) => ["--function-name", "api", "--lambda-dir", h.lambdaDir, "--origin=https://site.example/"],
		"check-lambda": (h) => ["--lambda-dir", h.lambdaDir],
		functions: (h) => [
			"--functions-dir",
			h.functionsDir,
			"--public-dir",
			h.publicDir,
			"--origin",
			"https://site.example",
		],
	};
	for (const [command, args] of Object.entries(commands)) {
		await t.test(command, async (subtest) => {
			const harness = cliHarness(subtest);
			await harness.invoke(command, ...args(harness));
			assert.deepEqual(harness.events, []);
			assert.ok(harness.output.length > 0);
		});
	}
});

test("CLI functions stops before cloud writes if either local function cannot be prepared", async (t) => {
	const harness = cliHarness(t, { responseFunction: false });
	await assert.rejects(
		harness.invoke(
			"functions",
			"--functions-dir",
			harness.functionsDir,
			"--public-dir",
			harness.publicDir,
			"--execute",
		),
		/No CloudFront Function code at .*terminal-response\.js/,
	);
	assert.deepEqual(
		harness.events.filter((event) => /update-function|publish-function/.test(event)),
		[],
	);
});

test("CLI functions reports confirmed stages and distinguishes update and publish failures", async (t) => {
	const stages = [
		["describe-function", "describe-function", 1, /did not update or publish it/],
		["update-function", "update-function", 1, /DEVELOPMENT code is in an unknown state.*did not publish it/],
		[
			"describe-function after the update",
			"describe-function",
			2,
			/update-function returned success; this run did not publish it/,
		],
		[
			"publish-function",
			"publish-function",
			1,
			/update-function returned success; whether LIVE now runs the planned code is unknown/,
		],
	];
	for (const [stage, operation, failOn, expected] of stages) {
		await t.test(stage, async (subtest) => {
			let calls = 0;
			const harness = cliHarness(subtest, {
				fail: (command) =>
					command.operation === operation && command.args.includes("gatu-terminal-response") && ++calls === failOn,
			});
			await assert.rejects(
				harness.invoke(
					"functions",
					"--functions-dir",
					harness.functionsDir,
					"--public-dir",
					harness.publicDir,
					"--execute",
				),
				(error) => {
					assert.match(error.message, /gatu-terminal-request: publish-function returned success/);
					assert.match(error.message, new RegExp(`gatu-terminal-response: ${stage} failed`));
					assert.match(error.message, expected);
					assert.match(error.message, /Planned code SHA-256 for gatu-terminal-response: [0-9a-f]{64}/);
					assert.match(error.message, /DEVELOPMENT and LIVE/);
					assert.match(error.message, /run the same functions command again/);
					return true;
				},
			);
		});
	}
});

test("CLI aliases removes its distribution config file after the update, also when the update fails", async (t) => {
	const certificateArn = `arn:aws:acm:us-east-1:${"0".repeat(12)}:certificate/abcd`;
	const args = ["aliases", "--distribution=D", "--alias", "one.example", "--certificate-arn", certificateArn, "--execute"];
	for (const [name, fail, expectWait] of [
		["success", undefined, true],
		["failed update", (command) => command.operation === "update-distribution", false],
	]) {
		await t.test(name, async (subtest) => {
			const harness = cliHarness(subtest, { fail });
			if (fail) await assert.rejects(harness.invoke(...args), /simulated subprocess failure/);
			else await harness.invoke(...args);
			const write = harness.events.findIndex((event) => /^write .*sairn-distribution-D-\d+\.json$/.test(event));
			assert.ok(write >= 0, harness.events.join("\n"));
			const file = harness.events[write].slice("write ".length);
			const update = harness.events.indexOf("aws cloudfront update-distribution");
			const remove = harness.events.indexOf(`remove ${file}`);
			assert.ok(write < update && update < remove, harness.events.join("\n"));
			assert.equal(harness.events.includes("aws cloudfront wait"), expectWait);
		});
	}
	await t.test("leaves a file it did not create in place", async (subtest) => {
		const harness = cliHarness(subtest, { refuseWrite: (file) => /sairn-distribution-D-\d+\.json$/.test(file) });
		await assert.rejects(harness.invoke(...args), { code: "EEXIST" });
		const write = harness.events.find((event) => /^write .*sairn-distribution-D-\d+\.json$/.test(event));
		assert.ok(write, harness.events.join("\n"));
		const file = write.slice("write ".length);
		assert.ok(!harness.events.includes(`remove ${file}`), harness.events.join("\n"));
		assert.ok(!harness.events.includes("aws cloudfront update-distribution"), harness.events.join("\n"));
	});
});
