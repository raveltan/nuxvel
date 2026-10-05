import { $fetch } from "@nuxt/test-utils/e2e";

/** The head tags {@link getMeta} returns, by name. */
export type PageMeta = Record<string, string>;

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', lt: "<", gt: ">", apos: "'" };

function decode(value: string) {
  return value.replace(/&(?:#x([\da-f]+)|#(\d+)|(\w+));/gi, (match, hex, decimal, name) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : decimal ? String.fromCodePoint(Number(decimal)) : (ENTITIES[name] ?? match),
  );
}

function attributes(tag: string) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name = "", value = ""]) => [name, decode(value)]));
}

/**
 * Fetches the server-rendered HTML of `path` and returns its head tags: `title`, `canonical`, and each `<meta>` by its `name` or `property`.
 *
 * Fetches signed out and throws on an error status. Reads the server render only. To check that a client navigation updates the tags, use {@link visit}.
 *
 * @example
 * ```ts
 * const meta = await getMeta(`/posts/${post.id}`);
 * expect(meta["og:title"]).toBe("First post");
 * expect(meta.canonical).toBe(`https://blog.example.com/posts/${post.id}`);
 * ```
 */
export async function getMeta(path: string): Promise<PageMeta> {
  const html = await $fetch<string>(path, { responseType: "text" });
  const head = html.split("</head>")[0] ?? html;
  const meta: PageMeta = {};
  const title = head.match(/<title[^>]*>([^<]*)<\/title>/)?.[1];

  if (title !== undefined) meta.title = decode(title);

  for (const [, tag = ""] of head.matchAll(/<meta\s([^>]*)>/g)) {
    const { name, property, content } = attributes(tag);
    const key = name ?? property;

    if (key && content !== undefined && !(key in meta)) meta[key] = content;
  }

  for (const [, tag = ""] of head.matchAll(/<link\s([^>]*)>/g)) {
    const { rel, href } = attributes(tag);

    if (rel === "canonical" && href !== undefined && !("canonical" in meta)) meta.canonical = href;
  }

  return meta;
}
