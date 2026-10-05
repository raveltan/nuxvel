/**
 * Returns the task names `#nuxvel/task-names` lists, typed as a readonly
 * tuple of their literals. The generated module calls it so its source
 * stays plain JavaScript.
 */
export function taskNameList<const Names extends readonly string[]>(names: Names): Names {
  return names;
}
