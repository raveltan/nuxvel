import { type H3Event, readBody } from "h3";
import superjson, { type SuperJSONResult } from "superjson";

export async function readSuperjsonBody<T>(event: H3Event): Promise<T> {
  return superjson.deserialize<T>(await readBody<SuperJSONResult>(event));
}
