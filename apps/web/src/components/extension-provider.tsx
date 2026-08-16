"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchLatestExtensionMeta,
  isExtensionOutdated,
  pairExtension,
  pingExtension,
  type ExtensionLatestMeta,
  type ExtensionPing,
} from "@/lib/extension-bridge";

export type ExtensionStatus = "checking" | "missing" | "installed" | "connected";

type ExtensionContextValue = {
  status: ExtensionStatus;
  ping: ExtensionPing | null;
  latest: ExtensionLatestMeta | null;
  outdated: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  connect: () => Promise<boolean>;
};

const ExtensionContext = createContext<ExtensionContextValue | null>(null);

function statusFromPing(ping: ExtensionPing | null): ExtensionStatus {
  if (!ping?.ok) return "missing";
  if (ping.paired) return "connected";
  return "installed";
}

export function ExtensionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ExtensionStatus>("checking");
  const [ping, setPing] = useState<ExtensionPing | null>(null);
  const [latest, setLatest] = useState<ExtensionLatestMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const autoPairAttempted = useRef(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [next, meta] = await Promise.all([pingExtension(), fetchLatestExtensionMeta()]);
      setPing(next);
      setLatest(meta);
      setStatus(statusFromPing(next));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/extension/pair", { method: "POST" });
      if (res.status === 401) {
        setError("Sign in required");
        return false;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Could not create extension token");
      }
      const data = (await res.json()) as { token: string; apiBaseUrl: string };
      const paired = await pairExtension({ apiBaseUrl: data.apiBaseUrl, apiToken: data.token });
      if (!paired.ok) throw new Error(paired.error || "Extension did not accept credentials");
      const next = await pingExtension();
      setPing(next);
      setStatus(statusFromPing(next));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
      const next = await pingExtension();
      setPing(next);
      setStatus(statusFromPing(next));
      return false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 4000);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (status !== "installed" || autoPairAttempted.current) return;
    autoPairAttempted.current = true;
    void connect();
  }, [status, connect]);

  const outdated = useMemo(
    () => isExtensionOutdated(ping?.version, latest?.version),
    [ping?.version, latest?.version],
  );

  const value = useMemo(
    () => ({ status, ping, latest, outdated, error, refreshing, refresh, connect }),
    [status, ping, latest, outdated, error, refreshing, refresh, connect],
  );

  return <ExtensionContext.Provider value={value}>{children}</ExtensionContext.Provider>;
}

export function useExtension() {
  const ctx = useContext(ExtensionContext);
  if (!ctx) {
    throw new Error("useExtension must be used within ExtensionProvider");
  }
  return ctx;
}
