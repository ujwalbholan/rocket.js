import { BadRequestError } from "../errors/BadRequestError.ts";
import {
  Request,
  type RequestOptions,
} from "../protocol/request.ts";
import type { HttpMethod } from "../types/route.type.ts";

export class RequestParser {
  private static readonly HEADER_NAME_PATTERN =
    /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

  private static readonly SUPPORTED_METHODS = new Set<HttpMethod>([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ]);

  parse(requestText: string, options: RequestOptions = {}): Request {
    const boundary = this.findHeaderBoundary(requestText);

    if (!boundary) {
      throw new BadRequestError("Missing header/body separator");
    }

    const headPart = requestText
      .slice(0, boundary.index)
      .replaceAll("\r\n", "\n");
    const body = requestText.slice(boundary.index + boundary.length);
    const lines = headPart.split("\n");
    const requestLine = lines[0] ?? "";
    const { method, path } = this.parseRequestLine(requestLine);

    const headers: Record<string, string> = {};

    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;

      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) {
        throw new BadRequestError(`Invalid header format: ${line}`);
      }

      const key = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();

      if (!RequestParser.HEADER_NAME_PATTERN.test(key)) {
        throw new BadRequestError(`Invalid header name: ${key}`);
      }

      if (!value) {
        throw new BadRequestError(`Invalid header value for ${key}`);
      }

      if (key === "content-length" && headers[key] !== undefined) {
        throw new BadRequestError("Duplicate Content-Length headers");
      }

      headers[key] = value;
    }

    if (headers["transfer-encoding"] !== undefined) {
      throw new BadRequestError("Transfer-Encoding is not supported");
    }

    this.validateContentLength(headers["content-length"], body);

    return new Request(method, path, headers, body, options);
  }


  private findHeaderBoundary(
    requestText: string,
  ): { index: number; length: number } | null {
    const crlfIndex = requestText.indexOf("\r\n\r\n");
    const lfIndex = requestText.indexOf("\n\n");

    if (crlfIndex === -1 && lfIndex === -1) {
      return null;
    }

    if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex <= lfIndex)) {
      return { index: crlfIndex, length: 4 };
    }

    return { index: lfIndex, length: 2 };
  }

  private parseRequestLine(requestLine: string): {
    method: HttpMethod;
    path: string;
  } {
    const parts = requestLine.trim().split(/\s+/);

    if (parts.length < 2 || parts.length > 3) {
      throw new BadRequestError("Invalid request line");
    }

    const method = parts[0] ?? "";
    const path = parts[1] ?? "";
    const protocolVersion = parts[2];

    if (!RequestParser.SUPPORTED_METHODS.has(method as HttpMethod)) {
      throw new BadRequestError(`Unsupported request method: ${method}`);
    }

    if (!path.startsWith("/")) {
      throw new BadRequestError("Request path must start with /");
    }

    if (
      protocolVersion !== undefined &&
      !/^HTTP\/1\.[01]$/.test(protocolVersion)
    ) {
      throw new BadRequestError(
        `Unsupported protocol version: ${protocolVersion}`,
      );
    }

    return {
      method: method as HttpMethod,
      path,
    };
  }

  private validateContentLength(
    contentLengthHeader: string | undefined,
    body: string,
  ): void {
    const bodyLength = Buffer.byteLength(body, "utf8");

    if (contentLengthHeader === undefined) {
      if (bodyLength > 0) {
        throw new BadRequestError(
          "Content-Length is required when a request has a body",
        );
      }

      return;
    }

    if (!/^\d+$/.test(contentLengthHeader)) {
      throw new BadRequestError("Invalid Content-Length header");
    }

    const contentLength = Number(contentLengthHeader);

    if (!Number.isSafeInteger(contentLength) || contentLength !== bodyLength) {
      throw new BadRequestError(
        "Content-Length does not match the request body",
      );
    }
  }
}
