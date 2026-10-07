import { randomUUID } from "node:crypto";
import { runTask } from "nitropack/runtime";
import taskNames from "#nuxvel/task-names";
import { observeRun } from "../observe/channels";
import { CommandError, commandSuccess } from "./command-error";

export async function runTaskCommand(name: string, payload: Record<string, unknown>): Promise<number> {
  const registeredTasks: readonly string[] = taskNames;

  if (!registeredTasks.includes(name)) {
    throw new CommandError(`no task named "${name}"`, {
      hint: "A task is a file under server/tasks, e.g. server/tasks/reindex-posts.ts",
    });
  }

  const { result } = await observeRun({ id: `command:${randomUUID()}`, kind: "command", label: `task:run ${name}` }, () =>
    runTask(name, { payload }),
  );

  commandSuccess(`${name} finished`);
  console.log(JSON.stringify(result ?? null));

  return 0;
}
