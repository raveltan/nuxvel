import type { SerializedError, Settled } from "../runtime/server/testing/settle";
import { callControlChannel } from "./control-channel";
import { recordAppQueries } from "./query-count";

function rejection(error: SerializedError) {
  return Object.assign(new Error(error.message), error);
}

export async function callApp<Data = unknown>(route: string, body: unknown, headers?: HeadersInit): Promise<Data> {
  const settled = await callControlChannel<Settled<Data>>(route, body, headers);

  recordAppQueries(settled.queries);

  if (!settled.ok) throw rejection(settled.error);

  return settled.data;
}
