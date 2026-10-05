import { defineCommand } from "citty";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { forceArg } from "../generators/force-arg.ts";
import { generate } from "../generators/generate.ts";
import { ciFiles } from "../generators/make-ci.ts";

export default defineCommand({
  meta: {
    name: "make:ci",
    description:
      "Generate a GitHub Actions workflow at .github/workflows/deploy.yml that tests, checks and builds each push to main, then deploys it to an environment.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts to deploy to, e.g. production.",
      required: true,
    },
    ...forceArg,
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { environment } = await loadEnvironment(cwd, args.env);

    await generate(cwd, () => ciFiles(cwd, args.env, environment), { ...args, prepare: false });
  },
});
