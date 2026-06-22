import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdtempSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cli = resolve("scripts/cdp.mjs");

function encodeFrame(text) {
	const payload = Buffer.from(text);
	let header;
	if (payload.length < 126) {
		header = Buffer.from([0x81, payload.length]);
	} else if (payload.length <= 0xffff) {
		header = Buffer.alloc(4);
		header[0] = 0x81;
		header[1] = 126;
		header.writeUInt16BE(payload.length, 2);
	} else {
		header = Buffer.alloc(10);
		header[0] = 0x81;
		header[1] = 127;
		header.writeBigUInt64BE(BigInt(payload.length), 2);
	}
	return Buffer.concat([header, payload]);
}

function decodeFrame(buffer) {
	if (buffer.length < 2) return null;
	let length = buffer[1] & 0x7f;
	let offset = 2;
	if (length === 126) {
		if (buffer.length < 4) return null;
		length = buffer.readUInt16BE(2);
		offset = 4;
	} else if (length === 127) {
		if (buffer.length < 10) return null;
		length = Number(buffer.readBigUInt64BE(2));
		offset = 10;
	}
	const masked = Boolean(buffer[1] & 0x80);
	const mask = masked ? buffer.subarray(offset, offset + 4) : null;
	if (masked) offset += 4;
	if (buffer.length < offset + length) return null;
	const payload = Buffer.from(buffer.subarray(offset, offset + length));
	if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
	return {
		opcode: buffer[0] & 0x0f,
		text: payload.toString(),
		bytes: offset + length,
	};
}

let browserServer;
let endpoint;
let stateDirectory;
const seenMethods = [];

function runCli(args, overrides = {}) {
	return execFileAsync(process.execPath, [cli, ...args], {
		env: {
			...process.env,
			CDP_STATE_DIR: stateDirectory,
			CDP_WS_ENDPOINT: "",
			CDP_HTTP_ENDPOINT: "",
			CDP_HEADERS: "",
			...overrides,
		},
	});
}

before(async () => {
	stateDirectory = mkdtempSync(join(tmpdir(), "faster-cdp-test-"));
	browserServer = http.createServer();
	browserServer.on("upgrade", (request, socket) => {
		const accept = createHash("sha1")
			.update(
				`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`,
			)
			.digest("base64");
		socket.write(
			[
				"HTTP/1.1 101 Switching Protocols",
				"Connection: Upgrade",
				"Upgrade: websocket",
				`Sec-WebSocket-Accept: ${accept}`,
				"",
				"",
			].join("\r\n"),
		);

		let buffer = Buffer.alloc(0);
		socket.on("data", (chunk) => {
			buffer = Buffer.concat([buffer, chunk]);
			while (true) {
				const frame = decodeFrame(buffer);
				if (!frame) return;
				buffer = buffer.subarray(frame.bytes);
				if (frame.opcode === 0x8) {
					socket.end(Buffer.from([0x88, 0x00]));
					return;
				}
				if (frame.opcode !== 0x1) continue;
				const request = JSON.parse(frame.text);
				seenMethods.push(request.method);
				let result = {};
				if (request.method === "Target.getTargets") {
					result = {
						targetInfos: [
							{
								targetId: "ABCDEF0123456789",
								type: "page",
								title: "Mock Browser Page",
								url: "https://example.test/",
							},
						],
					};
				} else if (request.method === "Target.attachToTarget") {
					result = { sessionId: "mock-session" };
				} else if (request.method === "Accessibility.getFullAXTree") {
					result = {
						nodes: [
							{
								nodeId: "1",
								role: { value: "button" },
								name: { value: "Submit" },
								backendDOMNodeId: 42,
							},
						],
					};
				} else if (request.method === "DOM.getBoxModel") {
					result = { model: { border: [10, 20, 30, 20, 30, 40, 10, 40] } };
				} else if (request.method === "Runtime.evaluate") {
					result = { result: { value: "" } };
				}
				const response = { id: request.id, result };
				if (request.sessionId) response.sessionId = request.sessionId;
				socket.write(encodeFrame(JSON.stringify(response)));
			}
		});
	});
	await new Promise((resolveListen) =>
		browserServer.listen(0, "127.0.0.1", resolveListen),
	);
	endpoint = `ws://127.0.0.1:${browserServer.address().port}/devtools/browser/mock?token=not-for-output`;
});

after(async () => {
	try {
		await runCli(["stop", "--all"]);
	} catch {}
	await new Promise((resolveClose) => browserServer.close(resolveClose));
	rmSync(stateDirectory, { recursive: true, force: true });
});

test("CLI connects directly, lists targets, and reuses its daemon", async () => {
	const first = await runCli(["--ws-endpoint", endpoint, "list"]);
	assert.match(first.stdout, /^ABCDEF01\s+Mock Browser Page/m);

	const second = await runCli(["--ws-endpoint", endpoint, "list"]);
	assert.equal(second.stdout, first.stdout);
	const [daemonState] = readdirSync(stateDirectory);
	assert.equal(statSync(join(stateDirectory, daemonState)).mode & 0o777, 0o600);

	const snapshot = await runCli([
		"--ws-endpoint",
		endpoint,
		"snapshot",
		"ABCDEF01",
	]);
	assert.match(snapshot.stdout, /\[button ref=42\] "Submit"/);

	const click = await runCli([
		"--ws-endpoint",
		endpoint,
		"click",
		"ABCDEF01",
		"ref:42",
	]);
	assert.match(click.stdout, /Clicked element at \(20, 30\)/);
	assert.equal(
		seenMethods.filter((method) => method === "Target.attachToTarget").length,
		1,
	);
	assert.equal(
		seenMethods.filter((method) => method === "Input.dispatchMouseEvent")
			.length,
		3,
	);

	const stoppedWithoutDiscovery = await runCli(["stop"]);
	assert.match(
		stoppedWithoutDiscovery.stdout,
		/^Stopped [a-f0-9]{16} \(WebSocket ws:\/\/127\.0\.0\.1:/,
	);
	assert.doesNotMatch(stoppedWithoutDiscovery.stdout, /not-for-output/);
	assert.deepEqual(readdirSync(stateDirectory), []);

	writeFileSync(
		join(stateDirectory, "faster-cdp-1111111111111111.json"),
		JSON.stringify({
			id: "1111111111111111",
			label: "WebSocket ws://one.test",
			port: 1,
			token: "one",
		}),
	);
	writeFileSync(
		join(stateDirectory, "faster-cdp-2222222222222222.json"),
		JSON.stringify({
			id: "2222222222222222",
			label: "HTTP https://two.test",
			port: 2,
			token: "two",
		}),
	);
	await assert.rejects(runCli(["stop"]), (error) => {
		assert.match(error.stderr, /Multiple CDP daemons are running/);
		assert.match(
			error.stderr,
			/1111111111111111 {2}WebSocket ws:\/\/one\.test/,
		);
		assert.match(error.stderr, /2222222222222222 {2}HTTP https:\/\/two\.test/);
		return true;
	});
	const selectedStop = await runCli(["stop", "--id", "1111111111111111"]);
	assert.match(
		selectedStop.stdout,
		/Removed stale daemon state 1111111111111111/,
	);
	assert.deepEqual(readdirSync(stateDirectory), [
		"faster-cdp-2222222222222222.json",
	]);
	writeFileSync(
		join(stateDirectory, "faster-cdp-3333333333333333.json"),
		JSON.stringify({
			id: "3333333333333333",
			label: "HTTP https://three.test",
			port: 3,
			token: "three",
		}),
	);
	const allStop = await runCli(["stop", "--all"]);
	assert.match(allStop.stdout, /Removed stale daemon state 2222222222222222/);
	assert.match(allStop.stdout, /Removed stale daemon state 3333333333333333/);
	assert.deepEqual(readdirSync(stateDirectory), []);

	await runCli(["--ws-endpoint", endpoint, "list"]);
	const explicitStop = await runCli(["--ws-endpoint", endpoint, "stop"]);
	assert.match(explicitStop.stdout, /^Stopped [a-f0-9]{16}/);
});

test("type reports failure when nothing is focused", async () => {
	await assert.rejects(
		runCli(["--ws-endpoint", endpoint, "type", "ABCDEF01", "hello"]),
		(error) => {
			assert.match(error.stderr, /Nothing is focused/);
			return true;
		},
	);
	const stopped = await runCli(["--ws-endpoint", endpoint, "stop"]);
	assert.match(stopped.stdout, /^Stopped [a-f0-9]{16}/);
});

test("HTTP-specific stop does not rediscover an unavailable endpoint", async () => {
	const discovery = http.createServer((_request, response) => {
		response.setHeader("content-type", "application/json");
		response.end(JSON.stringify({ webSocketDebuggerUrl: endpoint }));
	});
	await new Promise((resolveListen) =>
		discovery.listen(0, "127.0.0.1", resolveListen),
	);
	const httpEndpoint = `http://127.0.0.1:${discovery.address().port}`;

	await runCli(["--http-endpoint", httpEndpoint, "list"]);
	await new Promise((resolveClose) => discovery.close(resolveClose));

	const stopped = await runCli(["--http-endpoint", httpEndpoint, "stop"]);
	assert.match(
		stopped.stdout,
		/^Stopped [a-f0-9]{16} \(HTTP http:\/\/127\.0\.0\.1:/,
	);
	assert.deepEqual(readdirSync(stateDirectory), []);
});
