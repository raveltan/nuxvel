import { addServerHandler, addServerPlugin } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { TEST_CONTROL_PATH } from "../runtime/server/testing/control-path";
import type { RuntimeFile } from "./resolved-options";

const TEST_ROUTES = [
  ["recorded", "get"],
  ["reset", "post"],
  ["real-queue", "post"],
  ["call", "post"],
  ["procedures", "get"],
  ["run-job", "post"],
  ["sign-webhook", "post"],
  ["stored", "post"],
  ["work-queue", "post"],
  ["run-schedule", "post"],
  ["run-listener", "post"],
  ["render-mail", "post"],
  ["emit", "post"],
  ["notify", "post"],
  ["run-backfill", "post"],
  ["run-seeder", "post"],
  ["run-action", "post"],
  ["can", "post"],
  ["exhaust-rate-limit", "post"],
  ["cached", "post"],
  ["flag-targeting", "post"],
  ["signed-url", "post"],
  ["force-variant", "post"],
  ["experiment", "post"],
  ["maintenance", "post"],
  ["push-gone", "post"],
  ["clock", "post"],
  ["fake-fetch", "post"],
  ["fake-stripe", "post"],
  ["session", "post"],
  ["api-key", "post"],
  ["presence", "post"],
] as const;

const BILLING_TEST_ROUTES = [["stripe-scenario", "post"]] as const;

export function addTestRoutes(nuxt: Nuxt, runtimeFile: RuntimeFile, billing: boolean) {
  if (!nuxt.options.test) return;
  if (!nuxt.options.dev && !nuxt.options._prepare && !process.env.VITEST) {
    throw new Error(
      "nuxvel: Nuxt's test option is on in a production build that Vitest did not start. The option is on when NODE_ENV is test, when TEST is set, or when nuxt.config sets test: true. A test build turns off email verification and the breached-password check. It also records jobs, mail and outbound fetches instead of sending them. Remove the option, then build again.",
    );
  }

  addServerPlugin(runtimeFile("./runtime/server/testing/install-fakes"));

  for (const [name, method] of [...TEST_ROUTES, ...(billing ? BILLING_TEST_ROUTES : [])]) {
    addServerHandler({
      route: `${TEST_CONTROL_PATH}/${name}`,
      method,
      handler: runtimeFile(`./runtime/server/testing/routes/${name}`),
    });
  }

  if (billing) {
    for (const page of ["checkout", "portal"]) {
      addServerHandler({
        route: `${TEST_CONTROL_PATH}/stripe/${page}/:id`,
        handler: runtimeFile(`./runtime/server/testing/routes/stripe-${page}-page`),
      });
    }
  }

  if (nuxt.options.dev) {
    addServerHandler({
      route: `${TEST_CONTROL_PATH}/collected`,
      method: "get",
      handler: runtimeFile("./runtime/server/testing/routes/collected"),
    });
    addServerHandler({
      route: `${TEST_CONTROL_PATH}/section-loads`,
      method: "get",
      handler: runtimeFile("./runtime/server/testing/routes/section-loads"),
    });
  }
}
