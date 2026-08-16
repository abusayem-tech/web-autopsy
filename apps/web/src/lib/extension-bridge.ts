/** Stable Chrome extension ID (from apps/extension/keys). */
export const EXTENSION_ID =
  process.env.NEXT_PUBLIC_EXTENSION_ID || "fbpilhkaigbhjhcccoonbkcgpgoegpda";

export const EXTENSION_ZIP_HREF = "/extension/web-autopsy-chrome.zip";
export const EXTENSION_LATEST_HREF = "/extension/latest.json";

type ChromeRuntime = {
  sendMessage: (
    extensionId: string,
    message: unknown,
    responseCallback?: (response: unknown) => void,
  ) => void;
  lastError?: { message?: string };
};

function getChromeRuntime(): ChromeRuntime | null {
  if (typeof window === "undefined") return null;
  const chromeObj = (window as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return chromeObj?.runtime ?? null;
}

export type ExtensionPing = {
  ok: boolean;
  version?: string;
  paired?: boolean;
  apiBaseUrl?: string | null;
};

export type ExtensionLatestMeta = {
  version: string;
  downloadPath?: string;
  bytes?: number;
  updatedAt?: string;
};

/** Return true when installed semver is older than latest. */
export function isExtensionOutdated(installed?: string | null, latest?: string | null): boolean {
  if (!installed || !latest) return false;
  const parse = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(".")
      .map((p) => Number.parseInt(p.replace(/\D.*/, ""), 10) || 0);
  const a = parse(installed);
  const b = parse(latest);
  const len = Math.max(a.length, b.length, 3);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

export async function fetchLatestExtensionMeta(): Promise<ExtensionLatestMeta | null> {
  try {
    const res = await fetch(EXTENSION_LATEST_HREF, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as ExtensionLatestMeta;
    return data?.version ? data : null;
  } catch {
    return null;
  }
}

export function pingExtension(timeoutMs = 800): Promise<ExtensionPing | null> {
  return new Promise((resolve) => {
    const runtime = getChromeRuntime();
    if (!runtime?.sendMessage) {
      resolve(null);
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);
    try {
      runtime.sendMessage(EXTENSION_ID, { type: "PING" }, (response) => {
        window.clearTimeout(timer);
        if (settled) return;
        settled = true;
        const err = (window as unknown as { chrome?: { runtime?: { lastError?: { message?: string } } } }).chrome
          ?.runtime?.lastError;
        if (err || !response) {
          resolve(null);
          return;
        }
        resolve(response as ExtensionPing);
      });
    } catch {
      window.clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }
  });
}

export function pairExtension(payload: {
  apiBaseUrl: string;
  apiToken: string;
}): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const runtime = getChromeRuntime();
    if (!runtime?.sendMessage) {
      resolve({ ok: false, error: "Chrome runtime unavailable" });
      return;
    }
    try {
      runtime.sendMessage(EXTENSION_ID, { type: "PAIR", ...payload }, (response) => {
        const err = (window as unknown as { chrome?: { runtime?: { lastError?: { message?: string } } } }).chrome
          ?.runtime?.lastError;
        if (err) {
          resolve({ ok: false, error: err.message || "Extension not reachable" });
          return;
        }
        const res = response as { ok?: boolean; error?: string } | undefined;
        resolve({ ok: Boolean(res?.ok), error: res?.error });
      });
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : "pair failed" });
    }
  });
}
