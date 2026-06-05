# Rocket.js

Rocket.js is a small Node.js backend framework built directly on top of the core `node:net` package.

The project started as a simple HTTP-like protocol for learning how request-response communication works over TCP. It is now growing into a framework that keeps that low-level learning visible while offering a clean, class-based API for building servers.

## Goals

- Fast and lightweight
- Flexible without too much setup
- Easy to learn and configure
- Built with Node.js core networking
- More structured than Express
- Simpler and smaller than NestJS
- Class and object oriented by default

## V1 Architecture

Rocket.js supports a minimal layered structure inspired by Spring:

```text
Incoming request
  -> Route annotation
  -> Controller
  -> Service
  -> Repository
  -> Response
```

- Routes map protocol methods and paths to controller methods.
- Controllers parse input, validate request data, and create responses.
- Services contain business logic.
- Repositories contain data-access and model-storage logic.

V1 uses manual constructor injection. Rocket.js does not include a dependency-injection container yet.

## Installation

Rocket.js V1 requires Node.js 20 or newer and is published as an ES module:

```bash
npm install @ujwa_bholan/rocket.js
```

Enable annotations in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

## Quick Start

```ts
import {
  Controller,
  Get,
  Response,
  Rocket,
} from "@ujwa_bholan/rocket.js";

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

Open `http://127.0.0.1:3000` in a browser. Stop the application with:

```ts
await server.stop();
```

## TypeScript Setup

Rocket annotations use TypeScript's decorator syntax under the hood. Enable the required compiler option:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

## Layered Usage

```ts
import {
  BadRequestError,
  Controller,
  Get,
  Post,
  type ProtocolServer,
  Request,
  Response,
  Rocket,
} from "@ujwa_bholan/rocket.js";

interface User {
  id: number;
  name: string;
}

class UserRepository {
  private readonly users: User[] = [];

  findAll(): User[] {
    return [...this.users];
  }

  create(name: string): User {
    const user = { id: this.users.length + 1, name };
    this.users.push(user);
    return user;
  }
}

class UserService {
  private readonly repository: UserRepository;

  constructor(repository: UserRepository) {
    this.repository = repository;
  }

  findAll(): User[] {
    return this.repository.findAll();
  }

  create(name: string): User {
    return this.repository.create(name.trim());
  }
}

@Controller("/users")
class UserController {
  private readonly service: UserService;

  constructor(service: UserService) {
    this.service = service;
  }

  @Get()
  findAll(): Response {
    return Response.json(this.service.findAll());
  }

  @Post()
  create(request: Request): Response {
    const body = request.json<{ name?: unknown }>();

    if (typeof body.name !== "string" || body.name.trim() === "") {
      throw new BadRequestError("name must be a non-empty string");
    }

    return Response.json(this.service.create(body.name), 201);
  }
}

class Application {
  private readonly app: Rocket;
  private readonly repository: UserRepository;
  private readonly service: UserService;
  private readonly controller: UserController;

  constructor() {
    this.app = new Rocket();
    this.repository = new UserRepository();
    this.service = new UserService(this.repository);
    this.controller = new UserController(this.service);

    this.app.registerController(this.controller);
  }

  start(): Promise<ProtocolServer> {
    return this.app.listen(3000);
  }
}

const application = new Application();
const server = await application.start();
```

The server can also be configured with an options object:

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

## Server Lifecycle

`app.listen()` resolves only after the operating system has bound the server.
Startup errors such as an occupied port reject the returned promise:

```ts
const server = await app.listen(3000);

console.log(server.state);     // "running"
console.log(server.isRunning); // true
console.log(server.address);   // address, family, and actual port
```

Use `server.stop()` for graceful shutdown:

```ts
process.once("SIGTERM", () => {
  void server.stop();
});
```

Shutdown stops accepting new connections and allows active requests to finish.
Connections that remain open past `shutdownTimeoutMs` are force closed.
Calling `stop()` again after shutdown is safe.

## Middleware

Rocket.js middleware is class and object based. Middleware runs in the order
registered and may perform work before and after the controller:

```ts
import type {
  Middleware,
  NextFunction,
  Request,
} from "@ujwa_bholan/rocket.js";
import { Response } from "@ujwa_bholan/rocket.js";

class LoggerMiddleware implements Middleware {
  execute(request: Request, next: NextFunction): Response {
    console.log(`Incoming ${request.method} ${request.path}`);

    const response = next();

    console.log(`Completed ${response.status}`);
    return response;
  }
}

app.use(new LoggerMiddleware());
```

Returning a response without calling `next()` stops the pipeline. Rocket.js
also rejects middleware that calls `next()` more than once or fails to return
a `Response`.

## Rate Limiting

Rate limiting is optional and uses the same object-based middleware API:

```ts
import { RateLimitMiddleware } from "@ujwa_bholan/rocket.js";

app.use(
  new RateLimitMiddleware({
    limit: 100,
    windowMs: 60_000,
  }),
);
```

By default, requests are grouped using `request.clientAddress`, which comes
from the underlying TCP socket. A custom key can identify authenticated users:

```ts
app.use(
  new RateLimitMiddleware({
    keyGenerator(request) {
      return request.getHeader("authorization")
        ?? request.clientAddress;
    },
    limit: 1_000,
    windowMs: 60_000,
  }),
);
```

Allowed responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
`X-RateLimit-Reset`. Blocked requests return JSON with status `429` and a
`Retry-After` header.

The V1 store is in memory and applies to one Rocket.js process. Distributed
rate-limit stores are deferred until after V1.

## Request Safety

Rocket.js V1 frames requests using UTF-8 byte lengths rather than JavaScript character counts.

- `Content-Length` is required for requests with a body.
- Duplicate, invalid, or mismatched `Content-Length` headers return `400`.
- Unsupported `Transfer-Encoding` values return `400`.
- Requests larger than `maxRequestSize` return `413`.
- Headers larger than `maxHeaderSize` return `413`.
- Incomplete requests time out and return `400`.
- One connection accepts exactly one request and one response.
- `request.json<T>()` returns parsed JSON or throws `BadRequestError`.

Default limits are 1 MiB per request, 16 KiB for headers, and 30 seconds to complete a request.

## Responses

Use response factories for common body types:

```ts
return Response.text("Hello Rocket.js");
```

```ts
return Response.json({
  id: 1,
  name: "Rocket",
}, 201);
```

```ts
return Response.empty(204);
```

The constructor remains available for custom responses:

```ts
return new Response(200, "custom body", {
  "content-type": "text/custom",
  "x-request-id": "request-1",
});
```

Response headers are case-insensitive:

```ts
const response = Response.text("Hello")
  .setHeader("X-Request-Id", "request-1");

response.getHeader("x-request-id");
```

Rocket.js automatically manages `Content-Length`, `Connection`, and `Transfer-Encoding`. Applications cannot set these headers directly.

All response serializers:

- Calculate `Content-Length` using UTF-8 bytes.
- Include custom headers.
- Reject invalid header names and newline-injected values.
- Support standard HTTP status messages for browser responses.

## V1 Public API

The main API intended for application developers is:

- `Rocket`: Creates and configures an application.
- `Request`: Represents an incoming request.
- `Response`: Represents an outgoing response.
- `ResponseHeaders`: Type for custom response headers.
- `ProtocolServer`: The running TCP server returned by `await app.listen()`.
- `ServerState` and `ServerAddress`: Server lifecycle and bound-address types.
- `Controller`: Class annotation defining a controller and optional route prefix.
- `Route`, `Get`, `Post`, `Put`, `Patch`, `Delete`: Method annotations mapping controller methods.
- `Middleware`: The interface for class-based middleware.
- `NextFunction`: Continues the middleware pipeline.
- `RateLimitMiddleware`: Optional in-memory request limiting middleware.
- `UnauthorizedError`: Standard `401` framework error.
- `TooManyRequestsError`: Standard `429` framework error.
- `RouteHandler`: The type used by route handlers.

`Router`, `RegisteredRoute`, `MiddlewarePipeline`, parsers, and connection buffering are exported for advanced learning and extension. Most applications should use the `Rocket` class.

## Controller Registration

```ts
const app = new Rocket();

app.registerControllers(
  new HealthController(),
  new UserController(userService),
);

const server = await app.listen(3000);
```

Direct `app.get()` and `app.post()` registration remains available for small applications and simple endpoints.

## Application Bootstrap

For class-oriented applications, keep object construction in one application class:

```ts
class Application {
  private readonly app = new Rocket();
  private server: ProtocolServer | null = null;

  constructor() {
    const repository = new UserRepository();
    const service = new UserService(repository);
    const controller = new UserController(service);

    this.app.registerController(controller);
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

This class is the composition root: it creates and connects the framework, controllers, services, and repositories.

## Project Shape

```text
src/
  index.ts              Public framework exports for npm users
  rocket.ts             Public framework facade
  annotations/          Controller and route annotations
  controller/           Controller annotation registration
  example/              Local layered example
  server/               TCP server implementation
  router/               Route matching and registration
  middleware/           Middleware pipeline
  parser/               MiniHTTP request/response parsers
  protocol/             Request and Response objects
  errors/               Framework error types and mapping
  types/                Shared TypeScript types
```

The reusable framework API is exported from `src/index.ts`. Code under `src/example/` demonstrates how an application can use the framework.

`Rocket` stays intentionally small. It delegates annotation registration to `ControllerRegistrar` and server construction to `ProtocolServerFactory`.

## Protocol

Rocket.js currently speaks the MiniHTTP protocol documented in `docs/protocol-v1.md`.

Example request:

```text
POST /users
Content-Type: application/json
Content-Length: 16

{"name":"luffy"}
```

Example response:

```text
STATUS 201
Content-Type: application/json; charset=utf-8
Content-Length: 23

{"id":1,"name":"luffy"}
```

## Scripts

```bash
npm run build
npm test
npm run test:package
npm run check
npm run start
npm run client
```

## V1 Boundary

Rocket.js V1 provides controller and route annotations, but it does not provide automatic dependency injection, controller discovery, ORM integration, or `@Service` and `@Repository` lifecycle management. Services and repositories are normal classes created by application code.
