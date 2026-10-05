import { z } from "zod";

export const BROWSER_PROBLEMS_PATH = "/_nuxvel/devtools/api/browser-problems";

export const BROWSER_PROBLEM_MAX_MESSAGE = 16 * 1024;

export const browserProblem = z.object({
  level: z.enum(["warn", "error"]),
  message: z.string().min(1).max(BROWSER_PROBLEM_MAX_MESSAGE),
  path: z.string().max(2048),
  requestId: z.string().max(128).optional(),
});

export type BrowserProblem = z.infer<typeof browserProblem>;
