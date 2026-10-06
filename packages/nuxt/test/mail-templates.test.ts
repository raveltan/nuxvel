import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, describe, it } from "vitest";
import { discoverMailTemplates } from "../src/mail-templates";

const root = join(mkdtempSync(join(tmpdir(), "nuxvel-mail-templates-")), "mail", "templates", "app");
const appServer = join(root, "server");
const layerServer = join(root, "layers", "base", "server");

function write(serverDir: string, path: string) {
  const file = join(serverDir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "<template><MailLayout /></template>\n");

  return file;
}

describe("mail template discovery", () => {
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("names a template by its path under its server folder, also when a parent folder is called mail/templates", async () => {
    const welcome = write(appServer, "mail/templates/Welcome.vue");
    const shipped = write(appServer, "mail/templates/order/Shipped.vue");
    const packed = write(appServer, "domains/parcel/mail/templates/Packed.vue");

    expect(Object.fromEntries(await discoverMailTemplates([appServer]))).toEqual({ Welcome: welcome, "order/Shipped": shipped, Packed: packed });
  });

  it("prefers mail/templates/ over a domain folder, and the app over a layer", async () => {
    const top = write(appServer, "mail/templates/Receipt.vue");
    write(appServer, "domains/billing/mail/templates/Receipt.vue");
    const app = write(appServer, "mail/templates/Greeting.vue");
    write(layerServer, "mail/templates/Greeting.vue");
    const layerOnly = write(layerServer, "mail/templates/Digest.vue");

    const templates = await discoverMailTemplates([appServer, layerServer]);

    expect(templates.get("Receipt")).toBe(top);
    expect(templates.get("Greeting")).toBe(app);
    expect(templates.get("Digest")).toBe(layerOnly);
  });

  it("stops the build when two domain folders have a template of the same name", async () => {
    const server = join(root, "clash", "server");
    const billing = write(server, "domains/billing/mail/templates/Notice.vue");
    const shop = write(server, "domains/shop/mail/templates/Notice.vue");

    await expect(discoverMailTemplates([server])).rejects.toThrow(
      `nuxvel: ${billing} and ${shop} both name the mail template "Notice"; rename one of them`,
    );
  });
});
