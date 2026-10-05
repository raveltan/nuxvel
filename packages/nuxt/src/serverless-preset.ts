const SERVERLESS_PRESET = /^(aws-lambda|azure|cloudflare|deno-deploy|firebase|netlify|vercel)/;

export function serverlessPresetWarning(preset: string, uses: { worker: string[]; channels: boolean }) {
  if (!SERVERLESS_PRESET.test(preset)) return undefined;

  const problems = [
    ...(uses.worker.length > 0
      ? [`${new Intl.ListFormat("en").format(uses.worker)} need a long-running nuxvel queue:work worker`]
      : []),
    ...(uses.channels ? ["channels hold server-sent event streams open longer than a function runs"] : []),
  ];

  if (problems.length === 0) return undefined;

  return `the "${preset}" preset runs the server as serverless functions, but ${problems.join(", and ")}. Deploy the app with a server preset such as node-server.`;
}
