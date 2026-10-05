export type RecentJob = {
  queue: string;
  id: string;
  name: string;
  state: string;
  attemptsMade: number;
  failedReason: string | null;
  delay: number;
  priority: number;
  queuedAt: string;
};

export type JobsSectionData = { counts: Record<string, number>; jobs: RecentJob[] };
