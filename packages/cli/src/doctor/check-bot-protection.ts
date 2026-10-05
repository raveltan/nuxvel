import { appSettings } from "./app-settings.ts";
import { type DoctorCheck, passed, skipped, warning } from "./doctor-check.ts";

export const checkBotProtection: DoctorCheck = {
  name: "bot protection",
  async run({ cwd }) {
    const settings = await appSettings(cwd);

    if (settings.NODE_ENV !== "production") return [skipped("NODE_ENV is not production")];

    if (settings.NUXT_AUTH_TURNSTILE_SECRET_KEY) return [passed("Turnstile guards sign-up and password reset")];

    return [
      warning(
        "sign-up is open without a captcha",
        "Set NUXT_AUTH_TURNSTILE_SECRET_KEY to a Cloudflare Turnstile secret key, so bots cannot sign up in bulk",
      ),
    ];
  },
};
