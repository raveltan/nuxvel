import type { SectionResult, SectionSummary } from "../../../src/runtime/shared/devtools/section-stream";

export function useSectionStream() {
  const sections = ref<SectionSummary[]>([]);
  const results = reactive<Record<string, SectionResult>>({});
  const connected = ref(false);
  const open = ref(false);
  const streamUrl = `${useRuntimeConfig().app.baseURL}api/stream`;
  let source: EventSource | undefined;

  function start() {
    if (source) return;

    source = new EventSource(streamUrl);
    open.value = true;
    source.addEventListener("open", () => {
      connected.value = true;
    });
    source.addEventListener("error", () => {
      connected.value = false;
    });
    source.addEventListener("sections", (event) => {
      sections.value = JSON.parse(event.data);
    });
    source.addEventListener("section", (event) => {
      const result: SectionResult = JSON.parse(event.data);

      results[result.id] = result;
    });
  }

  function stop() {
    source?.close();
    source = undefined;
    open.value = false;
    connected.value = false;
  }

  function followVisibility() {
    if (document.visibilityState === "hidden") stop();
    else start();
  }

  onMounted(() => {
    document.addEventListener("visibilitychange", followVisibility);
    followVisibility();
  });

  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", followVisibility);
    stop();
  });

  return { sections, results, connected, open };
}
