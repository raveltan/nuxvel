import { z } from "zod";

const hostname = z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "must be a hostname like example.com");

const redirectPattern = /^(?=.)([a-z0-9-]+(\.[a-z0-9-]+)+)?(\/\S*)?$/;
const redirectMessage = "must be a domain, a path like /old, or both like example.com/old";

const redirectsSchema = z.record(z.string(), z.string().regex(redirectPattern, redirectMessage)).check((ctx) => {
  for (const from of Object.keys(ctx.value)) {
    if (!redirectPattern.test(from)) ctx.issues.push({ code: "custom", message: redirectMessage, path: [from], input: from });
  }
});

const notSetMessage = "is not set, add it to .env.deploy";
const notSet = { error: (issue: { input?: unknown }) => (issue.input === undefined ? notSetMessage : undefined) };

const secret = z.string().optional().pipe(z.string({ error: notSetMessage }).min(1, "is empty"));

const unquotable = /['\n]/;
const offsiteEnvMessage = "contains a single quote or a line break, and /etc/nuxvel/offsite.env cannot hold it";
const offsiteValue = <T extends z.ZodType<string | undefined>>(schema: T) =>
  schema.refine((value) => value === undefined || !unquotable.test(value), offsiteEnvMessage);

function unsetPaths(value: unknown, path: string[] = []): string[][] {
  if (value === undefined) return [path];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => unsetPaths(child, [...path, key]));
}

const sinkSchema = z.looseObject({ type: z.string().min(1) }).check((ctx) => {
  for (const path of unsetPaths(ctx.value)) ctx.issues.push({ code: "custom", message: notSetMessage, path, input: undefined });
});

const serverSchema = z.strictObject({
  host: z.string().min(1),
  user: z
    .string()
    .regex(/^[a-z_][a-z0-9_-]*$/, "must be a Linux user name like deploy")
    .refine((user) => user !== "root", "must not be root, it is the user that deploys the app"),
  roles: z.array(z.enum(["web", "worker", "database", "redis", "storage"])).min(1),
});

const processCount = z.union([z.literal("auto"), z.number().int().min(0)]);

const environmentSchema = z.strictObject({
  servers: z.array(serverSchema).length(1, "must list exactly one server"),
  arch: z.enum(["amd64", "arm64"]),
  domains: z.array(hostname).min(1),
  redirects: redirectsSchema.default({}),
  filesDomain: hostname.optional(),
  processes: z.strictObject({ web: processCount.default("auto"), worker: processCount.default("auto") }).prefault({}),
  deploy: z
    .strictObject({
      strategy: z.enum(["blue-green", "rolling"]).default("blue-green"),
      hold: z.number().int().min(0).default(600),
      smoke: z.array(z.string().startsWith("/")).default(["/"]),
    })
    .prefault({}),
  alerts: z
    .strictObject({
      email: z.email(notSet).exactOptional(),
      smtp: z
        .string(notSet)
        .regex(/^smtps?:\/\/\S+$/, "must be an SMTP URL like smtp://user:password@smtp.example.com:587")
        .exactOptional(),
      webhook: z.url(notSet).exactOptional(),
      heartbeat: z.url(notSet).exactOptional(),
    })
    .refine((alerts) => !alerts.email || alerts.smtp, { message: "sends email through an SMTP relay: set smtp", path: ["smtp"] })
    .optional(),
  logs: z.strictObject({ sink: sinkSchema }).optional(),
  keepReleases: z.number().int().min(1).default(5),
  backups: z
    .strictObject({
      offsite: z
        .strictObject({
          endpoint: offsiteValue(z.url(notSet)),
          bucket: offsiteValue(z.string(notSet).min(1)),
          region: offsiteValue(z.string().optional()),
          accessKeyId: offsiteValue(secret),
          secretAccessKey: offsiteValue(secret),
        })
        .optional(),
      restoreDrill: z.boolean().default(false),
    })
    .optional(),
});

/**
 * The Zod schema that `nuxvel.deploy.ts` is checked against. See {@link defineDeploy}.
 */
export const deployConfigSchema = z.strictObject({
  app: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, "must be lowercase letters, digits and dashes, starting with a letter")
    .refine(
      (app) => !["default", "nuxvel", "postgres", "template0", "template1"].includes(app),
      "must not be default, nuxvel, postgres, template0 or template1, the server uses these names for its own users and databases",
    )
    .refine(
      (app) => !app.endsWith("-rehearsal"),
      "must not end with -rehearsal, server:restore --from=<env>:<time> uses that name for its temporary app and the nightly backup skips it",
    ),
  environments: z
    .record(z.string().regex(/^[a-z][a-z0-9-]*$/, "must be lowercase letters, digits and dashes"), environmentSchema)
    .refine((environments) => Object.keys(environments).length > 0, "must list at least one environment")
    .check((ctx) => {
      const owners = new Map<string, string>();
      const hosts = new Map<string, string>();
      for (const [name, environment] of Object.entries(ctx.value)) {
        for (const [index, { host }] of environment.servers.entries()) {
          const hostOwner = hosts.get(host);
          if (hostOwner) {
            ctx.issues.push({
              code: "custom",
              message: `is also the host of ${hostOwner}, give each environment its own server`,
              path: [name, "servers", index, "host"],
              input: host,
            });
          }
          hosts.set(host, hostOwner ?? name);
        }
        const offsite = environment.backups?.offsite;
        if (!offsite) continue;
        const bucket = `${offsite.endpoint} ${offsite.bucket}`;
        const owner = owners.get(bucket);
        if (owner) {
          ctx.issues.push({
            code: "custom",
            message: `is also the off-site bucket of ${owner}, give each environment its own bucket`,
            path: [name, "backups", "offsite", "bucket"],
            input: offsite.bucket,
          });
        }
        owners.set(bucket, owner ?? name);
      }
    }),
});

/**
 * The contents of `nuxvel.deploy.ts` as written: the app name and its
 * environments. Settings left out get their defaults, see {@link ResolvedDeployConfig}.
 */
export type DeployConfig = z.input<typeof deployConfigSchema>;

/**
 * {@link DeployConfig} after validation, with every default filled in.
 */
export type ResolvedDeployConfig = z.output<typeof deployConfigSchema>;

/**
 * One environment of {@link ResolvedDeployConfig}, such as `production` or `staging`.
 */
export type DeployEnvironment = z.output<typeof environmentSchema>;

/**
 * Declares where and how the app is deployed, as the default export of
 * `nuxvel.deploy.ts` at the app root. Imported from `@nuxvel/cli/deploy`.
 *
 * Every CLI command that reads this file loads a git-ignored `.env.deploy`
 * first. Then it reads the file and stops with a clear error when the file
 * is malformed. Read credentials from `process.env`, never write them in
 * the file. An environment lists exactly one server.
 *
 * @param config.app - The app name, used for its folder, database and process names on the server.
 *   It must not be `default`, `nuxvel`, `postgres`, `template0` or `template1`, and must not end with `-rehearsal`.
 * @param config.environments - Each environment by name, with its `servers` (`host`, which no other environment uses; `user`, the
 *   non-root user that `server:setup` creates and deploys run as; `roles`),
 *   `arch` and `domains`, and these optional settings:
 *   `redirects` (from → to, each a domain, a path or both, default none),
 *   `filesDomain`, `processes` (`web` and `worker` counts or `"auto"`, default `"auto"`),
 *   `deploy` (`strategy`, default `"blue-green"`; `hold` in seconds, default 600;
 *   `smoke` paths, default `["/"]`), `alerts` (`email` with the `smtp` URL of a relay, `webhook`,
 *   and `heartbeat`, a dead-man's-switch URL the monitor requests every minute), `logs.sink` (a Vector sink),
 *   `keepReleases` (default 5), `backups.offsite` (an S3-compatible `endpoint`, a `bucket` that no other environment uses,
 *   `region`, `accessKeyId` and `secretAccessKey`) and `backups.restoreDrill` (a weekly restore of
 *   the newest backup into a scratch database, default `false`).
 *   `alerts`, `logs.sink` and `backups.offsite` are settings of the server, for all its apps: the last `server:setup`
 *   that has one sets it, and a `server:setup` without it keeps the value on the server.
 *
 * @example
 * ```ts
 * import { defineDeploy } from "@nuxvel/cli/deploy";
 *
 * export default defineDeploy({
 *   app: "tasks",
 *   environments: {
 *     production: {
 *       servers: [{ host: "203.0.113.10", user: "deploy", roles: ["web", "worker", "database", "redis", "storage"] }],
 *       arch: "amd64",
 *       domains: ["tasks.example.com"],
 *       redirects: { "www.tasks.example.com": "tasks.example.com", "/blog": "blog.example.com" },
 *       processes: { worker: 2 },
 *       deploy: { hold: 300, smoke: ["/", "/sign-in"] },
 *       alerts: { webhook: process.env.NUXVEL_ALERTS_WEBHOOK },
 *     },
 *   },
 * });
 * ```
 */
export function defineDeploy(config: DeployConfig): DeployConfig {
  return config;
}
