import { createError } from "h3";
import { type Hookable, createHooks } from "hookable";
import { applyEnv } from "nitropack/runtime/internal/utils.env";
import type { CaptureError, NitroAppPlugin, NitroRuntimeConfig, Task, TaskEvent } from "nitropack/types";

/** The part of Nitro's app that the runner provides: its hooks and `captureError`. */
export interface RunnerNitroApp {
  hooks: Hookable;
  captureError: CaptureError;
}

/** What `useStorage()` returns in the runner: a store in memory, shared by every base. */
export interface MemoryStorage {
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: unknown): Promise<void>;
  hasItem(key: string): Promise<boolean>;
  removeItem(key: string): Promise<void>;
  getKeys(): Promise<string[]>;
  clear(): Promise<void>;
}

const memory = new Map<string, unknown>();
const running = new Map<string, Promise<unknown>>();
let runtimeConfig: NitroRuntimeConfig | undefined;
let taskFiles: Record<string, string> = {};
let app: RunnerNitroApp | undefined;

function deepFreeze<Value extends object>(value: Value): Value {
  for (const child of Object.values(value)) if (typeof child === "object" && child !== null) deepFreeze(child);
  return Object.freeze(value);
}

function started() {
  if (!runtimeConfig || !app) throw new Error("nuxvel: the runner has not started the app yet");
  return { runtimeConfig, app };
}

/**
 * Starts the shim: the resolved runtime config with the `NUXT_*` and
 * `NITRO_*` variables applied the way Nitro applies them, the task handler
 * files by task name, and an app that has hooks. The runner calls it once,
 * before any plugin runs.
 */
export function startShim(config: NitroRuntimeConfig, tasks: Record<string, string>): RunnerNitroApp {
  const hooks = createHooks();
  const envOptions = { prefix: "NITRO_", altPrefix: config.nitro?.envPrefix ?? "_" };

  const resolved = structuredClone(config);

  applyEnv(resolved, envOptions);
  runtimeConfig = deepFreeze(resolved);
  taskFiles = tasks;
  app = {
    hooks,
    captureError: (error, context) => {
      hooks.callHookParallel("error", error, context).catch((hookError: unknown) => console.error("Error while capturing another error", hookError));
    },
  };

  return app;
}

export function useRuntimeConfig(): NitroRuntimeConfig {
  return started().runtimeConfig;
}

export function useNitroApp(): RunnerNitroApp {
  return started().app;
}

export function useStorage(base = ""): MemoryStorage {
  const prefix = base && `${base.replace(/:$/, "")}:`;
  const keys = () => [...memory.keys()].filter((key) => key.startsWith(prefix));

  return {
    getItem: async (key) => memory.get(prefix + key) ?? null,
    setItem: async (key, value) => void memory.set(prefix + key, value),
    hasItem: async (key) => memory.has(prefix + key),
    removeItem: async (key) => void memory.delete(prefix + key),
    getKeys: async () => keys().map((key) => key.slice(prefix.length)),
    clear: async () => {
      for (const key of keys()) memory.delete(key);
    },
  };
}

export function useEvent(): never {
  throw createError({ message: "Nitro request context is not available: the runner serves no request." });
}

export function defineNitroPlugin(plugin: NitroAppPlugin): NitroAppPlugin {
  return plugin;
}

export function defineTask<Result>(task: Task<Result>): Task<Result> {
  return task;
}

async function runHandler(file: string, event: TaskEvent) {
  // a task is picked by its name at run time
  const { default: task }: { default: Task } = await import(/* @vite-ignore */ file);

  return task.run(event);
}

export async function runTask(name: string, { payload = {}, context = {} }: Partial<Pick<TaskEvent, "payload" | "context">> = {}) {
  const file = taskFiles[name];

  if (file === undefined) throw createError({ message: `Task \`${name}\` is not available!`, statusCode: 404 });

  const pending = running.get(name) ?? runHandler(file, { name, payload, context });
  running.set(name, pending);

  try {
    return await pending;
  } finally {
    running.delete(name);
  }
}
