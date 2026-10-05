import type { Page } from "playwright-core";

export async function mutateInBrowser<T>(page: Page, path: string, input: unknown) {
  const { ok, body } = await page.evaluate(
    async ([path, input]) => {
      const response = await fetch(`/api/trpc/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      });

      return { ok: response.ok, body: await response.text() };
    },
    [path, input] as const,
  );

  if (!ok) throw new Error(`${path} failed: ${body}`);

  const parsed: { result: { data: { json: T } } } = JSON.parse(body);

  return parsed.result.data.json;
}
