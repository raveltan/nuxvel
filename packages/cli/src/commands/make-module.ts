import { join } from "node:path";
import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { forceArg } from "../generators/force-arg.ts";
import { kebabName } from "../generators/names.ts";

export default defineCommand({
  meta: {
    name: "make:module",
    description: "Generate a module: a Nuxt layer at layers/<name>/nuxt.config.ts.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the module, e.g. billing (written to layers/billing/nuxt.config.ts).",
      required: true,
    },
    ...forceArg,
  },
  async run({ args }) {
    await generate(
      process.cwd(),
      (paths) => [
        {
          path: join(paths.rootDir, "layers", kebabName(args.name, "billing"), "nuxt.config.ts"),
          template: "module-nuxt-config.ts.txt",
          values: {},
        },
      ],
      args,
    );
  },
});
