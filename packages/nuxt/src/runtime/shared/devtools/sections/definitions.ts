import type { ReadableSchema } from "../readable-schema";

export type DefinitionsSectionData = {
  mails: { name: string; input: ReadableSchema | null }[];
  rateLimits: { name: string; points: number; seconds: number }[];
  backfills: {
    name: string;
    table: string;
    storedAs: string | null;
    processed: number | null;
    total: number | null;
    completed: boolean;
  }[];
};
