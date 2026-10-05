import taskNames from "#nuxvel/task-names";

type IsAny<T> = 0 extends 1 & T ? true : false;

type TaskName = (typeof taskNames)[number];

export const taskNamesAreTheirLiterals: IsAny<TaskName> extends true
  ? never
  : [TaskName] extends ["_probe-record"]
    ? ["_probe-record"] extends [TaskName]
      ? true
      : never
    : never = true;

export function taskNamesAreReadonly() {
  // @ts-expect-error the generated task list is readonly
  taskNames.push("_probe-record");
}
