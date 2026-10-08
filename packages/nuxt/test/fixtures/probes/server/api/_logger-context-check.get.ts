import { useLogger } from "@nuxvel/nuxt/server/observability";

export default defineEventHandler(() => {
  const log = useLogger("logger-check");

  log.info("logger-check in request");
  runOutsideRequest(() => log.info("logger-check outside request"));

  return { logged: true };
});
