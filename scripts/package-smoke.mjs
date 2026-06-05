import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), "rocket-package-smoke-"),
);
const cacheDirectory = path.join(temporaryRoot, "npm-cache");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: cacheDirectory,
    },
  });

  if (result.status !== 0) {
    throw new Error(
      [`${command} ${args.join(" ")} failed`, result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

try {
  run(
    "npm",
    ["pack", "--pack-destination", temporaryRoot, "--silent"],
    projectRoot,
  );

  const archiveName = (await readdir(temporaryRoot)).find((name) =>
    name.endsWith(".tgz"),
  );

  assert.ok(archiveName, "npm pack did not create an archive");

  await writeFile(
    path.join(temporaryRoot, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );

  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      path.join(temporaryRoot, archiveName),
    ],
    temporaryRoot,
  );

  await writeFile(
    path.join(temporaryRoot, "consumer.ts"),
    `
import {
  Controller,
  Get,
  Response,
  Rocket,
  type ProtocolServer,
} from "@ujwa_bholan/rocket.js";

@Controller()
class AppController {
  @Get("/")
  home(): Response {
    return Response.text("Typed consumer works");
  }
}

class Application {
  private readonly app = new Rocket();
  private server: ProtocolServer | null = null;

  constructor() {
    this.app.registerController(new AppController());
  }

  async start(): Promise<void> {
    this.server = await this.app.listen({ port: 0 });
  }

  async stop(): Promise<void> {
    await this.server?.stop();
  }
}

void Application;
`,
  );
  await writeFile(
    path.join(temporaryRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        experimentalDecorators: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: "ES2022",
        verbatimModuleSyntax: true,
      },
      include: ["consumer.ts"],
    }),
  );

  run(
    path.join(projectRoot, "node_modules", ".bin", "tsc"),
    ["--project", "tsconfig.json"],
    temporaryRoot,
  );

  await writeFile(
    path.join(temporaryRoot, "consumer.mjs"),
    String.raw`
import assert from "node:assert/strict";
import net from "node:net";
import {
  Response,
  Rocket,
} from "@ujwa_bholan/rocket.js";

const app = new Rocket();
app.get("/", () => Response.text("Installed Rocket.js works"));

const server = await app.listen({
  host: "127.0.0.1",
  port: 0,
  shutdownTimeoutMs: 100,
});
const address = server.address;

assert.ok(address);

const response = await new Promise((resolve, reject) => {
  const socket = net.createConnection({
    host: address.address,
    port: address.port,
  });
  let data = "";

  socket.setEncoding("utf8");
  socket.on("connect", () => {
    socket.write("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n");
  });
  socket.on("data", (chunk) => {
    data += chunk;
  });
  socket.on("end", () => resolve(data));
  socket.on("error", reject);
});

assert.match(response, /^HTTP\/1\.1 200 OK/);
assert.match(response, /Installed Rocket\.js works$/);

await server.stop();
assert.equal(server.state, "stopped");
`,
  );

  run("node", ["consumer.mjs"], temporaryRoot);
  console.log("Clean package consumer smoke test passed");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
