import { fileURLToPath } from "node:url";

/**
 * The path of the Nitro plugin that runs a `NuxvelCommand` from
 * `COMMAND_ENV` once the server has booted, then exits with its code.
 *
 * The module never adds it: only the CLI's own server build does, through
 * `nitro.plugins`, so a `nuxt build` output runs no command from its
 * environment. Its `tinker.mjs` release entry takes a command as its first
 * argument instead, never from the environment, and opens the REPL without
 * one.
 *
 * @internal Shared with `@nuxvel/cli`; not meant for app code.
 */
export const COMMAND_PLUGIN = fileURLToPath(new URL("./runtime/server/plugins/command", import.meta.url));
