import type { HttpMethod } from "../../types/route.type.ts";
import { defineControllerRoute } from "./controller-metadata.ts";

type MethodAnnotation = (
  target: any,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
) => void;

export function Route(method: HttpMethod, path = ""): MethodAnnotation {
  return (target, propertyKey, descriptor) => {
    if (!descriptor || typeof descriptor.value !== "function") {
      throw new TypeError("@Route can only annotate controller methods");
    }

    defineControllerRoute(target.constructor, {
      method,
      path,
      propertyKey,
    });
  };
}

export function Get(path = ""): MethodAnnotation {
  return Route("GET", path);
}

export function Post(path = ""): MethodAnnotation {
  return Route("POST", path);
}

export function Put(path = ""): MethodAnnotation {
  return Route("PUT", path);
}

export function Patch(path = ""): MethodAnnotation {
  return Route("PATCH", path);
}

export function Delete(path = ""): MethodAnnotation {
  return Route("DELETE", path);
}
