import { HttpError } from "./HttpError.ts";

export class PayloadTooLargeError extends HttpError {
  constructor(message = "Payload Too Large") {
    super(413, message);
  }
}
