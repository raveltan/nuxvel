import { resolveTxt } from "node:dns/promises";
import { z } from "zod";
import { errorMessage } from "../error-message.ts";
import { appConfig } from "./app-settings.ts";
import { type DoctorCheck, type DoctorFinding, passed, skipped, warning } from "./doctor-check.ts";

const DKIM_SELECTORS = ["default", "google", "selector1", "selector2", "k1", "mx", "resend", "s1", "s2", "dkim"];

const RECORD_HINT = "Add the TXT record that your mail provider gives you";

const mailConfigSchema = z.object({
  nuxvel: z.object({ mail: z.object({ from: z.string() }) }),
});

async function mailFrom(cwd: string) {
  if (process.env.NUXT_NUXVEL_MAIL_FROM) return process.env.NUXT_NUXVEL_MAIL_FROM;

  return mailConfigSchema.safeParse(await appConfig(cwd)).data?.nuxvel.mail.from;
}

async function txtRecords(name: string) {
  try {
    return (await resolveTxt(name)).map((chunks) => chunks.join(""));
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ENOTFOUND" || error.code === "ENODATA")) return [];

    throw error;
  }
}

async function hasRecord(name: string, prefix: string) {
  return (await txtRecords(name)).some((record) => record.startsWith(prefix));
}

async function dkimSelector(domain: string) {
  const found = await Promise.all(
    DKIM_SELECTORS.map(async (selector) =>
      (await txtRecords(`${selector}._domainkey.${domain}`)).some((record) => record.includes("p=")),
    ),
  );

  return DKIM_SELECTORS[found.indexOf(true)];
}

export const checkMailDns: DoctorCheck = {
  name: "mail dns",
  async run({ cwd }) {
    const from = await mailFrom(cwd);
    const domain = from && /@([^\s>]+)/.exec(from)?.[1];

    if (!domain) return [skipped("nuxvel.mail.from is not set")];

    try {
      const [spf, dmarc, selector] = await Promise.all([
        hasRecord(domain, "v=spf1"),
        hasRecord(`_dmarc.${domain}`, "v=DMARC1"),
        dkimSelector(domain),
      ]);
      const missing: DoctorFinding[] = [
        ...(spf ? [] : [warning(`${domain} has no SPF record`, RECORD_HINT)]),
        ...(selector ? [] : [warning(`${domain} has no DKIM record under ${DKIM_SELECTORS.join(", ")}`, RECORD_HINT)]),
        ...(dmarc ? [] : [warning(`_dmarc.${domain} has no DMARC record`, RECORD_HINT)]),
      ];

      return missing.length > 0 ? missing : [passed(`${domain} has SPF, DKIM (selector ${selector}) and DMARC records`)];
    } catch (error) {
      return [skipped(`could not look up the DNS records of ${domain}: ${errorMessage(error)}`)];
    }
  },
};
