import { z } from "zod";
import { named } from "../../../src/runtime/server/discovery/definition-name";
import { defineJob } from "../../../src/runtime/server/jobs/define-job";
import builtInJobs from "./built-in-jobs";

export default [
  named(
    defineJob({
      input: z.object({ name: z.string() }),
      handler: () => {},
    }),
    "_probe.record",
    "jobs/probe/record.ts",
  ),
  ...builtInJobs,
];
