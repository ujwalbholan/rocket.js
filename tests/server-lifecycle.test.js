import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { Response } from "../dist/src/protocol/response.js";
import { Rocket } from "../dist/src/rocket.js";

function sendHttpRequest(address, path = "/") {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: address.address,
      port: address.port,
    });
    let response = "";

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: localhost\r\n\r\n`,
      );
    });
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.on("end", () => {
      resolve(response);
    });
    socket.on("error", reject);
  });
}

test("starts, serves requests, stops, and can restart", async () => {
  const app = new Rocket();
  app.get("/", () => Response.text("Hello lifecycle"));

  const server = await app.listen({
    host: "127.0.0.1",
    port: 0,
    shutdownTimeoutMs: 100,
  });

  try {
    assert.equal(server.state, "running");
    assert.equal(server.isRunning, true);
    assert.ok(server.address);
    assert.ok(server.address.port > 0);

    const response = await sendHttpRequest(server.address);

    assert.match(response, /^HTTP\/1\.1 200 OK/);
    assert.match(response, /Hello lifecycle$/);
    await assert.rejects(
      server.start(),
      /Cannot start server while it is running/,
    );
  } finally {
    await server.stop();
  }

  assert.equal(server.state, "stopped");
  assert.equal(server.isRunning, false);
  assert.equal(server.address, null);

  await server.stop();
  await server.start();

  assert.equal(server.isRunning, true);
  await server.stop();
});

test("reports startup errors such as an occupied port", async () => {
  const firstApp = new Rocket();
  const first = await firstApp.listen({
    host: "127.0.0.1",
    port: 0,
  });
  const address = first.address;

  assert.ok(address);

  try {
    const secondApp = new Rocket();

    await assert.rejects(
      secondApp.listen({
        host: "127.0.0.1",
        port: address.port,
      }),
      (error) => error?.code === "EADDRINUSE",
    );
  } finally {
    await first.stop();
  }
});

test("validates server configuration before listening", async () => {
  const app = new Rocket();

  await assert.rejects(
    app.listen({ port: -1 }),
    /port must be an integer from 0 to 65535/,
  );
  await assert.rejects(
    app.listen({ port: 65_536 }),
    /port must be an integer from 0 to 65535/,
  );
  await assert.rejects(
    app.listen({ host: " " }),
    /host must not be empty/,
  );
  await assert.rejects(
    app.listen({ shutdownTimeoutMs: 0 }),
    /shutdownTimeoutMs must be a positive integer/,
  );
});

test("force closes connections that outlive the shutdown timeout", async () => {
  const app = new Rocket();
  const server = await app.listen({
    host: "127.0.0.1",
    port: 0,
    requestTimeoutMs: 5_000,
    shutdownTimeoutMs: 20,
  });
  const address = server.address;

  assert.ok(address);

  const socket = net.createConnection({
    host: address.address,
    port: address.port,
  });

  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });

  const clientClosed = new Promise((resolve) => {
    socket.once("close", resolve);
  });

  await server.stop();
  await clientClosed;

  assert.equal(server.state, "stopped");
  assert.equal(socket.destroyed, true);
});
