import type { Nuxt } from "@nuxt/schema";

export function dropWebworkerLib(nuxt: Nuxt) {
  nuxt.hook("prepare:types", ({ tsConfig }) => {
    const options = tsConfig.compilerOptions;
    if (options?.lib) options.lib = options.lib.filter((lib) => lib.toLowerCase() !== "webworker");
  });
}
