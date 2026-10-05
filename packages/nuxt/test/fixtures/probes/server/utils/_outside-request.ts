import { AsyncResource } from "node:async_hooks";

let bootScope: AsyncResource | undefined;

export function captureBootScope() {
  bootScope = new AsyncResource("playground-boot");
}

export function runOutsideRequest<Result>(fn: () => Result) {
  if (!bootScope) throw new Error("the _outside-request plugin has not run");

  return bootScope.runInAsyncScope(fn);
}
