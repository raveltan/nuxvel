function splitWords(name: string): string[] {
  return name.split(/[-_.\s]+/).filter(Boolean);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function toCamelCase(name: string): string {
  const [first = "", ...rest] = splitWords(name);
  return [first.toLowerCase(), ...rest.map(capitalize)].join("");
}

export function toPascalCase(name: string): string {
  return splitWords(name).map(capitalize).join("");
}

export function toSnakeCase(name: string): string {
  return splitWords(name)
    .map((word) => word.toLowerCase())
    .join("_");
}

export function toSentenceCase(name: string): string {
  const sentence = splitWords(name)
    .map((word) => word.toLowerCase())
    .join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
