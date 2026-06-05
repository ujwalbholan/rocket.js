export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    if (
      !Number.isInteger(statusCode) ||
      statusCode < 400 ||
      statusCode > 599
    ) {
      throw new TypeError(
        "HttpError statusCode must be an integer from 400 to 599",
      );
    }

    if (typeof message !== "string" || !message.trim()) {
      throw new TypeError("HttpError message must be a non-empty string");
    }

    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
  }
}
