import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { e2eTestFiles, TEST_KINDS, testFiles, testKindFromPath } from "../generators/make-test.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";
import { askChoice } from "../ui/ask-missing-args.ts";
import { fail } from "../ui/fail.ts";

function kindArg(kind: string) {
  return { type: "boolean", description: `Scaffold the test for a ${kind}, whatever the path.`, default: false } as const;
}

async function askTestKind(name: string) {
  if (testKindFromPath(name)) return undefined;

  const answer = await askChoice(`Kind of server/${name}.ts to test`, [...TEST_KINDS, "other"]);

  return TEST_KINDS.find((kind) => kind === answer);
}

export default defineCommand({
  meta: {
    name: "make:test",
    description:
      "Generate a functional test scaffold next to an existing server file, for an action, router, job or listener by its folder, or an end-to-end test for a page with --e2e.",
  },
  args: {
    name: {
      type: "positional",
      description:
        "Path of the target file relative to server/, without extension, e.g. actions/posts/create-post. With --e2e, the page path, e.g. posts/new.",
      required: true,
    },
    action: kindArg("action"),
    router: kindArg("router"),
    job: kindArg("job"),
    listener: kindArg("listener"),
    e2e: {
      type: "boolean",
      description: "Write a test that opens the page at /<name> with visit() to tests/e2e/ instead.",
      default: false,
    },
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    const kinds = [...TEST_KINDS, "e2e" as const].filter((kind) => args[kind]);

    if (kinds.length > 1) {
      fail(`Pass one of ${kinds.map((flag) => `--${flag}`).join(", ")}`, { exitCode: 2 });
    }

    const kind = kinds[0] ?? (await askTestKind(args.name));

    await generate(
      process.cwd(),
      (paths) => (kind === "e2e" ? e2eTestFiles(args.name, paths) : testFiles(args.name, paths, kind)),
      { ...args, prepare: false },
    );
  },
});
