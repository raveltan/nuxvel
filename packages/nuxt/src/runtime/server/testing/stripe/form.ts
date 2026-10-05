export type FormValue = string | FormValue[] | { [key: string]: FormValue };

interface Tree {
  [key: string]: string | Tree;
}

function pathOf(key: string) {
  const [head = "", ...rest] = key.split("[");

  return [head, ...rest.map((segment) => segment.replace(/]$/, ""))];
}

function assign(tree: Tree, path: string[], value: string) {
  const [segment = "", ...rest] = path;
  const key = segment === "" ? String(Object.keys(tree).length) : segment;

  if (rest.length === 0) {
    tree[key] = value;
    return;
  }

  const existing = tree[key];
  const child: Tree = typeof existing === "object" ? existing : {};

  tree[key] = child;
  assign(child, rest, value);
}

function settle(value: string | Tree): FormValue {
  if (typeof value === "string") return value;

  const keys = Object.keys(value);

  if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) {
    return keys.sort((a, b) => Number(a) - Number(b)).map((key) => settle(value[key] ?? ""));
  }

  return Object.fromEntries(keys.map((key) => [key, settle(value[key] ?? "")]));
}

export function parseStripeForm(text: string): Record<string, FormValue> {
  const tree: Tree = {};

  for (const [key, value] of new URLSearchParams(text)) assign(tree, pathOf(key), value);

  return Object.fromEntries(Object.entries(tree).map(([key, value]) => [key, settle(value)]));
}

function formField(value: FormValue | undefined, ...path: (string | number)[]): FormValue | undefined {
  const [key, ...rest] = path;

  if (key === undefined || value === undefined) return value;
  if (typeof value === "string") return undefined;

  const child = Array.isArray(value) ? value[Number(key)] : value[String(key)];

  return formField(child, ...rest);
}

export function formText(value: FormValue | undefined, ...path: (string | number)[]): string | undefined {
  const found = formField(value, ...path);

  return typeof found === "string" ? found : undefined;
}

export function formList(value: FormValue | undefined, ...path: (string | number)[]): FormValue[] {
  const found = formField(value, ...path);

  return Array.isArray(found) ? found : [];
}

export function formRecord(value: FormValue | undefined, ...path: (string | number)[]): Record<string, string> {
  const found = formField(value, ...path);

  if (found === undefined || typeof found === "string" || Array.isArray(found)) return {};

  return Object.fromEntries(Object.entries(found).flatMap(([key, entry]) => (typeof entry === "string" ? [[key, entry]] : [])));
}
