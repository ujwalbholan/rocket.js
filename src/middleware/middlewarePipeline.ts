import type { Request } from "../protocol/request.ts";
import { Response } from "../protocol/response.ts";
import type { Middleware } from "../types/middleware.ts";

export class MiddlewarePipeline {
  private readonly middlewares: Middleware[];

  constructor(middlewares: Middleware[]) {
    this.middlewares = [...middlewares];
  }

  execute(request: Request, handler: () => Response): Response {
    const dispatch = (currentIndex: number): Response => {
      if (currentIndex === this.middlewares.length) {
        return this.assertResponse(handler(), "Route handler");
      }

      const middleware = this.middlewares[currentIndex];

      if (!middleware) {
        return this.assertResponse(handler(), "Route handler");
      }

      let nextCalled = false;
      const response = middleware.execute(request, () => {
        if (nextCalled) {
          throw new Error(
            `${middleware.constructor.name} called next() more than once`,
          );
        }

        nextCalled = true;
        return dispatch(currentIndex + 1);
      });

      return this.assertResponse(
        response,
        middleware.constructor.name || "Middleware",
      );
    };

    return dispatch(0);
  }

  private assertResponse(value: unknown, source: string): Response {
    if (!(value instanceof Response)) {
      throw new TypeError(`${source} must return a Response`);
    }

    return value;
  }
}
