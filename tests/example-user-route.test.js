import assert from "node:assert/strict";
import test from "node:test";
import { ControllerRegistrar } from "../dist/src/controller/controller-registrar.js";
import { UserController } from "../dist/src/example/user/user.controller.js";
import { UserRepository } from "../dist/src/example/user/user.repository.js";
import { UserService } from "../dist/src/example/user/user.service.js";
import { Request } from "../dist/src/protocol/request.js";
import { Router } from "../dist/src/router/router.js";

test("registers the example user endpoints", () => {
  const router = new Router();
  const repository = new UserRepository();
  const service = new UserService(repository);

  new ControllerRegistrar(router).register(new UserController(service));

  const created = router.handle(
    new Request(
      "POST",
      "/users",
      { "content-type": "application/json" },
      JSON.stringify({ name: "Ada" }),
    ),
  );
  const profile = router.handle(new Request("GET", "/users/me"));

  assert.equal(created.status, 201);
  assert.deepEqual(JSON.parse(created.body), { id: 1, name: "Ada" });
  assert.equal(profile.status, 200);
  assert.deepEqual(JSON.parse(profile.body), {
    name: "ujwal",
    location: "kathmandu",
  });
});
