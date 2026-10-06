import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, it } from "vitest";
import { expect, expectRow, guest, runJob } from "@nuxvel/nuxt/testing";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { buildNamespaceModules } from "../src/definition-namespaces";
import { buildDiscoveredModuleCode } from "../src/discovered-module";
import { buildEventsModuleCode } from "../src/events";
import { buildUserDataModuleCode } from "../src/user-data";
import { nameFiles } from "../src/named-files";
import { resolveName, storedName } from "../src/runtime/server/discovery/aliases";
import { setupPlayground } from "./helpers/playground";

const fixturesDir = fileURLToPath(new URL("./type-fixtures", import.meta.url));
const defineChannel = fileURLToPath(new URL("../src/runtime/server/realtime/define-channel.ts", import.meta.url));
const defineEvent =fileURLToPath(new URL("../src/runtime/server/events/define-event.ts", import.meta.url));
const defineUserData = fileURLToPath(new URL("../src/runtime/server/privacy/define-user-data.ts", import.meta.url));
const healthCheckSchema = fileURLToPath(new URL("../../../playground/server/database/schema/health-check.schema.ts", import.meta.url));
const renamedModule = fileURLToPath(new URL("../src/runtime/server/discovery/renamed.ts", import.meta.url));
const appDir = mkdtempSync(join(fixturesDir, ".nuxvel-test-definition-names-"));

function write(path: string, contents: string) {
  const file = join(appDir, path);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);

  return file;
}

function definitionFile(path: string) {
  return write(
    path,
    `import { defineChannel } from ${JSON.stringify(defineChannel)};\n\nexport default defineChannel({ events: {}, authorize: () => true });\n`,
  );
}

async function loadModule(path: string, code: string) {
  const loaded = await import(write(path, code));

  if (Array.isArray(loaded.default)) loaded.default.length;

  return loaded;
}

describe("a definition's name", () => {
  afterAll(() => {
    rmSync(appDir, { recursive: true, force: true });
  });

  it("is its path under its folder, segments joined with dots and file names kept", () => {
    const dir = join(appDir, "layer-a/server/jobs");

    expect(
      nameFiles("job", [{ dir, files: [join(dir, "post/notify-followers.ts"), join(dir, "_probe/record.ts"), join(dir, "sync.ts")] }]),
    ).toEqual([
      { file: join(dir, "post/notify-followers.ts"), name: "post.notify-followers" },
      { file: join(dir, "_probe/record.ts"), name: "_probe.record" },
      { file: join(dir, "sync.ts"), name: "sync" },
    ]);
  });

  it("drops the kind suffix of its folder and keeps any other suffix", () => {
    const jobs = join(appDir, "suffixed/server/jobs");
    const flags = join(appDir, "suffixed/server/flags");
    const backfills = join(appDir, "suffixed/server/database/backfills");

    expect(
      nameFiles("job", [{ dir: jobs, files: [join(jobs, "post/notify-subscribers.job.ts"), join(jobs, "post/archive.mail.ts")] }]),
    ).toEqual([
      { file: join(jobs, "post/notify-subscribers.job.ts"), name: "post.notify-subscribers" },
      { file: join(jobs, "post/archive.mail.ts"), name: "post.archive.mail" },
    ]);
    expect(
      nameFiles("flag or experiment", [{ dir: flags, files: [join(flags, "dark-mode.flag.ts"), join(flags, "checkout.experiment.ts")] }]),
    ).toEqual([
      { file: join(flags, "dark-mode.flag.ts"), name: "dark-mode" },
      { file: join(flags, "checkout.experiment.ts"), name: "checkout" },
    ]);
    expect(nameFiles("backfill", [{ dir: backfills, files: [join(backfills, "fill-slugs.backfill.ts")] }])).toEqual([
      { file: join(backfills, "fill-slugs.backfill.ts"), name: "fill-slugs" },
    ]);
  });

  it("fails the build when a file with the kind suffix and one without it give the same name", () => {
    const dir = join(appDir, "suffixed/server/jobs");

    expect(() => nameFiles("job", [{ dir, files: [join(dir, "post/notify.ts"), join(dir, "post/notify.job.ts")] }])).toThrow(
      `nuxvel: ${join(dir, "post/notify.ts")} and ${join(dir, "post/notify.job.ts")} both name the job "post.notify"; rename one of them`,
    );
  });

  it("comes from the highest layer that defines it, and nuxvel's own definitions come last", () => {
    const app = join(appDir, "app/server/jobs");
    const layer = join(appDir, "layer/server/jobs");
    const builtIn = { file: join(appDir, "deliver-mail.ts"), name: "nuxvel.mail" };

    expect(
      nameFiles(
        "job",
        [
          { dir: app, files: [join(app, "post/notify.ts")] },
          { dir: layer, files: [join(layer, "post/notify.ts"), join(layer, "layer/ping.ts")] },
        ],
        [builtIn],
      ),
    ).toEqual([
      { file: join(app, "post/notify.ts"), name: "post.notify" },
      { file: join(layer, "layer/ping.ts"), name: "layer.ping" },
      builtIn,
    ]);
  });

  it("fails the build when two files of one layer, or a file and a built-in, give the same name", () => {
    const dir = join(appDir, "server/channels");

    expect(() =>
      nameFiles("channel", [{ dir, files: [join(dir, "post.comments.ts"), join(dir, "post/comments.ts")] }]),
    ).toThrow(
      `nuxvel: ${join(dir, "post.comments.ts")} and ${join(dir, "post/comments.ts")} both name the channel "post.comments"; rename one of them`,
    );
    expect(() =>
      nameFiles("channel", [{ dir, files: [join(dir, "flags.ts")] }], [{ file: "flags-channel.ts", name: "flags" }]),
    ).toThrow(`nuxvel: ${join(dir, "flags.ts")} is named "flags", the name of nuxvel's built-in channel; rename it`);
  });

  it("fails the build when two modules in layers/ give the same name, even when the app hides it", () => {
    const app = join(appDir, "server/jobs");
    const billing = join(appDir, "layers/billing/server/jobs");
    const shop = join(appDir, "layers/shop/server/jobs");
    const shopDomainFile = join(appDir, "layers/shop/server/domains/invoice/jobs/charge.job.ts");

    expect(() =>
      nameFiles("job", [
        { dir: app, files: [join(app, "invoice/charge.ts")] },
        { dir: billing, files: [join(billing, "invoice/charge.job.ts")], module: "billing" },
        { dir: shop, files: [shopDomainFile], module: "shop" },
      ]),
    ).toThrow(`nuxvel: ${join(billing, "invoice/charge.job.ts")} and ${shopDomainFile} both name the job "invoice.charge"; rename one of them`);

    const billingPolicies = join(appDir, "layers/billing/server/policies");
    const shopPolicies = join(appDir, "layers/shop/server/policies");
    const shopPolicyFile = join(appDir, "layers/shop/server/domains/invoice/policies/invoice.policy.ts");

    expect(() =>
      nameFiles("policy", [
        { dir: billingPolicies, files: [join(billingPolicies, "invoice.policy.ts")], module: "billing" },
        { dir: shopPolicies, files: [shopPolicyFile], module: "shop" },
      ]),
    ).toThrow(`nuxvel: ${join(billingPolicies, "invoice.policy.ts")} and ${shopPolicyFile} both name the policy "invoice"; rename one of them`);
  });

  it("cannot be read before the registry names it, while no registry failed", async () => {
    const { default: channel } = await import(definitionFile("channels/unnamed.ts"));

    expect(() => channel.name).toThrow("nuxvel: this channel has no name yet");
  });

  it("is given to each definition as the generated registry loads", async () => {
    const comments = definitionFile("channels/post/comments.ts");
    const registry = await loadModule(
      "channels-registry.ts",
      buildDiscoveredModuleCode("channels", [{ file: comments, name: "post.comments" }]),
    );
    const direct = await import(comments);

    expect(registry.default.map((channel: { name: string }) => channel.name)).toEqual(["post.comments"]);
    expect(direct.default.name).toBe("post.comments");
  });

  it("comes from a named export with the kind suffix, ignores a suffixed helper, and refuses two definitions in one file", async () => {
    const named = write(
      "channels/post/named.ts",
      `import { defineChannel } from ${JSON.stringify(defineChannel)};\n\nexport const namedChannel = defineChannel({ events: {}, authorize: () => true });\nexport const helper = 1;\nexport function previewChannel() {}\n`,
    );
    const both = write(
      "channels/post/both.ts",
      `import { defineChannel } from ${JSON.stringify(defineChannel)};\n\nexport const bothChannel = defineChannel({ events: {}, authorize: () => true });\nexport default defineChannel({ events: {}, authorize: () => true });\n`,
    );
    const registry = await loadModule("named-registry.ts", buildDiscoveredModuleCode("channels", [{ file: named, name: "post.named" }]));

    expect(registry.default.map((channel: { name: string }) => channel.name)).toEqual(["post.named"]);
    await expect(
      loadModule("both-registry.ts", buildDiscoveredModuleCode("channels", [{ file: both, name: "post.both" }])),
    ).rejects.toThrow(`nuxvel: ${both} exports 2 definitions; export one, as the default export or as a named export whose name ends with Channel`);
  });

  it("of user data comes from a named export ending with UserData and ignores a suffixed helper", async () => {
    const header = `import { healthChecksTable } from ${JSON.stringify(healthCheckSchema)};\nimport { defineUserData } from ${JSON.stringify(defineUserData)};\n\n`;
    const named = write(
      "privacy/checks.user-data.ts",
      `${header}export const checksUserData = defineUserData(healthChecksTable, healthChecksTable.userId);\nexport function previewUserData() {}\n`,
    );
    const both = write(
      "privacy/both.user-data.ts",
      `${header}export const bothUserData = defineUserData(healthChecksTable, healthChecksTable.userId);\nexport default defineUserData(healthChecksTable, healthChecksTable.name);\n`,
    );
    const registry = await loadModule("user-data-registry.ts", buildUserDataModuleCode([named]));

    expect(registry.default.map((declaration: { column: unknown }) => declaration.column)).toEqual([healthChecksTable.userId]);
    await expect(loadModule("both-user-data-registry.ts", buildUserDataModuleCode([both]))).rejects.toThrow(
      `nuxvel: ${both} exports 2 definitions; export one, as the default export or as a named export whose name ends with UserData`,
    );
  });

  it("is given when the registry is read, so a definition whose file imports its own registry loads first", async () => {
    const registryFile = join(appDir, "cyclic-registry.ts");
    const cyclic = write(
      "channels/cyclic.ts",
      `import registry from ${JSON.stringify(registryFile)};\nimport { defineChannel } from ${JSON.stringify(defineChannel)};\n\nexport const registered = () => registry;\nexport default defineChannel({ events: {}, authorize: () => true });\n`,
    );

    write("cyclic-registry.ts", buildDiscoveredModuleCode("channels", [{ file: cyclic, name: "cyclic" }]));

    const { default: channel, registered } = await import(cyclic);

    expect(channel.name).toBe("cyclic");
    expect(registered()).toEqual([channel]);
  });

  it("refuses a file that does not export a definition", async () => {
    const plain = write("channels/plain.ts", "export default { events: {} };\n");

    await expect(
      loadModule("plain-registry.ts", buildDiscoveredModuleCode("channels", [{ file: plain, name: "plain" }])),
    ).rejects.toThrow(`nuxvel: ${plain} does not export a nuxvel definition;`);
  });

  it("refuses a definition discovered under two paths, naming both files", async () => {
    const original = definitionFile("channels/original.ts");
    const copy = write("channels/copy.ts", `export { default } from ${JSON.stringify(original)};\n`);

    await expect(
      loadModule(
        "copied-registry.ts",
        buildDiscoveredModuleCode("channels", [
          { file: original, name: "original" },
          { file: copy, name: "copy" },
        ]),
      ),
    ).rejects.toThrow(`nuxvel: ${copy} exports the definition ${original} already exports;`);
  });

  it("stays reachable through a renamed() alias left at the old path, for kinds that store data under it", async () => {
    const moved = definitionFile("webhooks/billing/stripe.ts");
    const alias = write(
      "webhooks/stripe.ts",
      `import { renamed } from ${JSON.stringify(renamedModule)};\nimport stripe from "./billing/stripe";\n\nexport default renamed(stripe);\n`,
    );
    const registry = await loadModule(
      "webhooks-registry.ts",
      buildDiscoveredModuleCode("webhooks", [
        { file: moved, name: "billing.stripe" },
        { file: alias, name: "stripe" },
      ]),
    );
    const [definition] = registry.default;

    expect(resolveName(registry.default, "stripe")).toBe(definition);
    expect(storedName(registry.default, definition)).toBe("stripe");
    expect(() => storedName([...registry.default, { name: "older", renamedTo: definition }], definition)).toThrow(
      '"billing.stripe" has more than one renamed() alias (stripe, older)',
    );
  });

  it("is given to a definition whose registry loaded another copy of the naming module", async () => {
    const copied = definitionFile("channels/copied-module.ts");
    const code = buildDiscoveredModuleCode("channels", [{ file: copied, name: "copied-module" }]).replace(
      /from "([^"]*\/definition-name)"/,
      'from "$1.ts?copy"',
    );

    expect(code).toContain("definition-name.ts?copy");
    write("copied-module-registry.ts", code);
    await import(join(appDir, "copied-module-registry.ts"));

    const { default: channel } = await import(copied);

    expect(channel.name).toBe("copied-module");
  });

  it("rethrows the error of a registry that failed, when an unnamed definition's name is read", async () => {
    const plain = write("channels/plain-again.ts", "export default { events: {} };\n");
    const { default: channel } = await import(definitionFile("channels/still-unnamed.ts"));

    await expect(
      loadModule("plain-again-registry.ts", buildDiscoveredModuleCode("channels", [{ file: plain, name: "plain-again" }])),
    ).rejects.toThrow(`nuxvel: ${plain} does not export a nuxvel definition;`);
    expect(() => channel.name).toThrow(`nuxvel: ${plain} does not export a nuxvel definition;`);
  });

  it("stops the server at a renamed() alias of a kind that stores nothing under its name", async () => {
    const moved = definitionFile("channels/post/updates.ts");
    const alias = write(
      "channels/post-updates.ts",
      `import { renamed } from ${JSON.stringify(renamedModule)};\nimport updates from "./post/updates";\n\nexport default renamed(updates);\n`,
    );
    const events = write(
      "events/post-changed.ts",
      `import { renamed } from ${JSON.stringify(renamedModule)};\n\nexport const postChanged = renamed({});\n`,
    );

    await expect(
      loadModule(
        "refused-channels.ts",
        buildDiscoveredModuleCode(
          "channels",
          [
            { file: moved, name: "post.updates" },
            { file: alias, name: "post-updates" },
          ],
          "channel",
        ),
      ),
    ).rejects.toThrow('nuxvel: the channel "post-updates" is a renamed() alias, but a channel stores nothing under its name');
    await expect(
      loadModule("refused-events.ts", buildEventsModuleCode([{ file: events, name: "post-changed" }])),
    ).rejects.toThrow(`nuxvel: ${events} exports renamed(), but an event stores nothing under its name`);
  });

  it("gives a $jobs key to each camelCase name segment, re-exporting the definition from its file", () => {
    const suffixed = write("jobs/post/notify-subscribers.job.ts", "export const postNotifySubscribersJob = 1;\n");
    const plain = write("jobs/sync.ts", "export default 1;\n");
    const root = "#nuxvel/jobs-namespace";

    expect(
      buildNamespaceModules(root, "jobs", [
        { file: suffixed, name: "post.notify-subscribers" },
        { file: plain, name: "sync" },
      ]),
    ).toEqual({
      [root]: `export * as post from "${root}.post";\nexport { default as sync } from ${JSON.stringify(plain)};\nexport {};\n`,
      [`${root}.post`]: `export { postNotifySubscribersJob as notifySubscribers } from ${JSON.stringify(suffixed)};\nexport {};\n`,
    });
    expect(() =>
      buildNamespaceModules(root, "jobs", [
        { file: plain, name: "post" },
        { file: suffixed, name: "post.notify-subscribers" },
      ]),
    ).toThrow(`nuxvel: ${plain} and the folder of ${suffixed} both give the key post; rename one of them`);
  });

  it("gives a namespace key to a definition under any export name, but none to a renamed() alias", () => {
    const event = write("events/post/published.ts", "export const input = z.object({});\nexport const published = defineEvent({ payload: input });\n");
    const alias = write("events/post-published.ts", "export default renamed(published);\n");
    const root = "#nuxvel/events-namespace";

    expect(
      buildNamespaceModules(root, "events", [
        { file: event, name: "post.published" },
        { file: alias, name: "post-published" },
      ]),
    ).toEqual({
      [root]: `export * as post from "${root}.post";\nexport {};\n`,
      [`${root}.post`]: `export { published as published } from ${JSON.stringify(event)};\nexport {};\n`,
    });
  });

  it("splits flags/ into $flags and $experiments by the define call", () => {
    const rollout = write("flags/rollout.flag.ts", "export const rolloutFlag = defineFlag({ default: false });\n");
    const cta = write("flags/cta.ts", "export default defineExperiment({ variants: { a: 50, b: 50 } });\n");
    const definitions = [
      { file: rollout, name: "rollout" },
      { file: cta, name: "cta" },
    ];

    expect(buildNamespaceModules("#nuxvel/flags-namespace", "flags", definitions, "defineFlag")).toEqual({
      "#nuxvel/flags-namespace": `export { rolloutFlag as rollout } from ${JSON.stringify(rollout)};\nexport {};\n`,
    });
    expect(buildNamespaceModules("#nuxvel/experiments-namespace", "flags", definitions, "defineExperiment")).toEqual({
      "#nuxvel/experiments-namespace": `export { default as cta } from ${JSON.stringify(cta)};\nexport {};\n`,
    });
  });

  it("keys $policies by the policy file's path, re-exporting its Policy export", () => {
    const policy = write("policies/health-check.policy.ts", "export const healthCheckPolicy = definePolicy(healthChecksTable, {});\n");
    const root = "#nuxvel/policies-namespace";

    const definitions = nameFiles("policy", [{ dir: join(appDir, "policies"), files: [policy] }]);

    expect(definitions).toEqual([{ file: policy, name: "health-check" }]);
    expect(buildNamespaceModules(root, "policies", definitions)).toEqual({
      [root]: `export { healthCheckPolicy as healthCheck } from ${JSON.stringify(policy)};\nexport {};\n`,
    });
  });

  it("refuses an events file exporting two events", async () => {
    const events = write(
      "events/post/changed.ts",
      `import { z } from "zod";\nimport { defineEvent } from ${JSON.stringify(defineEvent)};\n\nexport const postEdited = defineEvent({ payload: z.object({}) });\nexport const postRenamed = defineEvent({ payload: z.object({}) });\n`,
    );

    await expect(
      loadModule("events-registry.ts", buildEventsModuleCode([{ file: events, name: "post.changed" }])),
    ).rejects.toThrow(`nuxvel: ${events} exports 2 events; an event is named after its file, so give each its own`);
  });
});

describe("a playground definition file with the kind suffix", async () => {
  await setupPlayground();

  it("runs under its name without the suffix", async () => {
    const name = `suffixed-${randomUUID()}`;

    await runJob("_probe.record-suffixed", { name });

    await expectRow(healthChecksTable, { name });
  });

  it("is the name of the $jobs entry at its path", async () => {
    expect(await guest().$fetch("/api/_jobs-namespace-check")).toEqual({
      record: "_probe.record",
      namedExport: "_probe.named-export",
      nested: "post.notify-followers",
    });
  });

  it("runs from a named export with the kind suffix", async () => {
    const name = `named-export-${randomUUID()}`;

    await runJob("_probe.named-export", { name });

    await expectRow(healthChecksTable, { name });
  });
});
