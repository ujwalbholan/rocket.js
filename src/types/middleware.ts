import type { Request } from "../protocol/request.ts";
import type { Response } from "../protocol/response.ts";

export type NextFunction = () => Response;

export interface Middleware {
  execute(request: Request, next: NextFunction): Response;
}
