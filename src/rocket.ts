import { ControllerRegistrar } from "./controller/controller-registrar.ts";
import { Router } from "./router/router.ts";
import {
  ProtocolServerFactory,
  type RocketListenOptions,
} from "./server/protocol-server-factory.ts";
import { ProtocolServer } from "./server/server.ts";
import type { Middleware } from "./types/middleware.ts";
import type { RouteHandler } from "./types/route.type.ts";

export type { RocketListenOptions } from "./server/protocol-server-factory.ts";

export class Rocket {
  private readonly router = new Router();
  private readonly middlewares: Middleware[] = [];
  private readonly controllerRegistrar = new ControllerRegistrar(this.router);
  private readonly serverFactory = new ProtocolServerFactory();

  get(path: string, handler: RouteHandler): this {
    this.router.get(path, handler);
    return this;
  }

  post(path: string, handler: RouteHandler): this {
    this.router.post(path, handler);
    return this;
  }

  put(path: string, handler: RouteHandler): this {
    this.router.put(path, handler);
    return this;
  }

  patch(path: string, handler: RouteHandler): this {
    this.router.patch(path, handler);
    return this;
  }

  delete(path: string, handler: RouteHandler): this {
    this.router.delete(path, handler);
    return this;
  }

  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  registerController(controller: object): this {
    this.controllerRegistrar.register(controller);
    return this;
  }

  registerControllers(...controllers: object[]): this {
    this.controllerRegistrar.registerMany(controllers);
    return this;
  }

  listen(port?: number, host?: string): Promise<ProtocolServer>;
  listen(options?: RocketListenOptions): Promise<ProtocolServer>;
  async listen(
    portOrOptions: number | RocketListenOptions = 3000,
    host = "127.0.0.1",
  ): Promise<ProtocolServer> {
    const server = this.serverFactory.create(
      this.router,
      this.middlewares,
      portOrOptions,
      host,
    );

    return server.start();
  }
}
