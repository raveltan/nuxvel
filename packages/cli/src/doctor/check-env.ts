import { z } from "zod";
import { appConfig, appSettings } from "./app-settings.ts";
import { type DoctorCheck, failed, passed } from "./doctor-check.ts";

const socialConfigSchema = z.object({
  nuxvel: z.object({ auth: z.object({ social: z.record(z.string(), z.boolean()) }) }),
  runtimeConfig: z.object({ auth: z.record(z.string(), z.unknown()).optional() }),
});

const credentialsSchema = z
  .object({ clientId: z.string().optional(), clientSecret: z.string().optional() })
  .catch({});

async function missingSocialCredentials(cwd: string) {
  const config = socialConfigSchema.safeParse(await appConfig(cwd).catch(() => ({}))).data;
  if (!config) return [];

  const enabled = Object.entries(config.nuxvel.auth.social).flatMap(([id, on]) => (on ? [id] : []));

  return enabled.flatMap((id) => {
    const prefix = `NUXT_AUTH_${id.toUpperCase()}`;
    const fromConfig = credentialsSchema.parse(config.runtimeConfig.auth?.[id]);

    return [
      ...(process.env[`${prefix}_CLIENT_ID`] || fromConfig.clientId ? [] : [`${prefix}_CLIENT_ID`]),
      ...(process.env[`${prefix}_CLIENT_SECRET`] || fromConfig.clientSecret ? [] : [`${prefix}_CLIENT_SECRET`]),
    ];
  });
}

const billingConfigSchema = z.object({ nuxvel: z.object({ billing: z.literal(true) }) });

async function billingOn(cwd: string) {
  return billingConfigSchema.safeParse(await appConfig(cwd).catch(() => ({}))).success;
}

export const checkEnv: DoctorCheck = {
  name: "environment",
  async run({ cwd }) {
    const { checkBillingEnvironment, checkEnvironment, envHint } = await import("@nuxvel/nuxt/env");
    const settings = await appSettings(cwd);
    const problems = [
      ...checkEnvironment(settings),
      ...(await missingSocialCredentials(cwd)).map((variable) => ({
        message: `${variable} is not set`,
        hint: envHint(variable),
      })),
      ...((await billingOn(cwd)) ? checkBillingEnvironment(settings, { production: settings.NODE_ENV === "production", testKeysOnly: false }) : []),
    ];

    if (problems.length === 0) return [passed("passes the server's boot checks")];

    return problems.map(({ message, hint }) => failed(message, hint));
  },
};
