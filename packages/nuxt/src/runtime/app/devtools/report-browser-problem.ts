import { BROWSER_PROBLEMS_PATH, BROWSER_PROBLEM_MAX_MESSAGE, type BrowserProblem } from "../../shared/devtools/browser-problem";

const reported = new WeakSet<object>();
let endpoint: string | undefined;
let pageRequestId: string | undefined;

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function alreadyReported(problem: unknown) {
  if (!isObject(problem)) return false;

  const cause = problem instanceof Error ? problem.cause : undefined;
  const seen = reported.has(problem) || (isObject(cause) && reported.has(cause));

  reported.add(problem);

  return seen;
}

function problemText(problem: unknown) {
  if (!(problem instanceof Error)) return String(problem);

  const head = `${problem.name}: ${problem.message}`;

  return problem.stack?.startsWith(head) ? problem.stack : [head, problem.stack].filter(Boolean).join("\n");
}

export function startReportingBrowserProblems(baseURL: string, requestId: string | undefined) {
  endpoint = `${baseURL.replace(/\/$/, "")}${BROWSER_PROBLEMS_PATH}`;
  pageRequestId = requestId;
}

export function startBrowserPage() {
  pageRequestId = crypto.randomUUID();
}

export function reportBrowserProblem(level: BrowserProblem["level"], problem: unknown, text = problemText(problem)) {
  if (!endpoint || alreadyReported(problem)) return;

  const body: BrowserProblem = {
    level,
    message: text.slice(0, BROWSER_PROBLEM_MAX_MESSAGE) || "(empty)",
    path: window.location.pathname.slice(0, 2048),
    ...(pageRequestId === undefined ? {} : { requestId: pageRequestId }),
  };
  const json = JSON.stringify(body);

  try {
    if (navigator.sendBeacon(endpoint, new Blob([json], { type: "application/json" }))) return;
  } catch {}

  void fetch(endpoint, { method: "POST", body: json, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
}
