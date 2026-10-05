/**
 * Builds `#nuxvel/translations`: for each locale code, the translation
 * files of every layer that has one, imported as JSON, in layer order.
 */
export function buildTranslationsModuleCode(filesByLocale: Record<string, string[]>) {
  const imports: string[] = [];
  const entries = Object.entries(filesByLocale).map(([code, files]) => {
    const names = files.map((file) => {
      imports.push(`import messages${imports.length} from ${JSON.stringify(file)};`);
      return `messages${imports.length - 1}`;
    });
    return `  ${JSON.stringify(code)}: [${names.join(", ")}],`;
  });

  return `${imports.join("\n")}
export default {
${entries.join("\n")}
};
`;
}
