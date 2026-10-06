import { describe, it } from "vitest";
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("procedure builder methods", async () => {
  await setupPlayground();

  it("runs an action with .action() as the caller, and carries its errors", async () => {
    const author = await userFactory();
    const post = await postFactory({ authorId: author.id });
    const caller = actingAs(author).trpc._procedureMethodsCheck;

    await expect(caller.update({ id: post.id, title: "Renamed", body: "Body" })).resolves.toMatchObject({ id: post.id, title: "Renamed" });
    await expect(caller.update({ id: post.id, title: "Renamed", body: "  " })).rejects.toBeActionError("post.body-empty");
    await expect(caller.whoami()).resolves.toEqual({ type: "user", id: author.id });
  });

  it("sends only the fields of the action's output schema when the procedure has no .output()", async () => {
    await expect(guest().trpc._procedureMethodsCheck.secret()).resolves.toEqual({ id: 1 });
  });

  it("runs an action of a public procedure as the guest actor when nobody is signed in", async () => {
    await expect(guest().trpc._procedureMethodsCheck.whoami()).resolves.toEqual({ type: "guest", id: "guest" });
  });

  it("serves .openapi() with the method of the procedure, the path of the procedure and the tag of the router", async () => {
    const author = await userFactory();
    const post = await postFactory({ authorId: author.id });

    const greeting = await guest().fetch("/api/v1/_procedure-methods-check/greet?name=Ada");
    const renamed = await actingAs(author).fetch(`/api/v1/_procedure-methods/${post.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Over REST", body: "Body" }),
    });
    const document = await (await guest().fetch("/api/v1/openapi.json")).json();

    expect(await greeting.json()).toBe("Hello, Ada");
    expect(await renamed.json()).toEqual({ id: post.id, title: "Over REST" });
    expect(document.paths["/_procedure-methods-check/greet"].get).toMatchObject({ summary: "Greet", tags: ["_procedureMethodsCheck"] });
    expect(document.paths["/_procedure-methods/{id}"].post).toMatchObject({ tags: ["posts"] });
  });
});
