import { isIP } from "node:net";
import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";
import { liveRelease, runInRelease } from "../deploy/run-in-release.ts";
import { askConfirm } from "../ui/ask-missing-args.ts";
import { fail } from "../ui/fail.ts";

const SECRET = /^[\w-]{8,}$/;

function allowedIps(rawArgs: string[]) {
  return rawArgs.flatMap((arg, index) => {
    if (arg.startsWith("--allow=")) return [arg.slice("--allow=".length)];
    if (arg === "--allow") return [rawArgs[index + 1] ?? ""];
    return [];
  });
}

async function confirmOnServer(release: Awaited<ReturnType<typeof liveRelease>>, envName: string) {
  await askConfirm(
    `Put ${release.app} in ${envName} (${release.host}) in maintenance mode? Its users get a 503 until nuxvel up ${envName}`,
    `down ${envName} takes ${release.app} offline and needs a confirmation`,
    "Cancelled: the app stays up",
  );
}

/**
 * `nuxvel down` puts the app in maintenance mode until `nuxvel up`, and pauses the queue unless `--keep-queue` is given.
 *
 * Without an environment, it runs inside the local app. With one, it runs over SSH in the live release on the server
 * of that environment, after a confirmation. The state is in the Redis of the app, so every web process and worker
 * of both colors goes down. `--force` skips the confirmation. Without a terminal, it needs `--force`. A bad
 * `--retry`, `--secret` or `--allow` exits `2` before it connects.
 *
 * @example
 * ```sh
 * nuxvel down production --message "Back at 10:00" --secret deploy-2026-10 --force
 * ```
 */
export default defineCommand({
  meta: {
    name: "down",
    description: "Put the app in maintenance mode until nuxvel up, and pause the queue, locally or, with an environment, on its server.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production. Without it, the command runs locally.",
      required: false,
    },
    force: {
      type: "boolean",
      description: "Run it on the server without asking.",
    },
    message: {
      type: "string",
      description: "What the maintenance page and the 503 responses say.",
    },
    retry: {
      type: "string",
      description: "Seconds for the Retry-After header. Defaults to 60.",
    },
    secret: {
      type: "string",
      description: "A token of at least 8 letters, digits, - or _. Visiting /<secret> lets that browser in.",
    },
    allow: {
      type: "string",
      description: "An IP address that keeps full access. Repeat it for more addresses.",
    },
    "keep-queue": {
      type: "boolean",
      description: "Keep running queued jobs and schedules while the app is down.",
    },
  },
  async run({ args, rawArgs }) {
    const retryAfter = args.retry === undefined ? undefined : Number(args.retry);
    const allow = allowedIps(rawArgs);

    if (retryAfter !== undefined && !(Number.isInteger(retryAfter) && retryAfter > 0)) {
      fail("--retry must be a whole number of seconds of at least 1", { hint: "e.g. --retry 60", exitCode: 2 });
    }

    if (args.secret !== undefined && !SECRET.test(args.secret)) {
      fail("--secret must be at least 8 letters, digits, - or _", { hint: "e.g. --secret deploy-2026-09", exitCode: 2 });
    }

    const invalid = allow.find((ip) => isIP(ip) === 0);

    if (invalid !== undefined) {
      fail(`--allow ${JSON.stringify(invalid)} is not an IP address`, { hint: "e.g. --allow 203.0.113.7", exitCode: 2 });
    }

    const command = {
      kind: "down" as const,
      message: args.message,
      retryAfter,
      secret: args.secret,
      allow,
      keepQueue: args["keep-queue"] === true,
    };

    if (!args.env) {
      process.exitCode = await runCommandInApp(process.cwd(), command);
      return;
    }

    const release = await liveRelease(process.cwd(), args.env);

    if (args.force !== true) await confirmOnServer(release, args.env);

    process.exitCode = (await runInRelease(release, command)).code;
  },
});
