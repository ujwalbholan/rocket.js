import type { HttpMethod } from "../../types/route.type.ts";

export interface ControllerRouteMetadata {
  method: HttpMethod;
  path: string;
  propertyKey: string | symbol;
}

export interface ControllerMetadata {
  prefix: string;
  routes: ControllerRouteMetadata[];
}

interface StoredControllerMetadata extends ControllerMetadata {
  isController: boolean;
}

const controllerMetadataStore = new WeakMap<
  Function,
  StoredControllerMetadata
>();

function getOrCreateMetadata(target: Function): StoredControllerMetadata {
  const existingMetadata = controllerMetadataStore.get(target);

  if (existingMetadata) {
    return existingMetadata;
  }

  const metadata: StoredControllerMetadata = {
    isController: false,
    prefix: "",
    routes: [],
  };

  controllerMetadataStore.set(target, metadata);
  return metadata;
}

export function defineController(target: Function, prefix: string): void {
  const metadata = getOrCreateMetadata(target);

  metadata.isController = true;
  metadata.prefix = prefix;
}

export function defineControllerRoute(
  target: Function,
  route: ControllerRouteMetadata,
): void {
  getOrCreateMetadata(target).routes.push(route);
}

export function getControllerMetadata(
  controller: object,
): ControllerMetadata | undefined {
  const metadata = controllerMetadataStore.get(controller.constructor);

  if (!metadata?.isController) {
    return undefined;
  }

  return {
    prefix: metadata.prefix,
    routes: [...metadata.routes],
  };
}
