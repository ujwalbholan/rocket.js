import { BadRequestError } from "../errors/BadRequestError.ts";
import { Response, type ResponseHeaders } from "../protocol/response.ts";

export class ResponseParser {
  private static readonly HEADER_NAME_PATTERN =
    /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

  parse(responseText: string): Response {
    const boundary = this.findHeaderBoundary(responseText);

    if (!boundary) {
      throw new BadRequestError("Invalid response format");
    }

    const headPart = responseText
      .slice(0, boundary.index)
      .replaceAll("\r\n", "\n");
    const body = responseText.slice(boundary.index + boundary.length);
    const lines = headPart.split("\n");
    const statusLine = lines[0] ?? "";
    const status = this.parseStatusLine(statusLine);
    const headers = this.parseHeaders(lines.slice(1));
    const contentLength = headers["content-length"];

    if (contentLength !== undefined) {
      this.validateContentLength(contentLength, body);
      delete headers["content-length"];
    }

    delete headers.connection;

    return new Response(status, body, headers);
  }

  private findHeaderBoundary(
    responseText: string,
  ): { index: number; length: number } | null {
    const crlfIndex = responseText.indexOf("\r\n\r\n");
    const lfIndex = responseText.indexOf("\n\n");

    if (crlfIndex === -1 && lfIndex === -1) {
      return null;
    }

    if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex <= lfIndex)) {
      return { index: crlfIndex, length: 4 };
    }

    return { index: lfIndex, length: 2 };
  }

  private parseStatusLine(statusLine: string): number {
    const parts = statusLine.trim().split(/\s+/);

    if (parts.length !== 2 || parts[0] !== "STATUS") {
      throw new BadRequestError("Invalid response status line");
    }

    const status = Number(parts[1]);

    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw new BadRequestError("Invalid response status code");
    }

    return status;
  }

  private parseHeaders(lines: string[]): ResponseHeaders {
    const headers: ResponseHeaders = {};

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) {
        throw new BadRequestError(`Invalid response header format: ${line}`);
      }

      const name = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();

      if (!ResponseParser.HEADER_NAME_PATTERN.test(name)) {
        throw new BadRequestError(`Invalid response header name: ${name}`);
      }

      if (headers[name] !== undefined) {
        throw new BadRequestError(`Duplicate response header: ${name}`);
      }

      if (name === "transfer-encoding") {
        throw new BadRequestError(
          "Response Transfer-Encoding is not supported",
        );
      }

      headers[name] = value;
    }

    return headers;
  }

  private validateContentLength(contentLength: string, body: string): void {
    if (!/^\d+$/.test(contentLength)) {
      throw new BadRequestError("Invalid response Content-Length header");
    }

    if (Number(contentLength) !== Buffer.byteLength(body, "utf8")) {
      throw new BadRequestError(
        "Response Content-Length does not match the body",
      );
    }
  }
}
