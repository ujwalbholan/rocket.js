import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestError } from "../dist/src/errors/BadRequestError.js";
import { RequestParser } from "../dist/src/parser/request-parser.js";
import { Request } from "../dist/src/protocol/request.js";

test("parses a browser-style HTTP request", () => {
  const parser = new RequestParser();
  const request = parser.parse(
    "GET /health HTTP/1.1\r\nHost: localhost:3000\r\nAccept: text/plain\r\n\r\n",
  );

  assert.equal(request.method, "GET");
  assert.equal(request.path, "/health");
  assert.equal(request.getHeader("HOST"), "localhost:3000");
  assert.equal(request.body, "");
});

test("validates Content-Length using UTF-8 bytes", () => {
  const parser = new RequestParser();
  const body = JSON.stringify({ name: "🚀" });
  const request = parser.parse(
    `POST /users\nContent-Length: ${Buffer.byteLength(body, "utf8")}\n\n${body}`,
  );

  assert.deepEqual(request.json(), { name: "🚀" });
});

test("rejects unsupported methods", () => {
  const parser = new RequestParser();

  assert.throws(
    () => parser.parse("TRACE /users\n\n"),
    BadRequestError,
  );
});

test("rejects paths that do not start with a slash", () => {
  const parser = new RequestParser();

  assert.throws(
    () => parser.parse("GET users\n\n"),
    BadRequestError,
  );
});

test("rejects malformed header names", () => {
  const parser = new RequestParser();

  assert.throws(
    () => parser.parse("GET /users\nBad Header: value\n\n"),
    BadRequestError,
  );
});

test("rejects a body without Content-Length", () => {
  const parser = new RequestParser();

  assert.throws(
    () => parser.parse("POST /users\n\n{}"),
    BadRequestError,
  );
});

test("rejects a mismatched Content-Length", () => {
  const parser = new RequestParser();

  assert.throws(
    () => parser.parse("POST /users\nContent-Length: 4\n\n{}"),
    BadRequestError,
  );
});

test("rejects unsupported transfer encodings", () => {
  const parser = new RequestParser();

  assert.throws(
    () => parser.parse("POST /users\nTransfer-Encoding: chunked\n\n"),
    BadRequestError,
  );
});

test("normalizes headers created directly through Request", () => {
  const request = new Request("GET", "/", {
    Authorization: "Bearer token",
  });

  assert.equal(request.getHeader("authorization"), "Bearer token");
});

test("validates requests created directly by applications", () => {
  assert.throws(
    () => new Request("TRACE", "/"),
    /Unsupported request method/,
  );
  assert.throws(
    () => new Request("GET", "users"),
    /Request path must start with/,
  );
  assert.throws(
    () => new Request("GET", "/", { "bad header": "value" }),
    /Invalid request header name/,
  );
  assert.throws(
    () => new Request("GET", "/", { "x-test": "one\r\ntwo" }),
    /Invalid request header value/,
  );
  assert.throws(
    () =>
      new Request("GET", "/", {
        Authorization: "one",
        authorization: "two",
      }),
    /Duplicate request header/,
  );
});

test("preserves client connection context", () => {
  const request = new Request("GET", "/", {}, "", {
    clientAddress: "127.0.0.1",
  });
  const parsed = new RequestParser().parse("GET /\n\n", {
    clientAddress: "10.0.0.1",
  });

  assert.equal(request.clientAddress, "127.0.0.1");
  assert.equal(parsed.clientAddress, "10.0.0.1");
});

test("turns invalid JSON into a BadRequestError", () => {
  const request = new Request("POST", "/users", {}, "{invalid");

  assert.throws(
    () => request.json(),
    BadRequestError,
  );
});

test("rejects JSON parsing when the body is empty", () => {
  const request = new Request("POST", "/users");

  assert.throws(
    () => request.json(),
    BadRequestError,
  );
});
