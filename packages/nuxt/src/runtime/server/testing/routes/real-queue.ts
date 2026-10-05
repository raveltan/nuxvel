import { defineEventHandler } from "h3";
import { removeEffectReplacement } from "../../effects/replacements";
import { refuseOutsideVitest } from "../refuse-outside-vitest";

export default defineEventHandler(() => {
  refuseOutsideVitest();

  removeEffectReplacement("enqueue");

  return { ok: true };
});
