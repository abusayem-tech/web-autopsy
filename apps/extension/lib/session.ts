import type { AutopsySession } from "@web-autopsy/core";
import { buildSavePayload } from "@web-autopsy/core";
import JSZip from "jszip";

export async function getActiveTabId(fallback?: number): Promise<number | null> {
  if (fallback != null) return fallback;
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get("tabId");
  if (fromQuery) return Number(fromQuery);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id ?? null;
}

export async function fetchSession(tabId: number): Promise<{
  session: AutopsySession;
  paused: boolean;
  deepCapture: boolean;
}> {
  return chrome.runtime.sendMessage({ type: "GET_SESSION", tabId });
}

export async function loadOptions(): Promise<{ apiBaseUrl: string; apiToken: string }> {
  const data = await chrome.storage.sync.get(["apiBaseUrl", "apiToken"]);
  return {
    apiBaseUrl: data.apiBaseUrl || "",
    apiToken: data.apiToken || "",
  };
}

export async function saveToCloud(tabId: number, title?: string, includeSecrets = false) {
  await chrome.runtime.sendMessage({ type: "GET_HTML", tabId });
  await chrome.runtime.sendMessage({ type: "CAPTURE_SCREENSHOT", tabId });
  const { session } = await fetchSession(tabId);
  const payload = buildSavePayload(session, { title, includeSecrets, includeBodies: false });
  const opts = await loadOptions();
  if (!opts.apiBaseUrl || !opts.apiToken) {
    throw new Error("Set API base URL and token in Options first.");
  }
  const res = await fetch(`${opts.apiBaseUrl.replace(/\/$/, "")}/api/autopsies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Save failed (${res.status})`);
  }
  return res.json() as Promise<{ id: string }>;
}

export async function downloadRebuildKit(tabId: number) {
  await chrome.runtime.sendMessage({ type: "GET_HTML", tabId });
  const shot = await chrome.runtime.sendMessage({ type: "CAPTURE_SCREENSHOT", tabId });
  const { session } = await fetchSession(tabId);
  const enriched = buildSavePayload(session, { includeSecrets: false });
  const zip = new JSZip();
  const folder = zip.folder("rebuild-kit")!;
  folder.file(
    "meta.json",
    JSON.stringify(
      { url: session.pageUrl, title: session.pageTitle, capturedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  folder.file("page.html", session.htmlSnapshot || "");
  if (shot?.dataUrl) {
    const b64 = String(shot.dataUrl).split(",")[1] || "";
    folder.file("screenshot.png", b64, { base64: true });
  }
  folder.file("images.json", JSON.stringify(session.images, null, 2));
  folder.file(
    "styles.json",
    JSON.stringify(session.scripts.filter((s) => s.src).map((s) => s.src), null, 2),
  );
  folder.file("apis.json", JSON.stringify(enriched.portableApis, null, 2));
  folder.file("performance.json", JSON.stringify(session.performance, null, 2));
  folder.file("story.md", enriched.brief?.story || "");
  folder.file("advice.json", JSON.stringify(enriched.advice, null, 2));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `web-autopsy-${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
