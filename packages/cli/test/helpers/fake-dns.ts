import { createSocket } from "node:dgram";
import { fileURLToPath } from "node:url";

const TXT = 16;
const NXDOMAIN = 3;

const preload = fileURLToPath(new URL("./fake-dns-preload.mjs", import.meta.url));

function questionName(query: Buffer) {
  const labels: string[] = [];
  let offset = 12;

  for (let length = query[offset] ?? 0; length > 0; length = query[offset] ?? 0) {
    labels.push(query.subarray(offset + 1, offset + 1 + length).toString("latin1"));
    offset += length + 1;
  }

  return { name: labels.join(".").toLowerCase(), questionEnd: offset + 5 };
}

function txtAnswer(text: string) {
  const data = Buffer.from(text, "latin1");
  const answer = Buffer.alloc(12);

  answer.writeUInt16BE(0xc00c, 0);
  answer.writeUInt16BE(TXT, 2);
  answer.writeUInt16BE(1, 4);
  answer.writeUInt32BE(60, 6);
  answer.writeUInt16BE(data.length + 1, 10);

  return Buffer.concat([answer, Buffer.from([data.length]), data]);
}

function reply(query: Buffer, records: Record<string, string[]>) {
  const { name, questionEnd } = questionName(query);
  const qtype = query.readUInt16BE(questionEnd - 4);
  const known = name in records;
  const answers = known && qtype === TXT ? (records[name] ?? []) : [];
  const header = Buffer.alloc(12);

  query.copy(header, 0, 0, 2);
  header.writeUInt16BE(0x8180 | (known ? 0 : NXDOMAIN), 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(answers.length, 6);

  return Buffer.concat([header, query.subarray(12, questionEnd), ...answers.map(txtAnswer)]);
}

export async function startFakeDns(records: Record<string, string[]>) {
  const socket = createSocket("udp4");

  socket.on("message", (query, peer) => socket.send(reply(query, records), peer.port, peer.address));
  await new Promise<void>((resolve) => socket.bind(0, "127.0.0.1", resolve));

  const { port } = socket.address();

  return {
    env: { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${preload}`, NUXVEL_TEST_DNS_SERVER: `127.0.0.1:${port}` },
    close: () => new Promise<void>((resolve) => socket.close(() => resolve())),
  };
}
