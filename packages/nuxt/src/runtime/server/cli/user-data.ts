import { eraseUserData } from "../privacy/erase-user-data";
import { exportUserData } from "../privacy/export-user-data";
import type { NuxvelCommand } from "./command";
import { commandSuccess } from "./command-error";

type UserDataCommand = Extract<NuxvelCommand, { kind: "user:export" | "user:erase" }>;

export async function runUserDataCommand(command: UserDataCommand): Promise<number> {
  if (command.kind === "user:export") {
    console.log(JSON.stringify(await exportUserData(command.userId), null, 2));
    return 0;
  }

  const erased = await eraseUserData(command.userId);
  const counts = Object.entries(erased).map(([table, rows]) => `${table} ${rows}`);

  commandSuccess(`Erased user ${command.userId}: ${counts.join(", ")}`);
  return 0;
}
