import { getResponseStatus, setResponseHeader } from "h3";
import { defineNitroPlugin } from "nitropack/runtime";

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("beforeResponse", (event) => {
    if (getResponseStatus(event) >= 400) setResponseHeader(event, "cache-control", "no-store");
  });
});
