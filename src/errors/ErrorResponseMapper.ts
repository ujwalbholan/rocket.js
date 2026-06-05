import { HttpError } from "./HttpError.ts";
import { Response } from "../protocol/response.ts";

export class ErrorResponseMapper {
  static toResponse(error: unknown): Response {
    if (error instanceof HttpError) {
      return Response.text(error.message, error.statusCode);
    }

    console.error("Unexpected Error", error);
    return Response.text("Internal Server Error", 500);
  }
}
