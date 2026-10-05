import { createEventStream, defineEventHandler } from "h3";
import type { SectionSummary } from "../../shared/devtools/section-stream";
import { devtoolsSections } from "../devtools/define-devtools-section";
import { loadSection } from "../devtools/load-section";

const REFRESH_MS = 2000;

export default defineEventHandler(async (event) => {
  const stream = createEventStream(event);
  const sections = devtoolsSections();
  const lastSent = new Map<string, string>();
  let timer: NodeJS.Timeout | undefined;
  let closed = false;

  async function sendChangedSections() {
    await Promise.all(
      sections.map(async (section) => {
        const data = JSON.stringify(await loadSection(section));

        if (closed || lastSent.get(section.id) === data) return;
        lastSent.set(section.id, data);
        await stream.push({ event: "section", data });
      }),
    );
  }

  async function refreshForever() {
    await sendChangedSections();
    if (!closed) timer = setTimeout(() => void refreshForever(), REFRESH_MS);
  }

  stream.onClosed(() => {
    closed = true;
    clearTimeout(timer);
  });

  const summaries: SectionSummary[] = sections.map(({ id, title }) => ({ id, title }));

  void stream.push({ event: "sections", data: JSON.stringify(summaries) });
  void refreshForever();

  return stream.send();
});
