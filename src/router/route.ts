import type { HttpMethod, RouteHandler } from "../types/route.type.ts";

export class Route {
  private static readonly SUPPORTED_METHODS = new Set<HttpMethod>([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ]);

  public readonly method: HttpMethod;
  public readonly path: string;
  public readonly handler: RouteHandler;

  constructor(method: HttpMethod, path: string, handler: RouteHandler) {
    if (!Route.SUPPORTED_METHODS.has(method)) {
      throw new TypeError(`Unsupported route method: ${method}`);
    }

    if (
      typeof path !== "string" ||
      !path.startsWith("/") ||
      /[\u0000-\u0020\u007f]/.test(path)
    ) {
      throw new TypeError(
        "Route path must start with / and contain no spaces or control characters",
      );
    }

    if (typeof handler !== "function") {
      throw new TypeError("Route handler must be a function");
    }

    this.method = method;
    this.handler = handler;
    this.path = path;
  }

  matches(method: string, path: string): boolean {
    return this.method === method && this.path === path;
  }
}
