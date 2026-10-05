import type { fetch } from "@nuxt/test-utils/e2e";
import type { UploadName } from "../runtime/server/storage/registry";

export type UploadFile = (name: UploadName, file: File) => Promise<string>;

export function uploader(send: typeof fetch): UploadFile {
  return async (name, file) => {
    const ask = await send(`/api/uploads/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: file.type, size: file.size }),
    });

    if (!ask.ok) throw Object.assign(new Error(`The upload URL for "${name}" was refused with ${ask.status}`), { statusCode: ask.status });

    const { url, key, headers }: { url: string; key: string; headers: Record<string, string> } = await ask.json();
    const put = await globalThis.fetch(url, { method: "PUT", headers, body: file });

    if (!put.ok) throw Object.assign(new Error(`The storage refused the file for "${name}" with ${put.status}`), { statusCode: put.status });

    return key;
  };
}
