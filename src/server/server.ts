import net from "node:net";
import { BadRequestError } from "../errors/BadRequestError.ts";
import { ErrorResponseMapper } from "../errors/ErrorResponseMapper.ts";
import { MiddlewarePipeline } from "../middleware/middlewarePipeline.ts";
import { RequestParser } from "../parser/request-parser.ts";
import { Response } from "../protocol/response.ts";
import { Router } from "../router/router.ts";
import { ConnectionBuffer } from "./ConnectionBuffer.ts";

export type ServerState =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped";

export interface ServerAddress {
  address: string;
  family: string;
  port: number;
}

export interface ServerOptions {
  host?: string;
  maxHeaderSize?: number;
  maxRequestSize?: number;
  port?: number;
  requestTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}

export class ProtocolServer {
  private static readonly HOST = "127.0.0.1";
  private static readonly PORT = 3000;

  private readonly requestParse = new RequestParser();
  private readonly server: net.Server;
  private readonly host: string;
  private readonly maxHeaderSize: number;
  private readonly maxRequestSize: number;
  private readonly port: number;
  private readonly requestTimeoutMs: number;
  private readonly router: Router;
  private readonly pipeline: MiddlewarePipeline;
  private readonly shutdownTimeoutMs: number;
  private readonly sockets = new Set<net.Socket>();
  private lifecycleState: ServerState = "idle";
  private startPromise: Promise<this> | null = null;
  private stopPromise: Promise<void> | null = null;

  constructor(
    router: Router,
    pipeline: MiddlewarePipeline,
    options: ServerOptions = {},
  ) {
    this.router = router;
    this.pipeline = pipeline;
    this.host = options.host ?? ProtocolServer.HOST;
    this.maxHeaderSize = options.maxHeaderSize ?? 16 * 1024;
    this.maxRequestSize = options.maxRequestSize ?? 1024 * 1024;
    this.port = options.port ?? ProtocolServer.PORT;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 10_000;

    this.validateHost(this.host);
    this.validatePort(this.port);
    this.validatePositiveInteger("maxHeaderSize", this.maxHeaderSize);
    this.validatePositiveInteger("maxRequestSize", this.maxRequestSize);
    this.validatePositiveInteger("requestTimeoutMs", this.requestTimeoutMs);
    this.validatePositiveInteger(
      "shutdownTimeoutMs",
      this.shutdownTimeoutMs,
    );

    if (this.maxHeaderSize > this.maxRequestSize) {
      throw new TypeError("maxHeaderSize cannot exceed maxRequestSize");
    }

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.on("error", (error) => {
      if (this.lifecycleState !== "starting") {
        console.error("Rocket.js server error:", error.message);
      }
    });
  }

  get state(): ServerState {
    return this.lifecycleState;
  }

  get isRunning(): boolean {
    return this.lifecycleState === "running";
  }

  get address(): ServerAddress | null {
    const address = this.server.address();

    if (!address || typeof address === "string") {
      return null;
    }

    return {
      address: address.address,
      family: address.family,
      port: address.port,
    };
  }

  start(): Promise<this> {
    if (
      this.lifecycleState === "starting" ||
      this.lifecycleState === "running"
    ) {
      return Promise.reject(
        new Error(`Cannot start server while it is ${this.lifecycleState}`),
      );
    }

    if (this.lifecycleState === "stopping") {
      return Promise.reject(
        new Error("Cannot start server while it is stopping"),
      );
    }

    this.lifecycleState = "starting";
    this.startPromise = new Promise<this>((resolve, reject) => {
      const onError = (error: Error): void => {
        cleanup();
        this.lifecycleState = "idle";
        this.startPromise = null;
        reject(error);
      };
      const onListening = (): void => {
        cleanup();
        this.lifecycleState = "running";
        this.startPromise = null;

        const address = this.address;
        const displayAddress = address
          ? `${address.address}:${address.port}`
          : `${this.host}:${this.port}`;

        console.log(`Rocket.js server listening on ${displayAddress}`);
        resolve(this);
      };
      const cleanup = (): void => {
        this.server.off("error", onError);
        this.server.off("listening", onListening);
      };

      this.server.once("error", onError);
      this.server.once("listening", onListening);

      try {
        this.server.listen(this.port, this.host);
      } catch (error) {
        onError(
          error instanceof Error
            ? error
            : new Error("Rocket.js server failed to start"),
        );
      }
    });

    return this.startPromise;
  }

  async stop(): Promise<void> {
    if (
      this.lifecycleState === "idle" ||
      this.lifecycleState === "stopped"
    ) {
      return;
    }

    if (this.lifecycleState === "starting") {
      await this.startPromise;
      return this.stop();
    }

    if (this.lifecycleState === "stopping") {
      return this.stopPromise ?? Promise.resolve();
    }

    this.lifecycleState = "stopping";
    this.stopPromise = new Promise<void>((resolve, reject) => {
      const forceCloseTimer = setTimeout(() => {
        for (const socket of this.sockets) {
          socket.destroy();
        }
      }, this.shutdownTimeoutMs);

      forceCloseTimer.unref();

      this.server.close((error) => {
        clearTimeout(forceCloseTimer);
        this.lifecycleState = "stopped";
        this.stopPromise = null;

        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    return this.stopPromise;
  }

  private handleConnection(socket: net.Socket): void {
    if (this.lifecycleState !== "running") {
      socket.destroy();
      return;
    }

    this.sockets.add(socket);
    socket.once("close", () => {
      this.sockets.delete(socket);
    });

    const connectionBuffer = new ConnectionBuffer({
      maxHeaderSize: this.maxHeaderSize,
      maxRequestSize: this.maxRequestSize,
    });
    let requestHandled = false;

    socket.on("data", (data) => {
      if (requestHandled) {
        return;
      }

      try {
        connectionBuffer.append(data);

        const message = connectionBuffer.tryReadMessage();

        if (!message) {
          return;
        }

        if (connectionBuffer.hasPendingData()) {
          throw new BadRequestError(
            "Only one request is allowed per connection",
          );
        }

        requestHandled = true;
        socket.pause();
        this.handleData(message, socket);
      } catch (error) {
        requestHandled = true;
        socket.pause();
        this.writeErrorResponse(
          error,
          connectionBuffer.usesHttpSyntax(),
          socket,
        );
      }
    });

    socket.setTimeout(this.requestTimeoutMs);

    socket.on("timeout", () => {
      if (requestHandled) {
        return;
      }

      requestHandled = true;
      this.writeErrorResponse(
        new BadRequestError("Request timed out before it was complete"),
        connectionBuffer.usesHttpSyntax(),
        socket,
      );
    });

    socket.on("end", () => {
      if (!requestHandled && connectionBuffer.hasPendingData()) {
        requestHandled = true;
        this.writeErrorResponse(
          new BadRequestError("Incomplete request"),
          connectionBuffer.usesHttpSyntax(),
          socket,
        );
      }
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error.message);
    });
  }

  private handleData(data: Buffer | string, socket: net.Socket): void {
    let response: Response;
    let isHttpRequest = false;

    try {
      const requestText =
        typeof data === "string" ? data : data.toString("utf8");

      isHttpRequest = requestText.split("\n")[0]?.includes("HTTP/") ?? false;

      const request = this.requestParse.parse(requestText, {
        clientAddress: this.normalizeClientAddress(socket.remoteAddress),
      });

      response = this.pipeline.execute(request, () =>
        this.router.handle(request),
      );
    } catch (error) {
      response = ErrorResponseMapper.toResponse(error);
    }

    this.writeResponse(response, isHttpRequest, socket);
  }

  private writeErrorResponse(
    error: unknown,
    isHttpRequest: boolean,
    socket: net.Socket,
  ): void {
    this.writeResponse(
      ErrorResponseMapper.toResponse(error),
      isHttpRequest,
      socket,
    );
  }

  private writeResponse(
    response: Response,
    isHttpRequest: boolean,
    socket: net.Socket,
  ): void {
    const responseText = isHttpRequest
      ? response.serializeHttp()
      : response.serialize();

    socket.end(responseText);
  }

  private validatePositiveInteger(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive integer`);
    }
  }

  private validateHost(host: string): void {
    if (!host.trim()) {
      throw new TypeError("host must not be empty");
    }
  }

  private validatePort(port: number): void {
    if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
      throw new TypeError("port must be an integer from 0 to 65535");
    }
  }

  private normalizeClientAddress(address: string | undefined): string {
    if (!address) {
      return "unknown";
    }

    return address.startsWith("::ffff:")
      ? address.slice("::ffff:".length)
      : address;
  }
}
