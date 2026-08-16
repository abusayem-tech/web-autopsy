/** Stable Chrome extension ID (from apps/extension/keys). */
export const EXTENSION_ID =
  process.env.NEXT_PUBLIC_EXTENSION_ID || "fbpilhkaigbhjhcccoonbkcgpgoegpda";

export const EXTENSION_ZIP_HREF = "/extension/web-autopsy-chrome.zip";

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
