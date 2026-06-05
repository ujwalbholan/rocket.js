import assert from "node:assert/strict";
import test from "node:test";
import { RateLimitMiddleware } from "../dist/src/middleware/rate-limit.middleware.js";
import { Request } from "../dist/src/protocol/request.js";
import { Response } from "../dist/src/protocol/response.js";

function createRequest(clientAddress, authorization) {
  return new Request(
    "GET",
    "/users",
    authorization ? { authorization } : {},
    "",
    { clientAddress },
  );
}

test("limits requests independently for each client address", () => {
  const middleware = new RateLimitMiddleware({
    limit: 2,
    windowMs: 60_000,
  });
  let handlerCalls = 0;
  const next = () => {
    handlerCalls += 1;
    return Response.json({ ok: true });
  };

  const first = middleware.execute(createRequest("10.0.0.1"), next);
  const second = middleware.execute(createRequest("10.0.0.1"), next);
  const blocked = middleware.execute(createRequest("10.0.0.1"), next);
  const otherClient = middleware.execute(createRequest("10.0.0.2"), next);

  assert.equal(first.status, 200);
  assert.equal(first.getHeader("x-ratelimit-remaining"), "1");
  assert.equal(first.getHeader("retry-after"), undefined);
  assert.equal(second.status, 200);
  assert.equal(second.getHeader("x-ratelimit-remaining"), "0");
  assert.equal(blocked.status, 429);
  assert.equal(blocked.getHeader("x-ratelimit-limit"), "2");
  assert.equal(blocked.getHeader("x-ratelimit-remaining"), "0");
  assert.equal(blocked.getHeader("retry-after"), "60");
  assert.deepEqual(JSON.parse(blocked.body), {
    message: "Too Many Requests",
  });
  assert.equal(otherClient.status, 200);
  assert.equal(handlerCalls, 3);
});

test("supports a custom rate limit key", () => {
  const middleware = new RateLimitMiddleware({
    keyGenerator(request) {
      return request.getHeader("authorization") ?? request.clientAddress;
    },
    limit: 1,
    windowMs: 60_000,
  });
  const next = () => Response.text("ok");

  const first = middleware.execute(
    createRequest("10.0.0.1", "Bearer user-1"),
    next,
  );
  const blocked = middleware.execute(
    createRequest("10.0.0.2", "Bearer user-1"),
    next,
  );

  assert.equal(first.status, 200);
  assert.equal(blocked.status, 429);
});

test("validates rate limit configuration", () => {
  assert.throws(
    () => new RateLimitMiddleware({ limit: 0 }),
    /limit must be a positive integer/,
  );
  assert.throws(
    () => new RateLimitMiddleware({ windowMs: -1 }),
    /windowMs must be a positive integer/,
  );
  assert.throws(
    () => new RateLimitMiddleware({ message: " " }),
    /message must not be empty/,
  );
});
