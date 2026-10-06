import { tagsTable } from "#nuxvel/schema";

export const tagsPolicy = definePolicy(tagsTable, {
  preload: (actor) => {
    if (actor.type !== "user") throw new Error(`the tag policy preloads for users only, not a ${actor.type} actor`);
    return null;
  },
  rules: {
    rename: (actor) => actor.type === "user",
  },
});
