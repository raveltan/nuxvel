import { printLine, success } from "../ui/output.ts";

function changes(count: number) {
  return count === 1 ? "1 change" : `${count} changes`;
}

export function changeReport() {
  let count = 0;

  return {
    line(line: string) {
      if (line.startsWith("~ ")) count += 1;
      printLine(line);
    },
    finish(options: { subject: string; destination: string; dryRun: boolean }) {
      if (count === 0) success(`${options.subject} is set up, nothing to change`);
      else if (options.dryRun) success(`Dry run: ${changes(count)} to make on ${options.destination}, nothing changed`);
      else success(`Made ${changes(count)} on ${options.destination}`);
    },
  };
}
