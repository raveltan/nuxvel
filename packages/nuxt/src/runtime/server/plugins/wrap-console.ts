import { defineNitroPlugin } from "nitropack/runtime";
import { logFormat, useLogger } from "../logging/logger";

const NODE_PROCESS_WARNING = /^\(node:\d+\) /;

export default defineNitroPlugin(() => {
  if (logFormat !== "json" && !import.meta.dev) return;

  const logger = useLogger("console");

  function wrapConsole() {
    logger.wrapConsole();
    const error = console.error;

    console.error = (...args: unknown[]) => {
      const [message, ...rest] = args;

      if (typeof message === "string" && NODE_PROCESS_WARNING.test(message)) logger.warn(message, ...rest);
      else error(...args);
    };
  }

  wrapConsole();
  // Nuxt's dev-server-logs plugin runs after this one and wraps console into the global consola again
  queueMicrotask(wrapConsole);
});
