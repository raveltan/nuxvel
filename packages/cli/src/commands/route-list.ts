import { relative } from "node:path";
import { defineCommand } from "citty";
import { breakingChanges } from "../routes/breaking-changes.ts";
import { findCollisions } from "../routes/find-collisions.ts";
import { loadAppRoutes, loadAppRoutesAt } from "../routes/load-app-routes.ts";
import { loadLiveProcedures } from "../routes/load-live-routes.ts";
import { type Route, sortRoutes } from "../routes/route.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { hint, plural, report, success, symbols } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

export default defineCommand({
  meta: {
    name: "route:list",
    description: "List the app's tRPC procedures and Nitro routes, flagging colliding paths, or report breaking API changes since a git ref.",
  },
  args: {
    ...jsonArg,
    diff: {
      type: "string",
      description: "Compare the tRPC procedures with the app at this git ref, and fail on a breaking change.",
    },
    "diff-env": {
      type: "string",
      description: "Compare the tRPC procedures with the live release of this environment in nuxvel.deploy.ts, read over SSH, and fail on a breaking change.",
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const app = await loadAppRoutes(cwd);

    if (!app) {
      process.exitCode = 1;
      return;
    }

    const diffEnv = args["diff-env"];

    if (args.diff || diffEnv) {
      const since = diffEnv ? `the live release of ${diffEnv}` : args.diff;
      const before = diffEnv ? await loadLiveProcedures(cwd, diffEnv) : (await loadAppRoutesAt(cwd, args.diff ?? ""))?.procedures;

      if (!before) {
        process.exitCode = 1;
        return;
      }

      const breaking = breakingChanges(before, app.procedures);

      if (breaking.length > 0) process.exitCode = 1;

      if (args.json) {
        printJson({ breaking });
        return;
      }

      if (breaking.length === 0) {
        success(`No breaking API changes since ${since}`);
        return;
      }

      report(`${symbols.error} ${plural(breaking.length, "breaking API change")} since ${since}`);
      for (const change of breaking) report(`  ${change}`);
      report(hint("Keep the old shape for one release, then remove it in the next"));
      return;
    }

    const procedures = app.procedures.map((procedure) => ({
      name: procedure.path,
      type: procedure.type,
      method: procedure.type === "mutation" ? "POST" : "GET",
      path: procedure.route,
      source: relative(cwd, procedure.file),
      input: procedure.input,
      output: procedure.output,
    }));
    const routes: Route[] = app.handlers.map((handler) => ({
      method: handler.method,
      path: handler.route,
      source: relative(cwd, handler.handler),
    }));
    const collisions = findCollisions([...procedures, ...routes]);

    if (collisions.length > 0) process.exitCode = 1;

    if (args.json) {
      printJson({ procedures: sortRoutes(procedures), routes: sortRoutes(routes), collisions });
      return;
    }

    printTable(
      ["METHOD", "PATH", "SOURCE"],
      sortRoutes([...procedures, ...routes]).map((route) => [route.method, route.path, route.source]),
    );

    const total = plural(procedures.length + routes.length, "route");

    if (collisions.length === 0) {
      success(`${total}, no colliding paths`);
      return;
    }

    report(`${symbols.error} ${total}, ${plural(collisions.length, "colliding path")}`);
    for (const { method, path, sources } of collisions) report(`  ${method} ${path}  ${sources.join(", ")}`);
    report(hint("Keep one file per method and path; parameter names don't make two paths different"));
  },
});
