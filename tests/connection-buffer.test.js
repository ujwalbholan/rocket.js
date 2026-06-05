import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestError } from "../dist/src/errors/BadRequestError.js";
import { PayloadTooLargeError } from "../dist/src/errors/PayloadTooLargeError.js";
import { ConnectionBuffer } from "../dist/src/server/ConnectionBuffer.js";

test("waits for a complete body across TCP chunks", () => {
  const body = JSON.stringify({ name: "Rocket 🚀" });
  const message = Buffer.from(
    [
      "POST /users",
      "Content-Type: application/json",
      `Content-Length: ${Buffer.byteLength(body, "utf8")}`,
      "",
      body,
    ].join("\r\n"),
    "utf8",
  );
  const splitIndex = message.length - 2;
  const connectionBuffer = new ConnectionBuffer();

  connectionBuffer.append(message.subarray(0, splitIndex));
  assert.equal(connectionBuffer.tryReadMessage(), null);

  connectionBuffer.append(message.subarray(splitIndex));
  assert.deepEqual(connectionBuffer.tryReadMessage(), message);
  assert.equal(connectionBuffer.hasPendingData(), false);
});

test("preserves CRLF bytes inside the request body", () => {
  const body = "first\r\nsecond";
  const message = Buffer.from(
    `POST /notes\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
  const connectionBuffer = new ConnectionBuffer();

  connectionBuffer.append(message);

  assert.deepEqual(connectionBuffer.tryReadMessage(), message);
});

test("rejects duplicate Content-Length headers", () => {
  const connectionBuffer = new ConnectionBuffer();

  connectionBuffer.append(
    "POST /users\nContent-Length: 2\nContent-Length: 2\n\n{}",
  );

  assert.throws(
    () => connectionBuffer.tryReadMessage(),
    BadRequestError,
  );
});

test("rejects invalid Content-Length values", () => {
  const connectionBuffer = new ConnectionBuffer();

  connectionBuffer.append("POST /users\nContent-Length: nope\n\n");

  assert.throws(
    () => connectionBuffer.tryReadMessage(),
    BadRequestError,
  );
});

test("rejects requests larger than the configured limit", () => {
  const connectionBuffer = new ConnectionBuffer({
    maxHeaderSize: 64,
    maxRequestSize: 80,
  });

  connectionBuffer.append("POST /users\nContent-Length: 100\n\n");

  assert.throws(
    () => connectionBuffer.tryReadMessage(),
    PayloadTooLargeError,
  );
});

test("rejects headers larger than the configured limit", () => {
  const connectionBuffer = new ConnectionBuffer({
    maxHeaderSize: 16,
    maxRequestSize: 128,
  });

  connectionBuffer.append("GET /users\nX-Long");

  assert.throws(
    () => connectionBuffer.tryReadMessage(),
    PayloadTooLargeError,
  );
});
