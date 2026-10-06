import type { Actor } from "./system-actor";

export const GUEST_ACTOR_TYPE = "guest";

export const guestActor: Actor = { type: GUEST_ACTOR_TYPE, id: "guest" };
