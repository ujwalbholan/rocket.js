import { HttpError } from "./HttpError.ts";

export class BadRequestError extends HttpError {
  constructor(message = "Bad Request") {
    super(400, message);
  }
}
