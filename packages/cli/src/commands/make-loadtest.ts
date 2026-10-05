import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { loadtestFiles } from "../generators/make-loadtest.ts";
import { forceArg } from "../generators/force-arg.ts";
import { loadAppRoutes } from "../routes/load-app-routes.ts";

export default defineCommand({
  meta: {
    name: "make:loadtest",
    description: "Generate a k6 script at tests/load/procedures.js requesting every tRPC query procedure.",
  },
  args: forceArg,
  async run({ args }) {
    const cwd = process.cwd();
    const app = await loadAppRoutes(cwd);

    if (!app) {
      process.exitCode = 1;
      return;
    }

    await generate(cwd, (paths) => loadtestFiles(paths.rootDir, app), { ...args, prepare: false });
  },
});
