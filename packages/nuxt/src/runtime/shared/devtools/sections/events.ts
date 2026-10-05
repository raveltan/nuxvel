import type { ReadableSchema } from "../readable-schema";

export type CatalogListener = { name: string; mode: "sync" | "queued"; oldNames: string[] };

export type EventsSectionData = {
  name: string;
  version: number;
  payload: ReadableSchema | null;
  listeners: CatalogListener[];
}[];
