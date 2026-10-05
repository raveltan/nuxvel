import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { takeFreeLoopbackPort } from "../src/runtime/release/tinker-port";

const NITRO_NODE_SERVER = `import { createServer } from "node:http";
const port = Number(process.env.NITRO_PORT || process.env.PORT) || 3000;
export const server = createServer();
await new Promise((resolve, reject) => server.once("error", reject).listen(port, process.env.NITRO_HOST, resolve));
`;

function holdPort3000() {
  const holder = createServer();
  return new Promise<Server | undefined>((resolve) => {
    holder.once("error", () => resolve(undefined));
    holder.listen(3000, "127.0.0.1", () => resolve(holder));
  });
}

describe("the tinker.mjs release entry", () => {
  it("gives the app server a free loopback port, not Nitro's fallback 3000, while 3000 is busy", async () => {
    const saved = { NITRO_HOST: process.env.NITRO_HOST, NITRO_PORT: process.env.NITRO_PORT };
    const holder = await holdPort3000();
    const dir = await mkdtemp(join(tmpdir(), "nuxvel-tinker-port-"));
    const entry = pathToFileURL(join(dir, "index.mjs"));

    await writeFile(entry, NITRO_NODE_SERVER);

    try {
      await takeFreeLoopbackPort();
      const { server } = await import(entry.href);
      const address = server.address();

      expect(address.address).toBe("127.0.0.1");
      expect(address.port).not.toBe(3000);
      await new Promise((resolve) => server.close(resolve));
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      holder?.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
