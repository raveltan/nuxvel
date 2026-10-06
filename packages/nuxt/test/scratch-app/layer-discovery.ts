import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

export function addBaseLayer(appDir: string) {
  function write(path: string, contents: string) {
    mkdirSync(dirname(join(appDir, path)), { recursive: true });
    writeFileSync(join(appDir, path), contents);
  }

  write("layers/base/nuxt.config.ts", "export default defineNuxtConfig({});\n");
  write(
    "layers/base/server/jobs/layer/ping.ts",
    `import { z } from "zod";

export default defineJob({ input: z.object({}), handler: async () => {} });
`,
  );
  write(
    "layers/base/server/jobs/shared.ts",
    `import { z } from "zod";

export default defineJob({ version: 1, input: z.object({}), handler: async () => {} });
`,
  );
  write(
    "server/jobs/shared.ts",
    `import { z } from "zod";

export default defineJob({ version: 2, input: z.object({}), handler: async () => {} });
`,
  );
  write(
    "layers/base/server/trpc/routers/layer-ping.ts",
    'export default { ping: publicProcedure.query(() => "pong from the layer") };\n',
  );
  write(
    "layers/base/server/trpc/routers/shared-ping.ts",
    'export default { ping: publicProcedure.query(() => "pong from the layer") };\n',
  );
  write(
    "server/trpc/routers/shared-ping.ts",
    'export default { ping: publicProcedure.query(() => "pong from the app") };\n',
  );
  write("layers/base/server/mail/templates/Greeting.vue", "<template><MailLayout><EText>Hello from the layer</EText></MailLayout></template>\n");
  write("server/mail/templates/Greeting.vue", "<template><MailLayout><EText>Hello from the app</EText></MailLayout></template>\n");
  write(
    "layers/base/server/mail/greeting.mail.ts",
    `import { z } from "zod";

export default defineMail({ input: z.object({ to: z.email() }), subject: () => "Hello", template: "Greeting" });
`,
  );
  write(
    "server/api/layer-mail.get.ts",
    'export default defineEventHandler(() => $mails.greeting.render({ to: "ada@example.com" }));\n',
  );
  write(
    "server/api/layer-jobs.get.ts",
    `import jobs from "#nuxvel/jobs";

export default defineEventHandler(() => jobs.map((job) => [job.name, job.version]));
`,
  );
}

describe("an app extending a layer that ships server files", () => {
  it("discovers the layer's job, named after its path in the layer", async () => {
    expect(await guest().$fetch<[string, number][]>("/api/layer-jobs")).toContainEqual(["layer.ping", 1]);
  });

  it("lets the app's file hide the layer's file of the same name", async () => {
    const shared = (await guest().$fetch<[string, number][]>("/api/layer-jobs")).filter(([name]) => name === "shared");

    expect(shared).toEqual([["shared", 2]]);
  });

  it("renders a layer's mail with the app's template of the same name", async () => {
    const { text } = await guest().$fetch<{ text: string }>("/api/layer-mail");

    expect(text).toContain("Hello from the app");
    expect(text).not.toContain("from the layer");
  });

  it("mounts the layer's tRPC router", async () => {
    const body = await guest().$fetch<{ result: { data: { json: string } } }>("/api/trpc/layerPing.ping");

    expect(body.result.data.json).toBe("pong from the layer");
  });

  it("lets the app's router hide the layer's router on the same namespace", async () => {
    const body = await guest().$fetch<{ result: { data: { json: string } } }>("/api/trpc/sharedPing.ping");

    expect(body.result.data.json).toBe("pong from the app");
  });
});
