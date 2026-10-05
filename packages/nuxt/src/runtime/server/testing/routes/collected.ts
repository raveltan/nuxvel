import { defineEventHandler } from "h3";
import { recentEntries } from "../../observe/collector/entries-buffer";
import { refuseOutsideVitest } from "../refuse-outside-vitest";

export default defineEventHandler(() => {
  refuseOutsideVitest();

  return recentEntries();
});
