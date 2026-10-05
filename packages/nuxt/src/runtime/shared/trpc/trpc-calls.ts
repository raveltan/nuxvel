import superjson from "superjson";

export function trpcCalls(url: URL, body: string | null) {
  const batched = url.searchParams.get("batch") === "1";
  const sent = body ?? url.searchParams.get("input");
  const inputs = sent ? JSON.parse(sent) : undefined;
  const paths = decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf("/") + 1));

  return paths.split(",").map((path, index) => {
    const input = batched ? inputs?.[index] : inputs;
    return { path, input: input ? superjson.deserialize(input) : undefined };
  });
}
