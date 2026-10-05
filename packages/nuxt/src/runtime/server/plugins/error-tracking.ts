import { H3Error, type H3Event } from "h3";
import { defineNitroPlugin, useRuntimeConfig } from "nitropack/runtime";
import { getContext } from "unctx";
import { initErrorTracking, reportError } from "../error-tracking/sentry";
import { isUnexpectedRouteError, routeTaxonomyError } from "../errors/route-error";
import { isTaxonomyError } from "../errors/taxonomy";
import { useLogger } from "../logging/logger";
import { isMaintenanceError } from "../maintenance/maintenance-error";
import { loggedPath } from "../observe/logged-path";

function reportRouteError(error: Error, event: H3Event) {
  const message = `${event.method} ${loggedPath(event.path)} failed`;
  const fields = { requestId: event.context.nuxvelRequestId, actor: event.context.nuxvelActor };

  if (error instanceof H3Error && !isUnexpectedRouteError(error)) {
    const taxonomy = routeTaxonomyError(error);

    if (isTaxonomyError(taxonomy, "SERVICE_UNAVAILABLE") && !isMaintenanceError(taxonomy)) {
      useLogger("request").warn(message, taxonomy.cause ?? taxonomy, fields);
    }

    if (import.meta.dev && taxonomy && taxonomy.statusCode < 500) {
      useLogger("request").warn(`${message} with ${taxonomy.code}: ${taxonomy.message}`, {
        code: taxonomy.code,
        ...(isTaxonomyError(taxonomy, "BAD_REQUEST") ? { fields: taxonomy.fields } : {}),
        ...fields,
      });
    }

    return;
  }

  useLogger("request").error(message, error, fields);
  reportError(error, { requestId: event.context.nuxvelRequestId });
}

export default defineNitroPlugin((nitro) => {
  initErrorTracking(useRuntimeConfig().public.sentryDsn);

  nitro.hooks.hook("error", (error, { event, tags }) => {
    if (!event) {
      if (Array.isArray(tags) && tags.includes("cache")) useLogger("cache").error("a cached function failed", error);

      return reportError(error, {});
    }

    // nitro calls this hook from h3's error path, outside its request context, where useEvent() throws
    getContext<{ event: H3Event }>("nitro-app").call({ event }, () => reportRouteError(error, event));
  });
});
