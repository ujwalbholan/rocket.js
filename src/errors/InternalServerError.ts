import { HttpError } from "./HttpError.ts";

export class InternalServerError extends HttpError {
  constructor(message = "Internal Server Error") {
    super(500, message);
  }
}
