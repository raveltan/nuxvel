import { useLogger } from "@nuxvel/nuxt/server/observability";

export default defineEventHandler(() => {
  const logger = useLogger("pretty-log-check");
  const failure = new Error("pretty outer failure", {
    cause: new Error("pretty middle failure", { cause: new Error("pretty inner failure") }),
  });

  logger.info("user.send-digest #16 done", { name: "user.send-digest", jobId: 16, attempt: 1 });
  logger.error("pretty error with causes", failure);
  logger.warn("pretty warning with causes", failure);

  logger.error("pretty error with hint", failure, { hint: "pretty hint text" });
  logger.warn("pretty warning with hint", { hint: "pretty hint text" });

  return { logged: true };
});
