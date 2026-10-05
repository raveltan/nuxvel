import { createResolver } from "@nuxt/kit";

const taskNameListModule = createResolver(import.meta.url).resolve("./runtime/server/cli/task-name-list");

/**
 * Builds `#nuxvel/task-names`: the name of every task Nitro registered,
 * from `server/tasks/` or a module's `nitro.tasks`, sorted, typed as a
 * readonly tuple so its element type is the union of the names.
 */
export function buildTaskNamesModuleCode(names: string[]) {
  return `import { taskNameList } from ${JSON.stringify(taskNameListModule)};

export default taskNameList(${JSON.stringify([...names].sort())});
`;
}
