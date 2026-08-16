import type { AutopsySession, NetworkEntry, ResourceType } from "@web-autopsy/core";
import {
  buildPerfSnapshot,
  detectStack,
  detectTrackers,
  emptySession,
  enrichSession,
} from "@web-autopsy/core";

type TabState = {
  session: AutopsySession;
  paused: boolean;
  deepCapture: boolean;
  requestIndex: Map<string, string>;
};

const tabs = new Map<number, TabState>();

function mapType(type?: string): ResourceType {
  switch (type) {
    case "main_frame":
    case "sub_frame":
      return "document";
    case "script":
      return "script";
    case "stylesheet":
      return "stylesheet";
    case "image":
      return "image";
    case "font":
      return "font";
    case "xmlhttprequest":
      return "xhr";
    case "media":
      return "media";
    case "websocket":
      return "websocket";
    default:
      return "other";
  }
}

function ensureTab(tabId: number, url?: string): TabState {
  let state = tabs.get(tabId);
  if (!state) {
    state = {
      session: emptySession(tabId, url || "about:blank"),
      paused: false,
      deepCapture: false,
      requestIndex: new Map(),
    };
    tabs.set(tabId, state);
  }
  return state;
}

function resetTab(tabId: number, url: string) {
  const prev = tabs.get(tabId);
  tabs.set(tabId, {
    session: emptySession(tabId, url),
    paused: prev?.paused ?? false,
    deepCapture: prev?.deepCapture ?? false,
    requestIndex: new Map(),
  });
}

function headersToObject(
  headers?: chrome.webRequest.HttpHeader[] | { name: string; value?: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers || []) {
    if (h.name && h.value != null) out[h.name] = h.value;
  }
  return out;
}

function isFirstParty(pageUrl: string, requestUrl: string): boolean {
  try {
    return new URL(pageUrl).hostname === new URL(requestUrl).hostname;
  } catch {
    return false;
  }
}

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);

  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`/inspector.html?tabId=${tab.id}`),
    });
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading" && tab.url && tab.url.startsWith("http")) {
      resetTab(tabId, tab.url);
    }
    if (changeInfo.status === "complete" && tab.url?.startsWith("http")) {
      const state = ensureTab(tabId, tab.url);
      state.session.pageUrl = tab.url;
      state.session.pageTitle = tab.title;
      void fetchWellKnown(tabId, tab.url);
      void fetchCookies(tabId, tab.url);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    tabs.delete(tabId);
  });

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const state = ensureTab(details.tabId);
      if (state.paused) return;
      const id = `wr-${details.requestId}`;
      state.requestIndex.set(details.requestId, id);
      const entry: NetworkEntry = {
        id,
        method: details.method,
        url: details.url,
        resourceType: mapType(details.type),
        timestamp: details.timeStamp,
        firstParty: isFirstParty(state.session.pageUrl, details.url),
        requestBody:
          details.requestBody?.raw?.[0]?.bytes != null
            ? new TextDecoder().decode(details.requestBody.raw[0].bytes).slice(0, 512_000)
            : details.requestBody?.formData
              ? JSON.stringify(details.requestBody.formData).slice(0, 512_000)
              : undefined,
      };
      state.session.requests.push(entry);
      if (state.session.requests.length > 2000) {
        state.session.requests = state.session.requests.slice(-2000);
      }
    },
    { urls: ["<all_urls>"] },
    ["requestBody"],
  );

  chrome.webRequest.onSendHeaders.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const state = tabs.get(details.tabId);
      if (!state || state.paused) return;
      const id = state.requestIndex.get(details.requestId);
      const entry = state.session.requests.find((r) => r.id === id);
      if (entry) entry.requestHeaders = headersToObject(details.requestHeaders);
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders", "extraHeaders"],
  );

  chrome.webRequest.onCompleted.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const state = tabs.get(details.tabId);
      if (!state || state.paused) return;
      const id = state.requestIndex.get(details.requestId);
      const entry = state.session.requests.find((r) => r.id === id);
      if (!entry) return;
      entry.status = details.statusCode;
      entry.responseHeaders = headersToObject(details.responseHeaders);
      entry.durationMs = Math.max(0, details.timeStamp - entry.timestamp);
      const len = entry.responseHeaders?.["content-length"] || entry.responseHeaders?.["Content-Length"];
      if (len) entry.transferSize = Number(len) || undefined;

      if (entry.resourceType === "document" && entry.responseHeaders) {
        const h = Object.fromEntries(
          Object.entries(entry.responseHeaders).map(([k, v]) => [k.toLowerCase(), v]),
        );
        state.session.security.headers = { ...state.session.security.headers, ...h };
        state.session.security.hasHsts = Boolean(h["strict-transport-security"]);
        state.session.security.hasCsp = Boolean(h["content-security-policy"]);
        state.session.security.hasXfo = Boolean(h["x-frame-options"]);
        state.session.security.hasReferrerPolicy = Boolean(h["referrer-policy"]);
        state.session.security.hasPermissionsPolicy = Boolean(h["permissions-policy"]);
      }

      if (details.url.startsWith("http:") && state.session.pageUrl.startsWith("https:")) {
        state.session.security.mixedContentUrls.push(details.url);
      }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders", "extraHeaders"],
  );

  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const state = tabs.get(details.tabId);
      if (!state || state.paused) return;
      const id = state.requestIndex.get(details.requestId);
      const entry = state.session.requests.find((r) => r.id === id);
      if (entry) {
        entry.failed = true;
        entry.error = details.error;
      }
    },
    { urls: ["<all_urls>"] },
  );

  chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
    void (async () => {
      try {
        if (message?.type === "PING") {
          const cfg = await chrome.storage.sync.get(["apiBaseUrl", "apiToken"]);
          sendResponse({
            ok: true,
            version: chrome.runtime.getManifest().version,
            paired: Boolean(cfg.apiBaseUrl && cfg.apiToken),
            apiBaseUrl: cfg.apiBaseUrl || null,
          });
          return;
        }
        if (message?.type === "PAIR") {
          const apiBaseUrl = String(message.apiBaseUrl || "").replace(/\/$/, "");
          const apiToken = String(message.apiToken || "");
          if (!apiBaseUrl || !apiToken) {
            sendResponse({ ok: false, error: "missing credentials" });
            return;
          }
          await chrome.storage.sync.set({ apiBaseUrl, apiToken });
          sendResponse({ ok: true, paired: true, apiBaseUrl });
          return;
        }
        sendResponse({ ok: false, error: "unknown message" });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : "pair failed" });
      }
    })();
    return true;
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void (async () => {
      try {
        if (message?.type === "GET_SESSION") {
          const tabId = message.tabId ?? sender.tab?.id;
          if (tabId == null) return sendResponse({ error: "no tab" });
          const state = ensureTab(tabId);
          refreshDerived(state);
          sendResponse({ session: enrichSession(state.session), paused: state.paused, deepCapture: state.deepCapture });
          return;
        }
        if (message?.type === "PAGE_SNAPSHOT" && sender.tab?.id != null) {
          const state = ensureTab(sender.tab.id, sender.tab.url);
          if (state.paused) return sendResponse({ ok: true });
          const snap = message.snapshot as Partial<AutopsySession>;
          if (snap.images) state.session.images = snap.images;
          if (snap.scripts) state.session.scripts = snap.scripts;
          if (snap.links) state.session.links = snap.links;
          if (snap.forms) state.session.forms = snap.forms;
          if (snap.seo) state.session.seo = snap.seo;
          if (snap.dom) state.session.dom = snap.dom;
          if (snap.storage) state.session.storage = snap.storage;
          if (snap.runtime) state.session.runtime = snap.runtime;
          if (snap.htmlSnapshot) state.session.htmlSnapshot = snap.htmlSnapshot;
          if (snap.performance) {
            state.session.performance = {
              ...state.session.performance,
              ttfbMs: snap.performance.ttfbMs ?? state.session.performance.ttfbMs,
              domContentLoadedMs:
                snap.performance.domContentLoadedMs ?? state.session.performance.domContentLoadedMs,
              loadEventMs: snap.performance.loadEventMs ?? state.session.performance.loadEventMs,
              fcpMs: snap.performance.fcpMs ?? state.session.performance.fcpMs,
              lcpMs: snap.performance.lcpMs ?? state.session.performance.lcpMs,
              lcpElement: snap.performance.lcpElement ?? state.session.performance.lcpElement,
              cls: snap.performance.cls ?? state.session.performance.cls,
              clsElement: snap.performance.clsElement ?? state.session.performance.clsElement,
              inpMs: snap.performance.inpMs ?? state.session.performance.inpMs,
            };
          }
          state.session.tabId = sender.tab.id;
          if (sender.tab.url) state.session.pageUrl = sender.tab.url;
          if (sender.tab.title) state.session.pageTitle = sender.tab.title;
          refreshDerived(state);
          sendResponse({ ok: true });
          return;
        }
        if (message?.type === "INJECT_EVENT" && sender.tab?.id != null) {
          const state = ensureTab(sender.tab.id);
          if (state.paused) return sendResponse({ ok: true });
          const ev = message.event as {
            kind: string;
            payload: Record<string, unknown>;
          };
          if (ev.kind === "console") {
            state.session.console.push({
              level: (ev.payload.level as "error" | "warn") || "error",
              message: String(ev.payload.message || ""),
              stack: ev.payload.stack ? String(ev.payload.stack) : undefined,
              timestamp: Date.now(),
            });
          } else if (ev.kind === "fetch" || ev.kind === "xhr") {
            const id = `inj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            state.session.requests.push({
              id,
              method: String(ev.payload.method || "GET"),
              url: String(ev.payload.url || ""),
              resourceType: ev.kind === "xhr" ? "xhr" : "fetch",
              status: ev.payload.status as number | undefined,
              durationMs: ev.payload.durationMs as number | undefined,
              requestHeaders: ev.payload.requestHeaders as Record<string, string> | undefined,
              responseHeaders: ev.payload.responseHeaders as Record<string, string> | undefined,
              requestBody: ev.payload.requestBody ? String(ev.payload.requestBody).slice(0, 512_000) : undefined,
              responseBody: ev.payload.responseBody ? String(ev.payload.responseBody).slice(0, 512_000) : undefined,
              timestamp: Date.now(),
              firstParty: isFirstParty(state.session.pageUrl, String(ev.payload.url || "")),
              failed: Boolean(ev.payload.failed),
            });
          } else if (ev.kind === "fingerprint") {
            state.session.fingerprinting.push({
              api: String(ev.payload.api || ""),
              timestamp: Date.now(),
            });
          }
          sendResponse({ ok: true });
          return;
        }
        if (message?.type === "SET_PAUSED") {
          const state = ensureTab(message.tabId);
          state.paused = Boolean(message.paused);
          sendResponse({ ok: true, paused: state.paused });
          return;
        }
        if (message?.type === "CLEAR_SESSION") {
          const tab = await chrome.tabs.get(message.tabId);
          resetTab(message.tabId, tab.url || "about:blank");
          sendResponse({ ok: true });
          return;
        }
        if (message?.type === "CAPTURE_SCREENSHOT") {
          const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
          const state = ensureTab(message.tabId);
          state.session.screenshotDataUrl = dataUrl;
          sendResponse({ dataUrl });
          return;
        }
        if (message?.type === "GET_HTML") {
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            func: () => document.documentElement.outerHTML,
          });
          const state = ensureTab(message.tabId);
          state.session.htmlSnapshot = String(result || "").slice(0, 1_500_000);
          sendResponse({ html: state.session.htmlSnapshot });
          return;
        }
        if (message?.type === "OPEN_SIDE_PANEL") {
          await chrome.sidePanel.open({ tabId: message.tabId });
          sendResponse({ ok: true });
          return;
        }
        if (message?.type === "TOGGLE_DEEP_CAPTURE") {
          const tabId = message.tabId as number;
          const state = ensureTab(tabId);
          if (state.deepCapture) {
            try {
              await chrome.debugger.detach({ tabId });
            } catch {
              /* ignore */
            }
            state.deepCapture = false;
          } else {
            await chrome.debugger.attach({ tabId }, "1.3");
            await chrome.debugger.sendCommand({ tabId }, "Network.enable");
            state.deepCapture = true;
          }
          sendResponse({ deepCapture: state.deepCapture });
          return;
        }
        sendResponse({ error: "unknown" });
      } catch (err) {
        sendResponse({ error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  });
});

function refreshDerived(state: TabState) {
  state.session.performance = buildPerfSnapshot(state.session.requests, {
    ttfbMs: state.session.performance.ttfbMs,
    domContentLoadedMs: state.session.performance.domContentLoadedMs,
    loadEventMs: state.session.performance.loadEventMs,
    lcpMs: state.session.performance.lcpMs,
    fcpMs: state.session.performance.fcpMs,
    cls: state.session.performance.cls,
    inpMs: state.session.performance.inpMs,
    lcpElement: state.session.performance.lcpElement,
    clsElement: state.session.performance.clsElement,
    inpElement: state.session.performance.inpElement,
  });
  state.session.trackers = detectTrackers(state.session.requests.map((r) => r.url));
  state.session.stack = detectStack({
    headers: state.session.security.headers,
    scriptSrcs: state.session.scripts.map((s) => s.src || "").filter(Boolean),
  });
}

async function fetchWellKnown(tabId: number, pageUrl: string) {
  const state = tabs.get(tabId);
  if (!state) return;
  let origin = "";
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return;
  }
  const paths = [
    ["/robots.txt", "robotsTxt"],
    ["/sitemap.xml", "sitemapXml"],
    ["/.well-known/security.txt", "securityTxt"],
    ["/manifest.json", "manifest"],
    ["/ads.txt", "adsTxt"],
  ] as const;
  for (const [path, key] of paths) {
    try {
      const res = await fetch(`${origin}${path}`);
      const preview = (await res.text()).slice(0, 500);
      state.session.wellKnown[key] = {
        status: res.status,
        preview: key === "robotsTxt" || key === "securityTxt" ? preview : undefined,
        name: key === "manifest" && res.ok ? JSON.parse(preview).name : undefined,
      };
    } catch {
      state.session.wellKnown[key] = { status: 0 };
    }
  }
}

async function fetchCookies(tabId: number, pageUrl: string) {
  const state = tabs.get(tabId);
  if (!state) return;
  try {
    const url = new URL(pageUrl);
    const list = await chrome.cookies.getAll({ url: pageUrl });
    state.session.cookies = list.map((c) => ({
      name: c.name,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      firstParty: c.domain.replace(/^\./, "") === url.hostname || url.hostname.endsWith(c.domain.replace(/^\./, "")),
    }));
  } catch {
    /* ignore */
  }
}
