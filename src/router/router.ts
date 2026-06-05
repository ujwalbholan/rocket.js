import type { HttpMethod, RouteHandler } from "../types/route.type.ts";
import { Route } from "./route.ts";
import type { Request } from "../protocol/request.ts";
import { Response } from "../protocol/response.ts";
import { NotFoundError } from "../errors/NotFoundError.ts";

export class Router {
  private readonly router: Route[] = [];

  get(path: string, handler: RouteHandler): void {
    this.register("GET", path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.register("POST", path, handler);
  }

  put(path: string, handler: RouteHandler): void {
    this.register("PUT", path, handler);
  }

  patch(path: string, handler: RouteHandler): void {
    this.register("PATCH", path, handler);
  }

  delete(path: string, handler: RouteHandler): void {
    this.register("DELETE", path, handler);
  }

  handle(request: Request): Response {
    const route = this.router.find((route) => {
      return route.matches(request.method, request.path);
    });

    if (!route) {
      throw new NotFoundError(
        `Cannot ${request.method} ${request.path}`,
      );
    }

    return route.handler(request);
  }

  register(
    method: HttpMethod,
    path: string,
    handler: RouteHandler,
  ): void {
    const route = new Route(method, path, handler);
    const duplicate = this.router.some((registeredRoute) => {
      return registeredRoute.matches(method, path);
    });

    if (duplicate) {
      throw new TypeError(`Route already registered: ${method} ${path}`);
    }

    this.router.push(route);
  }
}
