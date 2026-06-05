# Rocket.js Framework Notes

Rocket.js is the framework layer built around the MiniHTTP protocol implementation.

MiniHTTP describes the wire format. Rocket.js describes how developers create servers, routes, middleware, requests, and responses in application code.

## V1 Application Flow

The preferred V1 application flow is:

```text
ProtocolServer
  -> RequestParser
  -> Router
  -> Controller
  -> Service
  -> Repository
  -> Response
```

Framework responsibilities:

- `ProtocolServer` receives and frames TCP messages.
- `RequestParser` converts text into a `Request`.
- `Router` matches a method and path.
- Annotation metadata connects the route to a controller method.

Application responsibilities:

- Controllers validate transport input and create responses.
- Services implement business rules.
- Repositories read and write application data.

## Annotation-Based Controllers

The preferred user-facing style is class and object based:

```ts
import { Controller, Get, Response, Rocket } from "rocket.js";

@Controller()
class HealthController {
  @Get("/health")
  check(): Response {
    return Response.text("OK");
  }
}

const app = new Rocket();

app.registerController(new HealthController());
const server = await app.listen(3000);
```

Available annotations:

- `@Controller(prefix?)`
- `@Route(method, path?)`
- `@Get(path?)`
- `@Post(path?)`
- `@Put(path?)`
- `@Patch(path?)`
- `@Delete(path?)`

Rocket annotations use TypeScript decorator syntax internally, so users must enable `experimentalDecorators` in their TypeScript configuration.

`listen` also accepts an options object:

```ts
const server = await app.listen({
  host: "127.0.0.1",
  maxHeaderSize: 16 * 1024,
  maxRequestSize: 1024 * 1024,
  port: 3000,
  requestTimeoutMs: 30_000,
  shutdownTimeoutMs: 10_000,
});
```

Request limits are measured in bytes. The connection buffer waits for the declared `Content-Length` before sending the request to the parser.

## V1 Public API

Normal application code should start with:

```ts
import {
  Rocket,
  Request,
  Response,
  Controller,
  Get,
  Post,
  type Middleware,
  type NextFunction,
  type RouteHandler,
} from "rocket.js";
```

`ProtocolServer` is returned by `await app.listen()`. Lower-level routing, parsing, middleware pipeline, and connection-buffer classes remain available for advanced learning and framework extension.

## Core Framework Parts

- `Rocket`: Public facade used by framework users.
- `Controller`: Class annotation marking a controller with an optional path prefix.
- `Route` and verb annotations: Map controller methods to routes.
- `ControllerRegistrar`: Reads annotation metadata and binds controller methods to the router.
- `ProtocolServerFactory`: Resolves listen options and constructs the middleware pipeline and server.
- `ProtocolServer`: Low-level TCP server.
- `Router`: Stores and matches routes.
- `RegisteredRoute`: Represents one method/path/handler pair internally.
- `MiddlewarePipeline`: Runs middleware before route handlers.
- `RequestParser`: Converts raw MiniHTTP text into a `Request`.
- `ResponseParser`: Converts raw MiniHTTP response text into a `Response`.
- `Request`: Framework request object.
- `Response`: Framework response object.

## Request Processing Safety

`ConnectionBuffer` owns TCP framing:

- It accepts data split across multiple TCP chunks.
- It recognizes LF and CRLF header separators.
- It leaves body bytes unchanged.
- It measures `Content-Length` using bytes.
- It rejects duplicate or invalid `Content-Length` headers.
- It enforces header and total-request limits.

`RequestParser` owns protocol validation:

- It validates methods, paths, protocol versions, and header names.
- It requires `Content-Length` for non-empty bodies.
- It verifies that the declared length matches the UTF-8 body length.
- It rejects unsupported transfer encodings.

`Request.json<T>()` converts empty or malformed JSON bodies into `BadRequestError`.

## Response Creation

Common response types have factory methods:

```ts
Response.text("Hello");
Response.json({ ok: true });
Response.empty(204);
```

Custom headers may be provided through factories or the constructor:

```ts
return Response.json(
  { id: 1 },
  201,
  { "x-request-id": "request-1" },
);
```

Headers are normalized to lowercase internally and serialized using readable header names. `getHeader()` is case-insensitive, and `setHeader()` returns the response for chaining.

Rocket.js manages:

- `Content-Length`
- `Connection`
- `Transfer-Encoding`

Applications cannot set managed headers. MiniHTTP and HTTP serializers always calculate the body length from UTF-8 bytes.

## Rocket Facade

`Rocket` coordinates framework objects but does not implement their internal work:

```text
Rocket
  -> Router
  -> ControllerRegistrar
  -> ProtocolServerFactory
```

- Direct route methods delegate to `Router`.
- Controller registration delegates to `ControllerRegistrar`.
- Server creation delegates to `ProtocolServerFactory`.
- `Rocket` keeps the public API fluent and small.

## Local Demo vs Package Entry

`src/example/app.ts` is a local demo app. It is useful while developing Rocket.js itself.

`src/index.ts` is the package entry for npm users. It exports the framework classes they should import.

Package users should create their own application object and controller instances:

```ts
import { Controller, Get, Rocket, Response } from "rocket.js";

@Controller()
class AppController {
  @Get("/")
  home(): Response {
    return Response.text("Hello from Rocket.js");
  }
}

const app = new Rocket();
app.registerController(new AppController());
const server = await app.listen(3000);
```

## Application Composition Root

The application entry can also follow the class and object style:

```ts
class Application {
  private readonly app: Rocket;
  private readonly repository: UserRepository;
  private readonly service: UserService;
  private readonly controller: UserController;
  private server: ProtocolServer | null = null;

  constructor() {
    this.app = new Rocket();
    this.repository = new UserRepository();
    this.service = new UserService(this.repository);
    this.controller = new UserController(this.service);

    this.app.registerController(this.controller);
  }

  async start(): Promise<void> {
    this.server = await this.app.listen(3000);
  }

  async stop(): Promise<void> {
    await this.server?.stop();
    this.server = null;
  }
}

const application = new Application();
await application.start();
```

`Application` is the composition root. In V1 it replaces the work that a dependency-injection container would perform automatically.

## Server Lifecycle

`Rocket.listen()` resolves after the TCP listener is ready and rejects when
startup fails. The returned `ProtocolServer` exposes:

- `state`: `idle`, `starting`, `running`, `stopping`, or `stopped`.
- `isRunning`: Whether the listener is currently accepting connections.
- `address`: The bound address and actual port, including ephemeral port `0`.
- `start()`: Starts or restarts a stopped server.
- `stop()`: Gracefully stops the server and is safe to call repeatedly.

Shutdown first closes the listener. Existing connections may complete until
`shutdownTimeoutMs`; remaining sockets are then destroyed.

## Layer Responsibilities

### Controller

Controllers may:

- Read headers and request bodies.
- Validate required input.
- Convert framework or application errors into the established error flow.
- Call services.
- Return `Response` objects.

Controllers should not contain persistence logic.

### Service

Services may:

- Implement business rules.
- Coordinate multiple repositories.
- Normalize application data.

Services should not parse protocol messages or create TCP connections.

### Repository

Repositories may:

- Store and retrieve models.
- Wrap a database or another data source.
- Hide persistence details from services.

In V1, services and repositories are plain classes. Application code creates them and passes them through constructors:

```ts
const repository = new UserRepository();
const service = new UserService(repository);
const controller = new UserController(service);

app.registerController(controller);
```

Rocket.js does not include automatic dependency injection in V1.

## Middleware Shape

Middleware is object based:

```ts
import type { Middleware, NextFunction, Request } from "rocket.js";
import { Response } from "rocket.js";

class LoggerMiddleware implements Middleware {
  execute(request: Request, next: NextFunction): Response {
    console.log(`${request.method} ${request.path}`);

    return next();
  }
}
```

Usage:

```ts
const app = new Rocket();

app.use(new LoggerMiddleware());
```

Middleware runs in registration order. Code after `next()` runs in reverse
order as the response returns through the pipeline. A middleware may return
its own `Response` without calling `next()` to stop processing.

Rocket.js requires every middleware and route handler to return a `Response`.
Calling `next()` more than once throws an internal error so a controller cannot
perform the same write operation twice.

## Optional Rate Limiting

Rocket.js includes a fixed-window, in-memory middleware:

```ts
import {
  RateLimitMiddleware,
  Rocket,
} from "rocket.js";

const app = new Rocket();

app.use(
  new RateLimitMiddleware({
    limit: 100,
    windowMs: 60_000,
  }),
);
```

The default key is the remote TCP address stored in
`request.clientAddress`. Applications may provide a custom key:

```ts
app.use(
  new RateLimitMiddleware({
    keyGenerator(request) {
      return request.getHeader("authorization")
        ?? request.clientAddress;
    },
    limit: 1_000,
    message: "Please try again later",
    windowMs: 60_000,
  }),
);
```

Blocked requests return status `429` with a JSON message and a
`Retry-After` header. Rate-limit metadata is exposed through
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.

The V1 store is local to one Node.js process. A future store interface can
support Redis or another shared system for multiple processes and servers.

## Central Error Mapping

Errors may be thrown from middleware, controllers, services, or repositories.
Known `HttpError` objects preserve their status and safe message:

```ts
throw new UnauthorizedError();
```

Unexpected errors are logged by the server and returned as a generic
`500 Internal Server Error` response. Stack traces and internal exception
messages are not sent to clients.

## Design Principles

- Keep the framework small.
- Prefer classes and objects for structure.
- Support annotations without requiring reflection libraries.
- Keep constructor-based dependency wiring explicit in V1.
- Keep direct route handlers available for small applications.
- Keep MiniHTTP parsing readable for learning.
- Avoid hiding the Node `net` foundation too much.
