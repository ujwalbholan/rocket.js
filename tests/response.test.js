import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestError } from "../dist/src/errors/BadRequestError.js";
import { ResponseParser } from "../dist/src/parser/response-parser.js";
import { Response } from "../dist/src/protocol/response.js";

test("creates text responses with automatic headers", () => {
  const response = Response.text("Hello 🚀", 201, {
    "x-request-id": "request-1",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body, "Hello 🚀");
  assert.equal(
    response.getHeader("CONTENT-TYPE"),
    "text/plain; charset=utf-8",
  );
  assert.equal(
    response.getHeader("content-length"),
    String(Buffer.byteLength("Hello 🚀", "utf8")),
  );
  assert.equal(response.getHeader("x-request-id"), "request-1");
});

test("creates JSON responses", () => {
  const response = Response.json({ id: 1, name: "Rocket" }, 201);

  assert.equal(response.status, 201);
  assert.equal(
    response.getHeader("content-type"),
    "application/json; charset=utf-8",
  );
  assert.deepEqual(JSON.parse(response.body), {
    id: 1,
    name: "Rocket",
  });
});

test("creates empty responses", () => {
  const response = Response.empty();

  assert.equal(response.status, 204);
  assert.equal(response.body, "");
  assert.equal(response.getHeader("content-type"), undefined);
  assert.equal(response.getHeader("content-length"), "0");
});

test("supports case-insensitive custom headers", () => {
  const response = Response.text("Hello")
    .setHeader("X-Request-Id", "request-1")
    .setHeader("CONTENT-TYPE", "text/custom");

  assert.equal(response.getHeader("x-request-id"), "request-1");
  assert.equal(response.getHeader("content-type"), "text/custom");
});

test("returns a copy of response headers", () => {
  const response = Response.text("Hello");
  const headers = response.headers;

  headers["x-test"] = "changed";

  assert.equal(response.getHeader("x-test"), undefined);
});

test("serializes MiniHTTP responses without extra body spaces", () => {
  const response = Response.text("Hello", 200, {
    "x-request-id": "request-1",
  });

  assert.equal(
    response.serialize(),
    [
      "STATUS 200",
      "Content-Type: text/plain; charset=utf-8",
      "X-Request-Id: request-1",
      "Content-Length: 5",
      "",
      "Hello",
    ].join("\n"),
  );
});

test("serializes browser-compatible HTTP responses", () => {
  const response = Response.json({ ok: true });
  const body = '{"ok":true}';

  assert.equal(
    response.serializeHttp(),
    [
      "HTTP/1.1 200 OK",
      "Content-Type: application/json; charset=utf-8",
      `Content-Length: ${Buffer.byteLength(body, "utf8")}`,
      "Connection: close",
      "",
      body,
    ].join("\r\n"),
  );
});

test("uses Node status messages for HTTP responses", () => {
  const response = Response.text("Tea", 418);

  assert.match(response.serializeHttp(), /^HTTP\/1\.1 418 I'm a Teapot/);
});

test("rejects invalid status codes", () => {
  assert.throws(
    () => new Response(99, "Invalid"),
    TypeError,
  );
});

test("rejects invalid and unsafe response headers", () => {
  assert.throws(
    () => Response.text("Hello", 200, { "bad header": "value" }),
    TypeError,
  );
  assert.throws(
    () => Response.text("Hello", 200, { "x-test": "one\r\ntwo" }),
    TypeError,
  );
});

test("prevents applications from setting managed headers", () => {
  assert.throws(
    () => Response.text("Hello", 200, { "content-length": "100" }),
    TypeError,
  );
  assert.throws(
    () => Response.text("Hello").setHeader("connection", "keep-alive"),
    TypeError,
  );
  assert.throws(
    () => Response.text("Hello").setHeader("transfer-encoding", "chunked"),
    TypeError,
  );
});

test("rejects JSON values that cannot produce a body", () => {
  assert.throws(
    () => Response.json(undefined),
    TypeError,
  );
});

test("round-trips MiniHTTP responses through ResponseParser", () => {
  const original = Response.json(
    { message: "Hello 🚀" },
    201,
    { "x-request-id": "request-1" },
  );
  const parsed = new ResponseParser().parse(original.serialize());

  assert.equal(parsed.status, original.status);
  assert.equal(parsed.body, original.body);
  assert.equal(
    parsed.getHeader("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(parsed.getHeader("x-request-id"), "request-1");
  assert.equal(
    parsed.getHeader("content-length"),
    original.getHeader("content-length"),
  );
});

test("rejects responses with mismatched Content-Length", () => {
  const parser = new ResponseParser();

  assert.throws(
    () => parser.parse("STATUS 200\nContent-Length: 10\n\nHello"),
    BadRequestError,
  );
});
