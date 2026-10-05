export type EntryFields = {
  id: string;
  kind: "request" | "job" | "command" | "server";
  label: string;
  startedAt: number;
  durationMs?: number;
  status?: number;
  error?: string;
  actor?: string;
  truncated: boolean;
};

export type TimelineSpan = { type: string; atMs: number; summary: string; data: unknown; truncated?: true };

export type TimelineEntry = EntryFields & { spans: TimelineSpan[] };
