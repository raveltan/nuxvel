export type SqlQuery = {
  index: number;
  atMs: number;
  sql: string;
  params: unknown[];
  durationMs: number;
  repeatReason?: string;
  repeated: number;
  suspected: boolean;
};

export type SqlEntry = { id: string; kind: string; label: string; startedAt: number; queries: SqlQuery[] };

export type SqlSectionData = SqlEntry[];
