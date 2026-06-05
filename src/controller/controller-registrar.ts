import { getControllerMetadata } from "../annotations/controller/controller-metadata.ts";
import type { Request } from "../protocol/request.ts";
import type { Response } from "../protocol/response.ts";
import { Router } from "../router/router.ts";

export class ControllerRegistrar {
  private readonly router: Router;

  constructor(router: Router) {
    this.router = router;
  }

  register(controller: object): void {
    const metadata = getControllerMetadata(controller);

    if (!metadata) {
      throw new TypeError(
        `${controller.constructor.name} must be annotated with @Controller`,
      );
    }

    for (const route of metadata.routes) {
      const controllerMethod = Reflect.get(controller, route.propertyKey);

      if (typeof controllerMethod !== "function") {
        throw new TypeError(
          `${controller.constructor.name}.${String(route.propertyKey)} must be a method`,
        );
      }

      this.router.register(
        route.method,
        this.joinPaths(metadata.prefix, route.path),
        (request: Request): Response => controllerMethod.call(controller, request),
      );
    }
  }

  registerMany(controllers: object[]): void {
    for (const controller of controllers) {
      this.register(controller);
    }
  }

  private joinPaths(prefix: string, path: string): string {
    const segments = [prefix, path]
      .flatMap((value) => value.split("/"))
      .filter(Boolean);

    return segments.length === 0 ? "/" : `/${segments.join("/")}`;
  }
}
