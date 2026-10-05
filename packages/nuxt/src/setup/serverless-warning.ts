import { useLogger } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { serverlessPresetWarning } from "../serverless-preset";
import type { Discovery } from "./discovery";

export function warnServerlessPreset(nuxt: Nuxt, { discover }: Discovery) {
  nuxt.hook("nitro:init", async (nitro) => {
    const workerFolders = ["jobs", "listeners", "schedules", "mail"] as const;
    const defined = await Promise.all(workerFolders.map(async (folder) => (await discover(folder)).length > 0));
    const warning = serverlessPresetWarning(nitro.options.preset, {
      worker: workerFolders.filter((_, index) => defined[index]),
      channels: (await discover("channels")).length > 0,
    });

    if (warning) useLogger("nuxvel").warn(warning);
  });
}
