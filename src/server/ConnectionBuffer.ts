import { BadRequestError } from "../errors/BadRequestError.ts";
import { PayloadTooLargeError } from "../errors/PayloadTooLargeError.ts";

export interface ConnectionBufferOptions {
  maxHeaderSize?: number;
  maxRequestSize?: number;
}

interface HeaderBoundary {
  index: number;
  length: number;
}

export class ConnectionBuffer {
  private static readonly DEFAULT_MAX_HEADER_SIZE = 16 * 1024;
  private static readonly DEFAULT_MAX_REQUEST_SIZE = 1024 * 1024;

  private buffer = Buffer.alloc(0);
  private readonly maxHeaderSize: number;
  private readonly maxRequestSize: number;

  constructor(options: ConnectionBufferOptions = {}) {
    this.maxHeaderSize =
      options.maxHeaderSize ?? ConnectionBuffer.DEFAULT_MAX_HEADER_SIZE;
    this.maxRequestSize =
      options.maxRequestSize ?? ConnectionBuffer.DEFAULT_MAX_REQUEST_SIZE;

    this.validateLimit("maxHeaderSize", this.maxHeaderSize);
    this.validateLimit("maxRequestSize", this.maxRequestSize);

    if (this.maxHeaderSize > this.maxRequestSize) {
      throw new TypeError("maxHeaderSize cannot exceed maxRequestSize");
    }
  }

  append(data: Buffer | string): void {
    const chunk = typeof data === "string" ? Buffer.from(data, "utf8") : data;

    this.buffer = Buffer.concat([this.buffer, chunk]);

    if (this.buffer.length > this.maxRequestSize) {
      throw new PayloadTooLargeError(
        `Request exceeds the ${this.maxRequestSize} byte limit`,
      );
    }
  }

  tryReadMessage(): Buffer | null {
    const boundary = this.findHeaderBoundary();

    if (!boundary) {
      if (this.buffer.length > this.maxHeaderSize) {
        throw new PayloadTooLargeError(
          `Request headers exceed the ${this.maxHeaderSize} byte limit`,
        );
      }

      return null;
    }

    if (boundary.index > this.maxHeaderSize) {
      throw new PayloadTooLargeError(
        `Request headers exceed the ${this.maxHeaderSize} byte limit`,
      );
    }

    const headPart = this.buffer.subarray(0, boundary.index).toString("utf8");
    const contentLength = this.extractContentLength(headPart);
    const bodyStartIndex = boundary.index + boundary.length;
    const totalMessageLength = bodyStartIndex + contentLength;

    if (totalMessageLength > this.maxRequestSize) {
      throw new PayloadTooLargeError(
        `Request exceeds the ${this.maxRequestSize} byte limit`,
      );
    }

    if (this.buffer.length < totalMessageLength) {
      return null;
    }

    const message = this.buffer.subarray(0, totalMessageLength);
    this.buffer = this.buffer.subarray(totalMessageLength);

    return message;
  }

  usesHttpSyntax(): boolean {
    const firstLineEnd = this.buffer.indexOf("\n");
    const endIndex = firstLineEnd === -1 ? this.buffer.length : firstLineEnd;
    const firstLine = this.buffer.subarray(0, endIndex).toString("utf8");

    return firstLine.includes("HTTP/");
  }

  hasPendingData(): boolean {
    return this.buffer.length > 0;
  }

  private findHeaderBoundary(): HeaderBoundary | null {
    const crlfIndex = this.buffer.indexOf("\r\n\r\n");
    const lfIndex = this.buffer.indexOf("\n\n");

    if (crlfIndex === -1 && lfIndex === -1) {
      return null;
    }

    if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex <= lfIndex)) {
      return { index: crlfIndex, length: 4 };
    }

    return { index: lfIndex, length: 2 };
  }

  private extractContentLength(headPart: string): number {
    const values: string[] = [];
    const lines = headPart.replaceAll("\r\n", "\n").split("\n");

    for (const line of lines.slice(1)) {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim().toLowerCase();

      if (key === "content-length") {
        values.push(line.slice(separatorIndex + 1).trim());
      }
    }

    if (values.length === 0) {
      return 0;
    }

    if (values.length > 1) {
      throw new BadRequestError("Duplicate Content-Length headers");
    }

    const value = values[0] ?? "";

    if (!/^\d+$/.test(value)) {
      throw new BadRequestError("Invalid Content-Length header");
    }

    const contentLength = Number(value);

    if (!Number.isSafeInteger(contentLength)) {
      throw new BadRequestError("Invalid Content-Length header");
    }

    return contentLength;
  }

  private validateLimit(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive integer`);
    }
  }
}
