import { buildNuxt, logger } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";

export async function buildAndClose(nuxt: Nuxt) {
  const level = logger.level;
  logger.level = 1;

  try {
    await buildNuxt(nuxt);
  } finally {
    // nuxt's builders leave console and stdout wrapped by consola, which swallows vitest's reporter
    logger.restoreAll();
    logger.level = level;
    await nuxt.close();
  }
}
