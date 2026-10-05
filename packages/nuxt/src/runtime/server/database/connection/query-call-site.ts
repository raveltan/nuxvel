import { AsyncLocalStorage } from "node:async_hooks";
import { isObserved } from "../../observe/channels";

const callSites = new AsyncLocalStorage<Error>();

// drizzle runs a query from a thenable job, whose stack has lost the app's frames, so the stack is taken at useDb()
export function markQueryCallSite() {
  if (isObserved("db:query")) callSites.enterWith(new Error());
}

export function queryCallSite() {
  return callSites.getStore()?.stack;
}
