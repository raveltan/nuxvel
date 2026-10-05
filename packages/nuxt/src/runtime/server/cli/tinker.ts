import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AsyncCompleter, Completer } from "node:readline";
import { type REPLEval, type REPLServer, start } from "node:repl";
import { inspect } from "node:util";
import { configureFactories } from "@nuxvel/nuxt/factories";
import { getTableName, isTable } from "drizzle-orm";
import { useDb } from "../database/client";
import { allJobs } from "../jobs/registry";
import { observeRun } from "../observe/channels";
import { useCaller } from "../trpc/use-caller";
import { appProcedures } from "./routes";
import { actionModules } from "#nuxvel/actions";
import * as factories from "#nuxvel/factories";
import nitroRoutes from "#nuxvel/nitro-routes";
import * as schema from "#nuxvel/schema";

const MAX_LABEL = 80;
const HISTORY_FILE = join(".nuxvel", "tinker-history");
const CALLER_PATH = /\btrpc\.([\w.]*)$/;

function observedEval(evaluate: REPLEval): REPLEval {
  return function (code, context, file, callback) {
    const label = `tinker ${code.trim().slice(0, MAX_LABEL)}`;

    void observeRun({ id: `command:${randomUUID()}`, kind: "command", label }, () =>
      new Promise<void>((resolve) => {
        evaluate.call(this, code, context, file, (error, result) => {
          callback(error, result);
          resolve();
        });
      }),
    );
  };
}

function callerCompleter(paths: string[], fallback: Completer | AsyncCompleter): AsyncCompleter {
  return (line, callback) => {
    const typed = CALLER_PATH.exec(line)?.[1];
    if (typed === undefined) {
      const completed = fallback(line, callback);
      if (completed) callback(null, completed);
      return;
    }

    const parent = typed.slice(0, typed.lastIndexOf(".") + 1);
    const next = paths
      .filter((path) => path.startsWith(typed))
      .map((path) => `trpc.${parent}${path.slice(parent.length).split(".")[0]}`);

    callback(null, [[...new Set(next)].sort(), `trpc.${typed}`]);
  };
}

function columns(rows: string[][]) {
  const widths = rows[0]?.map((_, index) => Math.max(...rows.map((row) => row[index]?.length ?? 0))) ?? [];
  return rows.map((row) => row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ").trimEnd()).join("\n");
}

function listing(repl: REPLServer, help: string, lines: () => string) {
  return {
    help,
    action() {
      repl.clearBufferedCommand();
      console.log(lines());
      repl.displayPrompt();
    },
  };
}

function defineListings(repl: REPLServer) {
  const tables = Object.entries(schema).flatMap(([name, value]) => (isTable(value) ? [[name, getTableName(value)]] : []));

  repl.defineCommand("tables", listing(repl, "List the schema tables and their SQL names", () => columns(tables)));
  repl.defineCommand(
    "routes",
    listing(repl, "List the tRPC procedures and the Nitro routes", () =>
      columns([
        ...appProcedures().map(({ type, path }) => [type, `trpc.${path}`]),
        ...nitroRoutes.map(({ method, route }) => [method, route]),
      ]),
    ),
  );
  repl.defineCommand("jobs", listing(repl, "List the jobs", () => allJobs().map((job) => job.name).join("\n")));
}

export async function runTinker(): Promise<number> {
  // unimport rewrites static imports from #imports into the names they use, which leaves a namespace import empty
  const autoImports = await import("#imports");
  const colors = process.stdout.isTTY === true;
  configureFactories({ db: useDb });
  await mkdir(".nuxvel", { recursive: true });

  const repl = start({
    prompt: "nuxvel> ",
    useGlobal: true,
    ignoreUndefined: true,
    preview: false,
    useColors: colors,
    writer: (value) => inspect(value, { depth: 6, colors }),
    // node:repl holds piped input back while a top-level await runs only on its terminal path
    terminal: true,
  });

  Object.assign(repl.context, { schema, trpc: useCaller() }, schema, factories, autoImports, ...actionModules);
  // node:repl reads `eval` from the server on every line, though its type marks it readonly
  Object.defineProperty(repl, "eval", { value: observedEval(repl.eval) });
  // readline reads `completer` from the server on every Tab, and the caller's proxy lists no properties for the default one
  Object.defineProperty(repl, "completer", { value: callerCompleter(appProcedures().map(({ path }) => path), repl.completer) });
  defineListings(repl);
  // setupHistory pauses the input, so it runs in start()'s tick: on Node 24+ piped input can close the REPL first, and then it throws
  await new Promise<void>((resolve, reject) => repl.setupHistory(HISTORY_FILE, (error) => (error ? reject(error) : resolve())));

  return new Promise((resolve) => {
    repl.on("exit", () => {
      console.log();
      resolve(0);
    });
  });
}
