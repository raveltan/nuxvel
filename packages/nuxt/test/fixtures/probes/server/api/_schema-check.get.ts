import * as schema from "#nuxvel/schema";

export default defineEventHandler(() => {
  return { keys: Object.keys(schema) };
});
