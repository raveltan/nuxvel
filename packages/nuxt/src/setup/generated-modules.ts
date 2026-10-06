import { existsSync } from "node:fs";
import { join } from "node:path";
import { useNuxt } from "@nuxt/kit";
import type { NamedFile } from "../named-files";
import { buildNitroRoutesModuleCode } from "../nitro-routes";
import { buildTaskNamesModuleCode } from "../task-names";
import { buildDiscoveredModuleCode } from "../discovered-module";
import { buildMailTemplatesModuleCode, discoverMailTemplates } from "../mail-templates";
import { buildActionsModuleCode } from "../actions";
import { buildEventsModuleCode } from "../events";
import { buildPoliciesModuleCode } from "../policies";
import { buildSchemaModuleCode } from "../schema";
import { buildTrpcRoutersModuleCode } from "../trpc-routers";
import { buildTranslationsModuleCode } from "../translations";
import { buildUserDataModuleCode } from "../user-data";
import { FLAGS_CHANNEL } from "../runtime/shared/flags/flag-values";
import { MAINTENANCE_CHANNEL } from "../runtime/shared/maintenance/maintenance-channel";
import { MAIL_JOB_NAME } from "../runtime/server/mail/jobs/mail-job-name";
import { PUSH_JOB_NAME } from "../runtime/server/push/jobs/push-job-name";
import { WEBHOOK_JOB_NAME } from "../runtime/server/webhooks/outbound/jobs/webhook-job-name";
import { NOTIFICATION_JOB_NAME } from "../runtime/server/notifications/jobs/notification-job-name";
import { BILLING_PROCESS_JOB_NAME } from "../runtime/server/billing/jobs/billing-job-name";
import type { SocialProviderId } from "../runtime/shared/auth/social-provider-id";
import type { Discovery } from "./discovery";
import { i18nOptions } from "./i18n-options";
import type { NitroScan } from "./nitro-scan";
import type { ResolvedOptions, RuntimeFile } from "./resolved-options";

export type GeneratedModule = () => string | Promise<string>;

function translationFiles() {
  const nuxt = useNuxt();
  const i18n = i18nOptions(nuxt);
  const translationDir = i18n.translationDir ?? "locales";
  const codes = [...new Set([...(i18n.locales ?? []).map((locale) => locale.code), "en"])];

  return Object.fromEntries(
    codes.map((code) => [
      code,
      nuxt.options._layers.map((layer) => join(layer.config.rootDir, translationDir, `${code}.json`)).filter((file) => existsSync(file)),
    ]),
  );
}

export function generatedModules(
  options: ResolvedOptions,
  { discover, discoverLayers, discoverNamed, layerDirectories }: Discovery,
  nitroScan: NitroScan,
  socialProviders: SocialProviderId[],
  runtimeFile: RuntimeFile,
): Record<string, GeneratedModule> {
  const flagsChannel = runtimeFile("./runtime/server/flags/channel/flags-channel");
  const maintenanceChannel = runtimeFile("./runtime/server/maintenance/channel/maintenance-channel");
  const builtInSchedules: NamedFile[] = [
    { file: runtimeFile("./runtime/server/jobs/schedules/prune-outbox"), name: "nuxvel.prune-outbox" },
    { file: runtimeFile("./runtime/server/auth/schedules/reencrypt-two-factor"), name: "nuxvel.auth.reencrypt-two-factor" },
  ];
  if (options.billing) {
    builtInSchedules.push({ file: runtimeFile("./runtime/server/billing/schedules/reconcile"), name: "nuxvel.billing.reconcile" });
  }
  if (options.database?.purgeTrashedAfter) {
    builtInSchedules.push({ file: runtimeFile("./runtime/server/database/schedules/purge-trashed"), name: "nuxvel.purge-trashed" });
  }
  const deliverMailJob = runtimeFile("./runtime/server/mail/jobs/deliver-mail");
  const deliverNotificationJob = runtimeFile("./runtime/server/notifications/jobs/deliver-notification");
  const builtInJobs: NamedFile[] = [
    { file: deliverMailJob, name: MAIL_JOB_NAME },
    { file: deliverNotificationJob, name: NOTIFICATION_JOB_NAME },
    { file: runtimeFile("./runtime/server/webhooks/outbound/jobs/deliver-webhook"), name: WEBHOOK_JOB_NAME },
    ...(options.pwa ? [{ file: runtimeFile("./runtime/server/push/jobs/deliver-push"), name: PUSH_JOB_NAME }] : []),
    ...(options.billing ? [{ file: runtimeFile("./runtime/server/billing/jobs/process-billing-event"), name: BILLING_PROCESS_JOB_NAME }] : []),
  ];
  const builtInEvents: NamedFile[] = options.billing
    ? [
        { file: runtimeFile("./runtime/server/billing/events/subscription-changed"), name: "nuxvel.billing.subscription-changed" },
        { file: runtimeFile("./runtime/server/billing/events/paid"), name: "nuxvel.billing.paid" },
        { file: runtimeFile("./runtime/server/billing/events/refunded"), name: "nuxvel.billing.refunded" },
        { file: runtimeFile("./runtime/server/billing/events/disputed"), name: "nuxvel.billing.disputed" },
      ]
    : [];
  const builtInWebhooks: NamedFile[] = options.billing
    ? [{ file: runtimeFile("./runtime/server/billing/webhooks/stripe-webhook"), name: "stripe" }]
    : [];

  const builtInMails: NamedFile[] = [
    { file: runtimeFile("./runtime/server/auth/mail/verify-email"), name: "nuxvel.auth.verify-email" },
    { file: runtimeFile("./runtime/server/auth/mail/reset-password"), name: "nuxvel.auth.reset-password" },
    { file: runtimeFile("./runtime/server/auth/mail/security-notice"), name: "nuxvel.auth.security-notice" },
    { file: runtimeFile("./runtime/server/auth/mail/existing-account"), name: "nuxvel.auth.existing-account" },
  ];

  return {
    "#nuxvel/schema": async () => buildSchemaModuleCode(await discover("database/schema")),
    "#nuxvel/factories": async () => buildSchemaModuleCode(await discover("factories")),
    "#nuxvel/jobs": async () => buildDiscoveredModuleCode("jobs", await discoverNamed("job", "jobs", builtInJobs)),
    "#nuxvel/backfills": async () => buildDiscoveredModuleCode("database/backfills", await discoverNamed("backfill", "database/backfills")),
    "#nuxvel/seeders": async () => buildDiscoveredModuleCode("seeders", await discoverNamed("seeder", "seeders"), "seeder"),
    "#nuxvel/flags": async () => buildDiscoveredModuleCode("flags", await discoverNamed("flag or experiment", "flags")),
    "#nuxvel/mails": async () => buildDiscoveredModuleCode("mail", await discoverNamed("mail", "mail", builtInMails), "mail"),
    "#nuxvel/mail-templates": async () =>
      buildMailTemplatesModuleCode(await discoverMailTemplates(layerDirectories.map((dirs) => dirs.server))),
    "#nuxvel/notifications": async () =>
      buildDiscoveredModuleCode("notifications", await discoverNamed("notification", "notifications"), "notification"),
    "#nuxvel/uploads": async () => buildDiscoveredModuleCode("uploads", await discoverNamed("upload", "uploads"), "upload"),
    "#nuxvel/products": async () => buildDiscoveredModuleCode("products", await discoverNamed("product", "products")),
    "#nuxvel/user-data": async () => buildUserDataModuleCode(await discover("privacy")),
    "#nuxvel/webhooks": async () => buildDiscoveredModuleCode("webhooks", await discoverNamed("webhook", "webhooks", builtInWebhooks)),
    "#nuxvel/channels": async () =>
      buildDiscoveredModuleCode(
        "channels",
        await discoverNamed("channel", "channels", [
          { file: flagsChannel, name: FLAGS_CHANNEL },
          { file: maintenanceChannel, name: MAINTENANCE_CHANNEL },
        ]),
        "channel",
      ),
    "#nuxvel/events": async () => buildEventsModuleCode(await discoverNamed("event", "events", builtInEvents)),
    "#nuxvel/actions": async () => buildActionsModuleCode(await discoverNamed("action", "actions")),
    "#nuxvel/listeners": async () => buildDiscoveredModuleCode("listeners", await discoverNamed("listener", "listeners")),
    "#nuxvel/schedules": async () => buildDiscoveredModuleCode("schedules", await discoverNamed("schedule", "schedules", builtInSchedules)),
    "#nuxvel/rate-limits": async () =>
      buildDiscoveredModuleCode("rate-limits", await discoverNamed("rate limit", "rate-limits"), "rate limit"),
    "#nuxvel/error-classifiers": async () =>
      buildDiscoveredModuleCode("errors", await discoverNamed("error classifier", "errors"), "error classifier"),
    "#nuxvel/policies": async () => buildPoliciesModuleCode(await discover("policies")),
    "#nuxvel/social-providers": () => `export default ${JSON.stringify(socialProviders)} as const;\n`,
    "#nuxvel/nitro-routes": async () => buildNitroRoutesModuleCode(await nitroScan.handlers()),
    "#nuxvel/task-names": () => buildTaskNamesModuleCode(nitroScan.taskNames()),
    "#nuxvel/translations": () => buildTranslationsModuleCode(translationFiles()),
    "#nuxvel/trpc-routers": async () =>
      buildTrpcRoutersModuleCode(await discoverLayers("trpc/routers"), await discoverNamed("action", "actions")),
  };
}
