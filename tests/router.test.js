import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../dist/src/errors/HttpError.js";
import { Response } from "../dist/src/protocol/response.js";
import { Router } from "../dist/src/router/router.js";

test("rejects invalid and duplicate route registrations", () => {
  const router = new Router();
  const handler = () => Response.text("ok");

  router.get("/users", handler);

  assert.throws(
    () => router.get("/users", handler),
    /Route already registered: GET \/users/,
  );
  assert.throws(
    () => router.get("users", handler),
    /Route path must start with/,
  );
  assert.throws(
    () => router.get("/bad path", handler),
    /contain no spaces or control characters/,
  );
  assert.throws(
    () => router.register("TRACE", "/", handler),
    /Unsupported route method/,
  );
  assert.throws(
    () => router.register("GET", "/invalid", undefined),
    /Route handler must be a function/,
  );
});

test("validates public HttpError values", () => {
  assert.throws(
    () => new HttpError(200, "Not an error"),
    /statusCode must be an integer from 400 to 599/,
  );
  assert.throws(
    () => new HttpError(500, " "),
    /message must be a non-empty string/,
  );
});
