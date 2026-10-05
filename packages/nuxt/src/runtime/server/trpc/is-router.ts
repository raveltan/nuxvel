/** Whether `value` can be a router a file under `server/trpc/routers/` exports. */
export function isRouter(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
