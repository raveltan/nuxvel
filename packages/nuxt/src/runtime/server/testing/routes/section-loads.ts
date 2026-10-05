import { defineEventHandler } from "h3";
import { sectionLoadCounts } from "../../devtools/load-section";
import { refuseOutsideVitest } from "../refuse-outside-vitest";

export default defineEventHandler(() => {
  refuseOutsideVitest();

  return sectionLoadCounts();
});
