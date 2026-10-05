import { describe, it } from "vitest";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { buildTrpcRoutersModuleCode } from "../src/trpc-routers";
import { setupPlayground } from "./helpers/playground";

const routers = "/app/server/trpc/routers";
const layerRouters = "/app/layers/base/server/trpc/routers";

function build(...files: string[]) {
  return () => buildTrpcRoutersModuleCode([{ dir: routers, files: files.map((file) => `${routers}/${file}`) }]);
}

function buildLayered(appFiles: string[], layerFiles: string[]) {
  return buildTrpcRoutersModuleCode([
    { dir: routers, files: appFiles.map((file) => `${routers}/${file}`) },
    { dir: layerRouters, files: layerFiles.map((file) => `${layerRouters}/${file}`) },
  ]);
}

describe("tRPC router namespaces", () => {
  it("nest folders and camel-case kebab-case names", () => {
    const code = build("health.ts", "post-comments/list-recent.ts", "post-comments/pinned.ts")();

    expect(code).toContain("export default { health: router0, postComments: { listRecent: router1, pinned: router2 } };");
  });

  it("drop the .router.ts suffix, so a suffixed file and a plain one clash", () => {
    expect(build("task.router.ts", "admin/user-roles.router.ts")()).toContain(
      "export default { task: router0, admin: { userRoles: router1 } };",
    );
    expect(build("task.ts", "task.router.ts")).toThrow(
      'nuxvel: server/trpc/routers/task.ts and server/trpc/routers/task.router.ts both define the tRPC namespace "task"',
    );
  });

  it("give a domain router its domain, and a router named after its domain the domain itself", () => {
    const domainBuild = (...files: string[]) =>
      buildTrpcRoutersModuleCode([{ dir: routers, files: files.map((file) => `/app/server/domains/${file}`) }]);

    expect(domainBuild("post/routers/post.router.ts", "order/routers/shipments.router.ts")).toContain(
      "export default { post: router0, order: { shipments: router1 } };",
    );
    expect(() => domainBuild("post/routers/post.router.ts", "post/routers/comments.router.ts")).toThrow(
      'nuxvel: server/domains/post/routers/post.router.ts and server/domains/post/routers/comments.router.ts both define the tRPC namespace "post"',
    );
  });

  it("refuse a router file next to a folder with the same name", () => {
    expect(build("posts.ts", "posts/comments.ts")).toThrow(
      'nuxvel: server/trpc/routers/posts.ts and server/trpc/routers/posts/comments.ts both define the tRPC namespace "posts"',
    );
    expect(build("posts/comments.ts", "posts.ts")).toThrow('both define the tRPC namespace "posts"');
  });

  it("refuse two files that camel-case to one name", () => {
    expect(build("post-list.ts", "postList.ts")).toThrow(
      'nuxvel: server/trpc/routers/post-list.ts and server/trpc/routers/postList.ts both define the tRPC namespace "postList"',
    );
  });

  it("let a higher layer's namespace hide a lower layer's router on it or under it", () => {
    const code = buildLayered(["posts.ts", "admin/users.ts"], ["posts.ts", "posts/comments.ts", "admin/users.ts", "admin/roles.ts"]);

    expect(code).toContain("export default { posts: router0, admin: { users: router1, roles: router2 } };");
    expect(code).toContain(`import * as router2Module from "${layerRouters}/admin/roles.ts";`);
    expect(code).not.toContain(`${layerRouters}/posts`);
    expect(code).not.toContain(`${layerRouters}/admin/users.ts`);
  });

  it("refuse two modules in layers/ that define the same namespace, even when the app hides it", () => {
    const billing = "/app/layers/billing/server/trpc/routers";
    const shop = "/app/layers/shop/server/trpc/routers";
    const shopDomainFile = "/app/layers/shop/server/domains/invoice/routers/invoice.router.ts";

    expect(() =>
      buildTrpcRoutersModuleCode([
        { dir: routers, files: [`${routers}/invoice.ts`] },
        { dir: billing, files: [`${billing}/invoice/items.router.ts`], module: "billing" },
        { dir: shop, files: [shopDomainFile], module: "shop" },
      ]),
    ).toThrow(
      `nuxvel: ${billing}/invoice/items.router.ts and ${shopDomainFile} both define the tRPC namespace "invoice"; rename one of them`,
    );
  });

  it("hide a lower layer's router under a namespace the higher layer defines as a router", () => {
    expect(buildLayered(["admin.ts"], ["admin/users.ts"])).toContain("export default { admin: router0 };");
    expect(buildLayered(["admin/users.ts"], ["admin.ts"])).toContain("export default { admin: { users: router0 } };");
  });
});

describe("a playground router file with the .router.ts suffix and a named export", async () => {
  await setupPlayground();

  it("serves the procedures of its Router export under the namespace without the suffix", async () => {
    expect(await guest().trpc._suffixedCheck.ping()).toBe("pong");
  });
});
