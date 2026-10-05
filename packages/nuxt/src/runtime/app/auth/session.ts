import { type NuxtApp, useNuxtApp, useRequestFetch, useState } from "#app";
import { parseJSON } from "better-auth/client";
import type { authClient } from "./client";

export type Session = typeof authClient.$Infer.Session;

const refreshes = new WeakMap<NuxtApp, Promise<Session | null>>();

export function useSessionState() {
  return useState<Session | null | undefined>("nuxvel:session", () => undefined);
}

async function requestSession(request: ReturnType<typeof useRequestFetch>) {
  try {
    const body = await request<string>("/api/auth/get-session", { responseType: "text" });

    return parseJSON<Session | null>(body) ?? null;
  } catch {
    return null;
  }
}

export function refreshSession(): Promise<Session | null> {
  const nuxtApp = useNuxtApp();
  const state = useSessionState();
  const refresh: Promise<Session | null> = requestSession(useRequestFetch()).then((session) => {
    const latest = refreshes.get(nuxtApp);

    if (latest !== refresh) return latest ?? state.value ?? null;

    refreshes.delete(nuxtApp);
    state.value = session;

    return session;
  });

  refreshes.set(nuxtApp, refresh);

  return refresh;
}

export function loadSession() {
  const state = useSessionState();

  return refreshes.get(useNuxtApp()) ??
    (state.value === undefined ? refreshSession() : Promise.resolve(state.value));
}
