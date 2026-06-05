import { BadRequestError } from "../errors/BadRequestError.ts";
import type { HttpMethod } from "../types/route.type.ts";

export interface RequestOptions {
  clientAddress?: string;
}

export class Request {
  private static readonly HEADER_NAME_PATTERN =
    /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
  private static readonly SUPPORTED_METHODS = new Set<HttpMethod>([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ]);

  public readonly method: HttpMethod;
  public readonly path: string;
  public readonly headers: Record<string, string> = {};
  public readonly body: string = "";
  public readonly clientAddress: string;

  constructor(
    method: HttpMethod,
    path: string,
    headers: Record<string, string> = {},
    body: string = "",
    options: RequestOptions = {},
  ) {
    this.validateMethod(method);
    this.validatePath(path);
    this.validateBody(body);

    this.method = method;
    this.path = path;
    this.clientAddress = this.normalizeClientAddress(options.clientAddress);
    this.headers = this.normalizeHeaders(headers);
    this.body = body;
  }

  serialize(): string {
    const startLine = `${this.method} ${this.path}`;

    const bodyLength = Buffer.byteLength(this.body, "utf-8");

    const headers = {
      ...this.headers,
      "content-length": String(bodyLength),
    };

    const headerLines = Object.entries(headers).map(
      ([Key, value]) => `${Key}: ${value}`,
    );

    return [startLine, ...headerLines, "", this.body].join("\n");
  }

  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  json<T>(): T {
    if (!this.body.trim()) {
      throw new BadRequestError("Request body is empty");
    }

    try {
      return JSON.parse(this.body) as T;
    } catch {
      throw new BadRequestError("Request body must contain valid JSON");
    }
  }

  private normalizeClientAddress(address: string | undefined): string {
    if (address === undefined) {
      return "unknown";
    }

    if (typeof address !== "string") {
      throw new TypeError("Request clientAddress must be a string");
    }

    return address.trim() || "unknown";
  }

  private normalizeHeaders(
    headers: Record<string, string>,
  ): Record<string, string> {
    if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
      throw new TypeError("Request headers must be an object");
    }

    const normalizedHeaders: Record<string, string> = {};

    for (const [name, value] of Object.entries(headers)) {
      const normalizedName = name.trim().toLowerCase();

      if (!Request.HEADER_NAME_PATTERN.test(normalizedName)) {
        throw new TypeError(`Invalid request header name: ${name}`);
      }

      if (normalizedHeaders[normalizedName] !== undefined) {
        throw new TypeError(`Duplicate request header: ${name}`);
      }

      if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(
          `Request header ${normalizedName} must have a non-empty string value`,
        );
      }

      if (value.includes("\r") || value.includes("\n")) {
        throw new TypeError(
          `Invalid request header value for ${normalizedName}`,
        );
      }

      normalizedHeaders[normalizedName] = value.trim();
    }

    return normalizedHeaders;
  }

  private validateMethod(method: string): asserts method is HttpMethod {
    if (!Request.SUPPORTED_METHODS.has(method as HttpMethod)) {
      throw new TypeError(`Unsupported request method: ${method}`);
    }
  }

  private validatePath(path: string): void {
    if (
      typeof path !== "string" ||
      !path.startsWith("/") ||
      /[\u0000-\u0020\u007f]/.test(path)
    ) {
      throw new TypeError(
        "Request path must start with / and contain no spaces or control characters",
      );
    }
  }

  private validateBody(body: string): void {
    if (typeof body !== "string") {
      throw new TypeError("Request body must be a string");
    }
  }
}
