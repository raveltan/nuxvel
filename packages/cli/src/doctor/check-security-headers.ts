import { type UrlDoctorCheck, failed, passed } from "./doctor-check.ts";
import { errorMessage } from "../error-message.ts";

export const checkSecurityHeaders: UrlDoctorCheck = {
  name: "security headers",
  async run({ url }) {
    let response: Response;

    try {
      response = await fetch(url);
    } catch (error) {
      return [failed(`could not reach ${url}: ${errorMessage(error)}`, "Start the app, or pass the URL it listens on")];
    }

    return response.headers.get("content-security-policy")
      ? [passed("Content-Security-Policy is set")]
      : [failed(`${url} has no Content-Security-Policy header`, "Check the security.headers settings in nuxt.config.ts")];
  },
};
