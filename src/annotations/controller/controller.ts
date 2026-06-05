import { defineController } from "./controller-metadata.ts";

export function Controller(prefix = ""): ClassDecorator {
  return (target) => {
    defineController(target, prefix);
  };
}
