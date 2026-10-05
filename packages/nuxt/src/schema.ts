/** Builds `#nuxvel/schema`: re-exports every discovered Drizzle schema file. */
export function buildSchemaModuleCode(files: string[]) {
  if (files.length === 0) return "export {}";
  return files.map((file) => `export * from ${JSON.stringify(file)};`).join("\n");
}
