import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { defineEventHandler, type H3Event, setResponseHeaders } from "h3";

const HTML_TYPE = "text/html; charset=utf-8";

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function inlineScriptHashes(html: string) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)].map(
    ([, body]) => `'sha256-${createHash("sha256").update(body ?? "").digest("base64")}'`,
  );
}

function pageHeaders(html: string) {
  return {
    "content-type": HTML_TYPE,
    "x-frame-options": "SAMEORIGIN",
    "content-security-policy": [
      "default-src 'self'",
      `script-src 'self' ${inlineScriptHashes(html).join(" ")}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  };
}

function clientFile(clientDir: string, basePath: string, event: H3Event) {
  const pathname = decodeURIComponent(event.path.split("?")[0] ?? "");

  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return;

  const relative = pathname.slice(basePath.length).replace(/^\/+/, "");

  if (relative.startsWith("api/")) return;

  const file = normalize(join(clientDir, relative || "index.html"));

  return file.startsWith(`${clientDir}${sep}`) ? file : undefined;
}

export function devtoolsClientHandler(clientDir: string, basePath: string) {
  return defineEventHandler(async (event) => {
    const file = clientFile(clientDir, basePath, event);

    if (!file) return;

    const contents = await readFile(file).catch(() => undefined);

    if (!contents) return;

    if (extname(file) === ".html") {
      const html = contents.toString("utf8");

      setResponseHeaders(event, pageHeaders(html));
      return html;
    }

    setResponseHeaders(event, { "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream" });
    return contents;
  });
}
