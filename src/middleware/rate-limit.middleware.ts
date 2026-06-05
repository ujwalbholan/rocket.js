import type { Request } from "../protocol/request.ts";
import { Response } from "../protocol/response.ts";
import type {
  Middleware,
  NextFunction,
} from "../types/middleware.ts";

export interface RateLimitOptions {
  keyGenerator?: (request: Request) => string;
  limit?: number;
  message?: string;
  windowMs?: number;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export class RateLimitMiddleware implements Middleware {
  private static readonly DEFAULT_LIMIT = 100;
  private static readonly DEFAULT_WINDOW_MS = 60_000;

  private readonly keyGenerator: (request: Request) => string;
  private readonly limit: number;
  private readonly message: string;
  private readonly records = new Map<string, RateLimitRecord>();
  private readonly windowMs: number;
  private nextCleanupAt = 0;

  constructor(options: RateLimitOptions = {}) {
    this.limit = options.limit ?? RateLimitMiddleware.DEFAULT_LIMIT;
    this.windowMs =
      options.windowMs ?? RateLimitMiddleware.DEFAULT_WINDOW_MS;
    this.message = options.message ?? "Too Many Requests";
    this.keyGenerator =
      options.keyGenerator ?? ((request) => request.clientAddress);

    this.validatePositiveInteger("limit", this.limit);
    this.validatePositiveInteger("windowMs", this.windowMs);

    if (!this.message.trim()) {
      throw new TypeError("message must not be empty");
    }
  }

  execute(request: Request, next: NextFunction): Response {
    const now = Date.now();
    const generatedKey = this.keyGenerator(request);

    if (typeof generatedKey !== "string" || !generatedKey.trim()) {
      throw new TypeError("Rate limit key must not be empty");
    }

    const key = generatedKey.trim();
    this.removeExpiredRecords(now);

    const current = this.records.get(key);
    const record =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + this.windowMs }
        : current;

    if (record.count >= this.limit) {
      return Response.json(
        { message: this.message },
        429,
        {
          ...this.createHeaders(record, 0),
          "retry-after": this.createRetryAfterHeader(record, now),
        },
      );
    }

    record.count += 1;
    this.records.set(key, record);

    return this.addHeaders(
      next(),
      record,
      this.limit - record.count,
    );
  }

  private addHeaders(
    response: Response,
    record: RateLimitRecord,
    remaining: number,
  ): Response {
    const headers = this.createHeaders(record, remaining);

    for (const [name, value] of Object.entries(headers)) {
      response.setHeader(name, value);
    }

    return response;
  }

  private createHeaders(
    record: RateLimitRecord,
    remaining: number,
  ): Record<string, string> {
    return {
      "x-ratelimit-limit": String(this.limit),
      "x-ratelimit-remaining": String(remaining),
      "x-ratelimit-reset": String(Math.ceil(record.resetAt / 1000)),
    };
  }

  private createRetryAfterHeader(
    record: RateLimitRecord,
    now: number,
  ): string {
    return String(
      Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    );
  }

  private removeExpiredRecords(now: number): void {
    if (now < this.nextCleanupAt) {
      return;
    }

    for (const [key, record] of this.records) {
      if (record.resetAt <= now) {
        this.records.delete(key);
      }
    }

    this.nextCleanupAt = now + this.windowMs;
  }

  private validatePositiveInteger(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive integer`);
    }
  }
}
