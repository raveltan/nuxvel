export default defineEventHandler(() => {
  const log = useLogger("logger-check");

  log.trace("logger-check trace");
  log.debug("logger-check debug");
  log.info("logger-check info", { answer: 42 });
  log.warn("logger-check warn");
  log.error("logger-check error", new Error("logger-check boom"));
  log.fatal("logger-check fatal");

  return { logged: true };
});
