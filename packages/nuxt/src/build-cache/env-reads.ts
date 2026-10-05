// std-env reads PATH while it loads to detect an AI agent, and loadNuxt would first import it inside recordEnvReads
import "std-env";

/**
 * Runs `run` and returns the names of the environment variables it reads one by one from `process.env`.
 *
 * A read of every variable in the order `Object.keys(process.env)` lists them is a copy of the
 * environment (a spread, a dotenv merge or the `env` of a child process), and does not count.
 * Variables read when a module loads before `run` starts are not seen.
 *
 * @example
 * const names = await recordEnvReads(() => buildNuxt(nuxt));
 *
 * @internal Shared by the test build and `@nuxvel/cli`. {@link cachedBuild} hashes the values of these names.
 */
export async function recordEnvReads(run: () => Promise<unknown>): Promise<string[]> {
  const env = process.env;
  const read = new Set<string>();
  let listed: string[] = [];
  let copied: string[] = [];

  const settle = () => {
    for (const name of copied) read.add(name);
    copied = [];
  };

  process.env = new Proxy(env, {
    get(target, name) {
      if (typeof name !== "string") return Reflect.get(target, name);

      if (copied.length === 0) listed = Object.keys(target);
      if (listed[copied.length] !== name) {
        settle();
        listed = Object.keys(target);
      }
      if (listed[copied.length] !== name) {
        read.add(name);
      } else if (copied.push(name) === listed.length) {
        copied = [];
      }
      return Reflect.get(target, name);
    },
    has(target, name) {
      if (typeof name === "string") {
        settle();
        read.add(name);
      }
      return Reflect.has(target, name);
    },
    // without a receiver: through the proxy, Reflect.set redefines an existing variable with a partial descriptor, which process.env rejects
    set(target, name, value) {
      return Reflect.set(target, name, value);
    },
  });

  try {
    await run();
  } finally {
    process.env = env;
    settle();
  }

  return [...read].sort();
}
