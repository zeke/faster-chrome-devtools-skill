import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import {
	connectionIdentity,
	formatPages,
	localPortEndpoint,
	formatSnapshot,
	parseOptions,
	parseScreenshotArgs,
	resolveTarget,
	uniquePrefixLength,
} from "../skills/faster-chrome-devtools-skill/scripts/cdp.mjs";

test("parseOptions accepts direct endpoint and headers", () => {
	const { options, args } = parseOptions([
		"--ws-endpoint",
		"wss://example.test/devtools",
		"--headers",
		'{"Authorization":"Bearer test"}',
		"--timeout",
		"9000",
		"list",
	]);
	assert.equal(options.wsEndpoint, "wss://example.test/devtools");
	assert.deepEqual(options.headers, { Authorization: "Bearer test" });
	assert.equal(options.timeout, 9000);
	assert.deepEqual(args, ["list"]);
});

test("uniquePrefixLength expands ambiguous IDs", () => {
	assert.equal(uniquePrefixLength(["12345678A", "12345678B"]), 9);
	assert.equal(uniquePrefixLength(["ABCDEF0123", "1234567890"]), 8);
});

test("resolveTarget is case-insensitive and rejects ambiguity", () => {
	const pages = [
		{ targetId: "ABCDEF001", title: "One", url: "https://one.test" },
		{ targetId: "ABCDEF002", title: "Two", url: "https://two.test" },
	];
	assert.equal(resolveTarget("abcdef001", pages).title, "One");
	assert.throws(() => resolveTarget("ABCDEF00", pages), /ambiguous/);
	assert.throws(() => resolveTarget("nope", pages), /No page matches/);
});

test("formatPages emits reusable prefixes", () => {
	const output = formatPages([
		{ targetId: "12345678A", title: "Example", url: "https://example.test" },
		{ targetId: "12345678B", title: "Other", url: "https://other.test" },
	]);
	assert.match(output, /^12345678A\s+Example/m);
	assert.match(output, /^12345678B\s+Other/m);
});

test("formatSnapshot includes stable backend DOM refs", () => {
	const output = formatSnapshot([
		{
			nodeId: "1",
			childIds: ["2"],
			role: { value: "RootWebArea" },
			name: { value: "Example" },
			backendDOMNodeId: 1,
		},
		{
			nodeId: "2",
			parentId: "1",
			role: { value: "button" },
			name: { value: "Submit" },
			backendDOMNodeId: 42,
		},
	]);
	assert.equal(
		output,
		'[RootWebArea ref=1] "Example"\n  [button ref=42] "Submit"',
	);
});

test("formatSnapshot does not indent through hidden nodes", () => {
	const output = formatSnapshot([
		{
			nodeId: "1",
			childIds: ["2"],
			role: { value: "RootWebArea" },
			name: { value: "Root" },
			backendDOMNodeId: 1,
		},
		{
			nodeId: "2",
			parentId: "1",
			childIds: ["3"],
			role: { value: "generic" },
			name: { value: "" },
		},
		{
			nodeId: "3",
			parentId: "2",
			role: { value: "button" },
			name: { value: "Go" },
			backendDOMNodeId: 9,
		},
	]);
	assert.equal(output, '[RootWebArea ref=1] "Root"\n  [button ref=9] "Go"');
});

test("parseScreenshotArgs defaults to a compressed format", () => {
	const parsed = parseScreenshotArgs(["/tmp/example.jpg"]);
	assert.equal(parsed.path, "/tmp/example.jpg");
	assert.equal(parsed.format, "jpeg");
	assert.equal(parsed.quality, 75);
	assert.equal(parsed.fullPage, false);
});

test("parseScreenshotArgs supports safe full-page options", () => {
	const parsed = parseScreenshotArgs([
		"/tmp/example.webp",
		"--format",
		"webp",
		"--quality",
		"60",
		"--full-page",
	]);
	assert.deepEqual(parsed, {
		path: "/tmp/example.webp",
		format: "webp",
		quality: 60,
		fullPage: true,
	});
});

test("auto-discovered and explicit WebSocket endpoints share a daemon identity", () => {
	const endpoint = "ws://127.0.0.1:9222/devtools/browser";
	assert.equal(
		connectionIdentity({}, endpoint),
		connectionIdentity({ wsEndpoint: endpoint }),
	);
});

test("localPortEndpoint falls back to /devtools/browser when discovery is disabled", async () => {
	const server = http.createServer((_request, response) => {
		response.statusCode = 404;
		response.end();
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();
	try {
		assert.equal(
			await localPortEndpoint(port, {}),
			`ws://127.0.0.1:${port}/devtools/browser`,
		);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
	assert.equal(await localPortEndpoint(port, {}), null);
});
