import type { Nuxt } from "@nuxt/schema";
import type { RuntimeFile } from "./resolved-options";

const SIZE_LIMITER = "nuxt-security/dist/runtime/server/middleware/requestSizeLimiter";

export function setupRequestSize(nuxt: Nuxt, runtimeFile: RuntimeFile) {
  nuxt.hook("modules:done", () => {
    const handlers = nuxt.options.serverHandlers;
    const limiter = handlers.findIndex(({ handler }) => handler.includes(SIZE_LIMITER));

    if (limiter === -1) throw new Error("nuxvel: nuxt-security's requestSizeLimiter middleware is missing");

    // it reads the rules that nuxt-security's size limiter resolves, and must run before the XSS validator reads the body
    handlers.splice(limiter + 1, 0, { middleware: true, handler: runtimeFile("./runtime/server/security/request-size") });
  });
}
