import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import { after, before, test } from "node:test";
import { connectWebSocket } from "../scripts/lib/websocket.mjs";

function serverFrame(text) {
	const payload = Buffer.from(text);
	let header;
	if (payload.length < 126) {
		header = Buffer.from([0x81, payload.length]);
	} else {
		header = Buffer.alloc(4);
		header[0] = 0x81;
		header[1] = 126;
		header.writeUInt16BE(payload.length, 2);
	}
	return Buffer.concat([header, payload]);
}

function decodeClientFrame(buffer) {
	const masked = Boolean(buffer[1] & 0x80);
	assert.equal(masked, true);
	let length = buffer[1] & 0x7f;
	let offset = 2;
	if (length === 126) {
		length = buffer.readUInt16BE(offset);
		offset += 2;
	} else if (length === 127) {
		length = Number(buffer.readBigUInt64BE(offset));
		offset += 8;
	}
	const mask = buffer.subarray(offset, offset + 4);
	offset += 4;
	const payload = Buffer.from(buffer.subarray(offset, offset + length));
	for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
	return payload.toString();
}

let server;
let port;

before(async () => {
	server = http.createServer();
	server.on("upgrade", (request, socket) => {
		assert.equal(request.headers.authorization, "Bearer test");
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
		socket.once("data", (data) => {
			const text = decodeClientFrame(data);
			socket.end(serverFrame(text.toUpperCase()));
		});
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	port = server.address().port;
});

after(async () => {
	await new Promise((resolve) => server.close(resolve));
});

test("direct WebSocket supports authentication headers and text frames", async () => {
	const connection = await connectWebSocket(`ws://127.0.0.1:${port}/devtools`, {
		Authorization: "Bearer test",
	});
	const reply = new Promise((resolve) => connection.onMessage(resolve));
	const message = "hello".repeat(100);
	connection.sendText(message);
	assert.equal(await reply, message.toUpperCase());
	connection.close();
});
