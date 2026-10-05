export type SectionSummary = { id: string; title: string };

export type SectionResult =
  | { id: string; status: "ready"; data: unknown }
  | { id: string; status: "failed"; error: string };
