const TOKEN_IN_PATH = /^(\/api\/auth\/reset-password\/)[^/]+/;

export function loggedPath(path: string) {
  const [pathname = ""] = path.split("?");

  return pathname.replace(TOKEN_IN_PATH, "$1[redacted]");
}
