import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { policyFiles } from "../generators/make-policy.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:policy",
    description: "Generate a definePolicy skeleton bound to a table.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the policy, matching its schema file, e.g. blog-post (written to server/policies/blog-post.policy.ts as blogPostPolicy).",
      required: true,
    },
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => policyFiles(args.name, paths, "policy.ts.txt", {}, args.domain), args);
  },
});
