import { AsyncLocalStorage } from "node:async_hooks";
import type { Actor } from "./system-actor";

export const actorContext = new AsyncLocalStorage<Actor>();
