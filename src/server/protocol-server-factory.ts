import { MiddlewarePipeline } from "../middleware/middlewarePipeline.ts";
import { Router } from "../router/router.ts";
import type { Middleware } from "../types/middleware.ts";
import { ProtocolServer, type ServerOptions } from "./server.ts";

export interface RocketListenOptions extends ServerOptions {}

export class ProtocolServerFactory {
  create(
    router: Router,
    middlewares: Middleware[],
    portOrOptions: number | RocketListenOptions = 3000,
    host = "127.0.0.1",
  ): ProtocolServer {
    const options = this.resolveOptions(portOrOptions, host);
    const pipeline = new MiddlewarePipeline([...middlewares]);

    return new ProtocolServer(router, pipeline, options);
  }

  private resolveOptions(
    portOrOptions: number | RocketListenOptions,
    host: string,
  ): RocketListenOptions {
    if (typeof portOrOptions === "number") {
      return {
        host,
        port: portOrOptions,
      };
    }

    return {
      host: portOrOptions.host ?? "127.0.0.1",
      port: portOrOptions.port ?? 3000,
      ...(portOrOptions.maxHeaderSize === undefined
        ? {}
        : { maxHeaderSize: portOrOptions.maxHeaderSize }),
      ...(portOrOptions.maxRequestSize === undefined
        ? {}
        : { maxRequestSize: portOrOptions.maxRequestSize }),
      ...(portOrOptions.requestTimeoutMs === undefined
        ? {}
        : { requestTimeoutMs: portOrOptions.requestTimeoutMs }),
      ...(portOrOptions.shutdownTimeoutMs === undefined
        ? {}
        : { shutdownTimeoutMs: portOrOptions.shutdownTimeoutMs }),
    };
  }
}
