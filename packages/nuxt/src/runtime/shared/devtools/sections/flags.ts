export type FlagTargeting = { percentage?: number; roles?: Record<string, boolean> };

export type FlagsSectionData = (
  | {
      kind: "flag";
      name: string;
      storedAs: string | null;
      default: boolean;
      expiresAt: string | null;
      targeting: FlagTargeting;
    }
  | {
      kind: "experiment";
      name: string;
      storedAs: string | null;
      variants: Record<string, number>;
      status: "not started" | "running" | "stopped";
    }
)[];
