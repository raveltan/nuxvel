import { openStream } from "./channel-stream";

type SectionResult<Data> = { id: string; status: "ready"; data: Data } | { id: string; status: "failed"; error: string };

export async function readDevtoolsSections(headers: Record<string, string> = {}) {
  const stream = await openStream("/_nuxvel/devtools/api/stream", headers);

  try {
    const announced = await stream.next();

    if (typeof announced === "string" || announced.event !== "sections") {
      throw new Error(`expected the sections list, got ${JSON.stringify(announced)}`);
    }

    const sections: { id: string }[] = JSON.parse(announced.data);
    const results = new Map<string, string>();

    while (results.size < sections.length) {
      const message = await stream.next(10_000);

      if (typeof message === "string") throw new Error(`stream ${message} before every section loaded`);

      const { id }: { id: string } = JSON.parse(message.data);

      results.set(id, message.data);
    }

    return { ids: sections.map((section) => section.id), results };
  } finally {
    stream.close();
  }
}

export function sectionResult<Data>(results: Map<string, string>, id: string): SectionResult<Data> {
  return JSON.parse(results.get(id) ?? "null");
}

export function readySection<Data>(results: Map<string, string>, id: string): Data {
  const result = sectionResult<Data>(results, id);

  if (result?.status !== "ready") throw new Error(`section ${id} did not load: ${results.get(id)}`);

  return result.data;
}
