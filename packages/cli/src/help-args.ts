export function isHelpArg(arg: string) {
  return arg === "--help" || arg === "-h";
}

export function asksForHelp(rawArgs: string[]) {
  return rawArgs.some(isHelpArg);
}

export function commandName(rawArgs: string[]) {
  return rawArgs.find((arg) => !arg.startsWith("-"));
}
