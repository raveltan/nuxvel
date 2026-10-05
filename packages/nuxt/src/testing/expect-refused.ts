import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { type CallerPath, callerPaths } from "./acting-as";
import { readControlChannel } from "./control-channel";
import { callApp } from "./settled";

function pathOf(caller: object): CallerPath {
  const found = callerPaths.get(caller);

  if (!found) throw new Error("expectRefused: pass a router or a procedure of actingAs().trpc or guest().trpc");

  return found;
}

async function outcome(caller: CallerPath, path: string, code: TRPC_ERROR_CODE_KEY) {
  try {
    await callApp("call", { userId: caller.userId, path, input: undefined }, await caller.headers());

    return `${path} answered`;
  } catch (error) {
    const received: unknown = error instanceof Error ? Reflect.get(error, "code") : undefined;

    if (received === code) return undefined;

    return typeof received === "string"
      ? `${path} refused with ${received}`
      : `${path} failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Asserts that every procedure of a router refuses the caller with the tRPC error `code`.
 *
 * Pass a router or a single procedure of {@link actingAs}`().trpc` or
 * {@link guest}`().trpc`. The helper reads the procedures from the app
 * router, so a procedure that you add later is checked too. It calls each
 * procedure with no input. A role check that runs before `.input()`
 * refuses first, so the procedure does not need valid input. The
 * failure message names each procedure that answered or refused with a
 * different code. Throws when no procedure is at the path.
 *
 * @example
 * ```ts
 * await expectRefused(actingAs(await userFactory()).trpc.tickets.ticket, "FORBIDDEN");
 * await expectRefused(guest().trpc.tickets, "UNAUTHORIZED");
 * ```
 */
export async function expectRefused(router: object, code: TRPC_ERROR_CODE_KEY): Promise<void> {
  const caller = pathOf(router);
  const { path } = caller;
  const prefix = path.join(".");
  const procedures = (await readControlChannel<string[]>("procedures")).filter(
    (name) => name === prefix || name.startsWith(`${prefix}.`),
  );

  if (procedures.length === 0) throw new Error(`expectRefused: no tRPC procedure at "${prefix}"`);

  const failures: string[] = [];

  for (const name of procedures) {
    const failure = await outcome(caller, name, code);

    if (failure) failures.push(failure);
  }

  if (failures.length > 0) {
    throw new Error(`expectRefused: not every procedure refused with ${code}:\n  ${failures.join("\n  ")}`);
  }
}
