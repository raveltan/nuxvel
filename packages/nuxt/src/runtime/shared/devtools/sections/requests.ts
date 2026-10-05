import type { EntryFields } from "../collected-entry";

export type EntrySummary = EntryFields & { spanCount: number; warnings: number; errors: number };

export type RequestsSectionData = EntrySummary[];
