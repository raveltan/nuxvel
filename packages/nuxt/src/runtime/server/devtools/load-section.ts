import type { SectionResult } from "../../shared/devtools/section-stream";
import type { DevtoolsSection } from "./define-devtools-section";
import { errorMessage } from "../errors/error-message";

const SECTION_TIMEOUT_MS = 3000;

const pendingLoads = new Map<string, Promise<unknown>>();
const loadCounts = new Map<string, number>();

async function withinTimeout<T>(work: Promise<T>) {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${SECTION_TIMEOUT_MS / 1000} s`)), SECTION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([work, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

function sharedLoad(section: DevtoolsSection<unknown>) {
  const pending = pendingLoads.get(section.id);

  if (pending) return pending;

  loadCounts.set(section.id, (loadCounts.get(section.id) ?? 0) + 1);

  const load = section.load().finally(() => pendingLoads.delete(section.id));

  pendingLoads.set(section.id, load);

  return load;
}

export function sectionLoadCounts() {
  return Object.fromEntries(loadCounts);
}

export async function loadSection(section: DevtoolsSection<unknown>): Promise<SectionResult> {
  try {
    return { id: section.id, status: "ready", data: await withinTimeout(sharedLoad(section)) };
  } catch (error) {
    return { id: section.id, status: "failed", error: errorMessage(error) };
  }
}
