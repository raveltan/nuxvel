/**
 * What `GET /api/flags` answers: every flag's value and every
 * experiment's variant for the user making the request. Never the
 * targeting rules behind them.
 */
export interface FlagValues {
  /** The id of the user these were evaluated for, `null` for a guest. */
  subject: string | null;
  flags: Record<string, boolean>;
  experiments: Record<string, string>;
}

/** The channel `setFlagTargeting()` announces a change on, and `useFlag()` refreshes from. */
export const FLAGS_CHANNEL = "flags";
