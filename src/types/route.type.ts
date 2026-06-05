import type { Request } from "../protocol/request.ts";
import { Response } from "../protocol/response.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteHandler = (request: Request) => Response;
