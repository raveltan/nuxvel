import { type AppRoutes, appRoutesSchema } from "@nuxvel/nuxt/cli";
import { z } from "zod";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { deployScript } from "../server/deploy-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { report } from "../ui/output.ts";

const schemaOf = appRoutesSchema.shape.procedures.element.shape.input;

const routeListSchema = z.object({
  procedures: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["query", "mutation", "subscription"]),
      path: z.string(),
      source: z.string(),
      input: schemaOf.default(null),
      output: schemaOf.default(null),
    }),
  ),
});

export async function loadLiveProcedures(cwd: string, envName: string): Promise<AppRoutes["procedures"]> {
  const { app, server } = await loadEnvironment(cwd, envName);
  const lines: string[] = [];

  await runOverSsh(
    sshTarget(cwd, server),
    deployScript("live-routes", { APP: app, APP_DIR: `/srv/apps/${app}` }),
    (line) => lines.push(line),
    { failure: "Reading the routes of the live release failed" },
  );

  const [first = ""] = lines;
  if (first === "@no-live") {
    report(`${app} has no live release on ${server.host}, so no call can break`);
    return [];
  }
  if (first.startsWith("@missing ")) {
    fail(`The live release ${first.slice("@missing ".length)} of ${app} has no nuxvel-routes.json`, {
      hint: "Add RUN NUXT_DATABASE_URL=postgres://build@127.0.0.1/unused NUXT_AUTH_SECRET=build-time-route-list-only-not-a-secret npx nuxvel route:list --json > nuxvel-routes.json to the build stage of the Dockerfile and copy nuxvel-routes.json into the artifact stage, then deploy",
    });
  }

  return routeListSchema.parse(JSON.parse(lines.join("\n"))).procedures.map((procedure) => ({
    path: procedure.name,
    route: procedure.path,
    type: procedure.type,
    file: procedure.source,
    input: procedure.input,
    output: procedure.output,
  }));
}
