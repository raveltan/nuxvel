export type SchedulesSectionData = {
  name: string;
  description: string;
  pattern: string;
  nextRun: string | null;
  storedAs: string | null;
}[];
