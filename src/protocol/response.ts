import { STATUS_CODES } from "node:http";

export type ResponseHeaders = Record<string, string>;

export class Response {
  private static readonly HEADER_NAME_PATTERN =
    /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
  private static readonly MANAGED_HEADERS = new Set([
    "connection",
    "content-length",
    "transfer-encoding",
  ]);

  public readonly status: number;
  public readonly body: string;
  private readonly headerValues: ResponseHeaders = {};

  constructor(
    status: number,
    body = "",
    headers: ResponseHeaders = {},
  ) {
    this.validateStatus(status);

    if (typeof body !== "string") {
      throw new TypeError("Response body must be a string");
    }

    this.status = status;
    this.body = body;

    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }

    if (body && !this.getHeader("content-type")) {
      this.setHeader("content-type", "text/plain; charset=utf-8");
    }
  }

  static text(
    body: string,
    status = 200,
    headers: ResponseHeaders = {},
  ): Response {
    return new Response(status, body, {
      "content-type": "text/plain; charset=utf-8",
      ...headers,
    });
  }

  static json(
    data: unknown,
    status = 200,
    headers: ResponseHeaders = {},
  ): Response {
    const body = JSON.stringify(data);

    if (body === undefined) {
      throw new TypeError("Response JSON value cannot be serialized");
    }

    return new Response(status, body, {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    });
  }

  static empty(
    status = 204,
    headers: ResponseHeaders = {},
  ): Response {
    return new Response(status, "", headers);
  }

  get headers(): Readonly<ResponseHeaders> {
    return {
      ...this.headerValues,
      "content-length": String(this.bodyLength),
    };
  }

  getHeader(name: string): string | undefined {
    const normalizedName = name.trim().toLowerCase();

    if (normalizedName === "content-length") {
      return String(this.bodyLength);
    }

    return this.headerValues[normalizedName];
  }

  setHeader(name: string, value: string): this {
    if (typeof name !== "string") {
      throw new TypeError("Response header name must be a string");
    }

    if (typeof value !== "string") {
      throw new TypeError("Response header value must be a string");
    }

    const normalizedName = this.normalizeHeaderName(name);

    if (Response.MANAGED_HEADERS.has(normalizedName)) {
      throw new TypeError(
        `${this.formatHeaderName(normalizedName)} is managed by Rocket.js`,
      );
    }

    this.validateHeaderValue(normalizedName, value);
    this.headerValues[normalizedName] = value.trim();
    return this;
  }

  serialize(): string {
    return this.serializeWith("\n", `STATUS ${this.status}`, false);
  }

  serializeHttp(): string {
    const statusText = STATUS_CODES[this.status] ?? "Unknown";

    return this.serializeWith(
      "\r\n",
      `HTTP/1.1 ${this.status} ${statusText}`,
      true,
    );
  }

  private get bodyLength(): number {
    return Buffer.byteLength(this.body, "utf8");
  }

  private serializeWith(
    lineEnding: "\n" | "\r\n",
    statusLine: string,
    includeConnectionHeader: boolean,
  ): string {
    const headers = {
      ...this.headerValues,
      "content-length": String(this.bodyLength),
      ...(includeConnectionHeader ? { connection: "close" } : {}),
    };
    const headerLines = Object.entries(headers).map(([name, value]) => {
      return `${this.formatHeaderName(name)}: ${value}`;
    });

    return [statusLine, ...headerLines, "", this.body].join(lineEnding);
  }

  private normalizeHeaderName(name: string): string {
    const normalizedName = name.trim().toLowerCase();

    if (!Response.HEADER_NAME_PATTERN.test(normalizedName)) {
      throw new TypeError(`Invalid response header name: ${name}`);
    }

    return normalizedName;
  }

  private validateHeaderValue(name: string, value: string): void {
    if (value.includes("\r") || value.includes("\n")) {
      throw new TypeError(`Invalid response header value for ${name}`);
    }
  }

  private validateStatus(status: number): void {
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw new TypeError("Response status must be an integer from 100 to 599");
    }
  }

  private formatHeaderName(name: string): string {
    return name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("-");
  }
}
