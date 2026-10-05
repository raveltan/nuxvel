import { getSessionCookie } from "better-auth/cookies";
import { setResponseHeader } from "h3";
import { defineNitroPlugin } from "nitropack/runtime";

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("render:response", (_response, { event }) => {
    if (getSessionCookie(event.headers)) setResponseHeader(event, "cache-control", "private, no-store");
  });
});
