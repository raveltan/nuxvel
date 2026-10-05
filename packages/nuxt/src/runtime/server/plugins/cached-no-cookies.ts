import { removeResponseHeader } from "h3";
import { defineNitroPlugin } from "nitropack/runtime";

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("render:response", (_response, { event }) => {
    if (event.context.cache) removeResponseHeader(event, "set-cookie");
  });
});
