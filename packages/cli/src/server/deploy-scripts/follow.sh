node - "$log" "$pid" "$start" <<'JS'
const { closeSync, openSync, readFileSync, readSync, statSync } = require("node:fs");
const [log, pid, start] = process.argv.slice(2);
const running = () => {
  try {
    return readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]?.[0] !== "Z";
  } catch {
    return false;
  }
};
let offset = Number(start);
const follow = () => {
  const size = statSync(log).size;
  if (size > offset) {
    const buffer = Buffer.alloc(size - offset);
    const fd = openSync(log, "r");
    readSync(fd, buffer, 0, buffer.length, offset);
    closeSync(fd);
    offset = size;
    process.stdout.write(buffer);
    if (/^@outcome /m.test(buffer.toString("utf8"))) return;
  }
  if (!running() && statSync(log).size === offset) return;
  setTimeout(follow, 200);
};
follow();
JS
