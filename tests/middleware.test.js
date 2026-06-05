import assert from "node:assert/strict";
import test from "node:test";
import { ErrorResponseMapper } from "../dist/src/errors/ErrorResponseMapper.js";
import { UnauthorizedError } from "../dist/src/errors/UnauthorizedError.js";
import { MiddlewarePipeline } from "../dist/src/middleware/middlewarePipeline.js";
import { Request } from "../dist/src/protocol/request.js";
import { Response } from "../dist/src/protocol/response.js";

const request = new Request("GET", "/");

test("runs middleware in registration order around the handler", () => {
  const events = [];
  const first = {
    execute(_request, next) {
      events.push("first:before");
      const response = next();
      events.push("first:after");
      return response;
    },
  };
  const second = {
    execute(_request, next) {
      events.push("second:before");
      const response = next();
      events.push("second:after");
      return response;
    },
  };
  const pipeline = new MiddlewarePipeline([first, second]);

  const response = pipeline.execute(request, () => {
    events.push("handler");
    return Response.text("ok");
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, [
    "first:before",
    "second:before",
    "handler",
    "second:after",
    "first:after",
  ]);
});

test("allows middleware to stop the pipeline", () => {
  let handlerCalled = false;
  const middleware = {
    execute() {
      return Response.text("Unauthorized", 401);
    },
  };
  const pipeline = new MiddlewarePipeline([middleware]);

  const response = pipeline.execute(request, () => {
    handlerCalled = true;
    return Response.text("ok");
  });

  assert.equal(response.status, 401);
  assert.equal(handlerCalled, false);
});

test("prevents middleware from calling next more than once", () => {
  let handlerCalls = 0;
  const middleware = {
    execute(_request, next) {
      next();
      return next();
    },
  };
  const pipeline = new MiddlewarePipeline([middleware]);

  assert.throws(
    () =>
      pipeline.execute(request, () => {
        handlerCalls += 1;
        return Response.text("ok");
      }),
    /called next\(\) more than once/,
  );
  assert.equal(handlerCalls, 1);
});

test("requires middleware and handlers to return Response objects", () => {
  const invalidMiddleware = new MiddlewarePipeline([
    {
      execute() {
        return undefined;
      },
    },
  ]);
  const emptyPipeline = new MiddlewarePipeline([]);

  assert.throws(
    () => invalidMiddleware.execute(request, () => Response.text("ok")),
    /must return a Response/,
  );
  assert.throws(
    () => emptyPipeline.execute(request, () => undefined),
    /Route handler must return a Response/,
  );
});

test("maps known errors and hides unexpected error details", () => {
  const unauthorized = ErrorResponseMapper.toResponse(
    new UnauthorizedError(),
  );
  const originalConsoleError = console.error;
  let unexpected;

  console.error = () => {};

  try {
    unexpected = ErrorResponseMapper.toResponse(
      new Error("database password leaked"),
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body, "Unauthorized");
  assert.equal(unexpected.status, 500);
  assert.equal(unexpected.body, "Internal Server Error");
  assert.doesNotMatch(unexpected.body, /database password/);
});
