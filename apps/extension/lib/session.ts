import type { AutopsySession, SavePayload, SaveUploadChunk } from "@web-autopsy/core";
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
  trackedUrl?: string;
  liveUrl?: string;
  pendingPage?: { url: string; title?: string } | null;
  holdCapture?: boolean;
}> {
  return chrome.runtime.sendMessage({ type: "GET_SESSION", tabId });
}

export async function confirmSwitchPage(tabId: number) {
  return chrome.runtime.sendMessage({ type: "CONFIRM_SWITCH_PAGE", tabId }) as Promise<{
    ok: boolean;
    reloaded?: boolean;
    trackedUrl?: string;
    error?: string;
  }>;
}

export async function loadOptions(): Promise<{ apiBaseUrl: string; apiToken: string }> {
  const data = await chrome.storage.sync.get(["apiBaseUrl", "apiToken"]);
  return {
    apiBaseUrl: data.apiBaseUrl || "",
    apiToken: data.apiToken || "",
  };
}

export type SaveProgress = {
  percent: number;
  label: string;
};

async function postChunk(
  apiBaseUrl: string,
  apiToken: string,
  chunk: SaveUploadChunk,
): Promise<{ id: string; updated?: boolean; progress?: number; health?: string }> {
  const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/autopsies/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(chunk),
  });
  if (!res.ok) {
    const text = await res.text();
    if (/FUNCTION_PAYLOAD_TOO_LARGE|Request Entity Too Large|413/i.test(text)) {
      throw new Error("Chunk too large for the server. Try again after updating the extension.");
    }
    throw new Error(text || `Save failed (${res.status})`);
  }
  return res.json() as Promise<{ id: string; updated?: boolean; progress?: number; health?: string }>;
}

/**
 * Sequential upload: meta → session → findings → portable → finish.
 * No screenshots or binary images — image URLs only.
 */
export async function saveToCloud(
  tabId: number,
  options?: {
    title?: string;
    includeSecrets?: boolean;
    onProgress?: (p: SaveProgress) => void;
  },
) {
  const onProgress = options?.onProgress;
  onProgress?.({ percent: 5, label: "Collecting page text…" });
  await chrome.runtime.sendMessage({ type: "GET_HTML", tabId });

  onProgress?.({ percent: 10, label: "Building capture…" });
  const { session } = await fetchSession(tabId);
  // Never attach screenshots for cloud save.
  session.screenshotDataUrl = undefined;
  const payload: SavePayload = buildSavePayload(session, {
    title: options?.title,
    includeSecrets: options?.includeSecrets ?? false,
    includeBodies: false,
  });

  const opts = await loadOptions();
  if (!opts.apiBaseUrl || !opts.apiToken) {
    throw new Error("Set API base URL and token in Options first.");
  }

  onProgress?.({ percent: 20, label: "Uploading page metadata…" });
  const meta = await postChunk(opts.apiBaseUrl, opts.apiToken, {
    step: "meta",
    title: payload.title,
    pageUrl: payload.pageUrl,
    origin: payload.origin,
    summary: payload.summary,
    htmlSnapshot: payload.htmlSnapshot,
    includesSecrets: payload.includesSecrets,
  });
  const id = meta.id;
  const updated = Boolean(meta.updated);

  onProgress?.({ percent: 40, label: "Uploading session data…" });
  await postChunk(opts.apiBaseUrl, opts.apiToken, {
    step: "session",
    id,
    payload: payload.payload,
  });

  onProgress?.({ percent: 60, label: "Uploading findings…" });
  await postChunk(opts.apiBaseUrl, opts.apiToken, {
    step: "findings",
    id,
    findings: payload.findings,
  });

  onProgress?.({ percent: 80, label: "Uploading portable APIs…" });
  await postChunk(opts.apiBaseUrl, opts.apiToken, {
    step: "portable",
    id,
    portableApis: payload.portableApis,
  });

  onProgress?.({ percent: 92, label: "Finalizing brief…" });
  const finish = await postChunk(opts.apiBaseUrl, opts.apiToken, {
    step: "finish",
    id,
    advice: payload.advice,
    brief: payload.brief,
    findings: payload.findings,
    portableApis: payload.portableApis,
  });

  onProgress?.({ percent: 100, label: updated ? "Updated" : "Saved" });
  return { id, updated, health: finish.health };
}

export async function downloadRebuildKit(tabId: number) {
  await chrome.runtime.sendMessage({ type: "GET_HTML", tabId });
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
  // Image URLs only — no binary downloads.
  folder.file(
    "images.json",
    JSON.stringify(
      (session.images || [])
        .filter((i) => /^https?:/i.test(i.url))
        .map((i) => ({ url: i.url, alt: i.alt, bytes: i.bytes, width: i.width, height: i.height })),
      null,
      2,
    ),
  );
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
