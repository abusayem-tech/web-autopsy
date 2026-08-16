const CHANNEL = "__WEB_AUTOPSY__";

/** True while this content-script instance can still talk to the extension. */
function extensionAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function isContextInvalidated(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /extension context invalidated|context invalidated/i.test(msg);
}

/**
 * Send a message to the background, or stop quietly if the extension was
 * reloaded/updated (old content scripts stay alive until the tab refreshes).
 */
function safeSend(message: unknown, onDead?: () => void): void {
  if (!extensionAlive()) {
    onDead?.();
    return;
  }
  try {
    const maybePromise = chrome.runtime.sendMessage(message) as Promise<unknown> | undefined;
    void Promise.resolve(maybePromise).catch((err: unknown) => {
      if (isContextInvalidated(err)) onDead?.();
    });
  } catch (err) {
    if (isContextInvalidated(err)) onDead?.();
  }
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  async main() {
    let dead = false;
    let snapshotTimer: ReturnType<typeof setInterval> | null = null;
    let loadTimer: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
      if (dead) return;
      dead = true;
      if (snapshotTimer != null) clearInterval(snapshotTimer);
      if (loadTimer != null) clearTimeout(loadTimer);
      snapshotTimer = null;
      loadTimer = null;
    };

    await injectScript("/inject.js", { keepInDom: true });

    window.addEventListener("message", (event) => {
      if (dead || event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== CHANNEL) return;
      safeSend(
        {
          type: "INJECT_EVENT",
          event: { kind: data.kind, payload: data.payload },
        },
        stop,
      );
    });

    const sendSnapshot = () => {
      if (dead) return;
      const snapshot = collectSnapshot();
      safeSend({ type: "PAGE_SNAPSHOT", snapshot }, stop);
    };

    const hintUrl = () => {
      if (dead) return;
      safeSend(
        {
          type: "TAB_URL_HINT",
          url: location.href,
          title: document.title,
        },
        stop,
      );
    };

    // Detect SPA / history navigations without a full document reload.
    const wrapHistory = (method: "pushState" | "replaceState") => {
      const original = history[method].bind(history);
      history[method] = (...args: Parameters<History["pushState"]>) => {
        const result = original(...args);
        hintUrl();
        return result;
      };
    };
    wrapHistory("pushState");
    wrapHistory("replaceState");
    window.addEventListener("popstate", hintUrl);
    window.addEventListener("hashchange", hintUrl);

    if (document.readyState === "complete") {
      hintUrl();
      sendSnapshot();
    } else {
      window.addEventListener("load", () => {
        hintUrl();
        loadTimer = setTimeout(sendSnapshot, 500);
      });
    }
    snapshotTimer = setInterval(() => {
      if (!extensionAlive()) {
        stop();
        return;
      }
      hintUrl();
      sendSnapshot();
    }, 4000);
  },
});

function resourceBytes(url: string): number | undefined {
  if (!url || url.startsWith("data:")) return undefined;
  try {
    const pick = (e: PerformanceResourceTiming): number | undefined => {
      const n = e.transferSize || e.encodedBodySize || e.decodedBodySize;
      return n > 0 ? n : undefined;
    };

    const byName = performance.getEntriesByName(url) as PerformanceResourceTiming[];
    for (let i = byName.length - 1; i >= 0; i--) {
      const n = pick(byName[i]!);
      if (n != null) return n;
    }

    let abs = url;
    try {
      abs = new URL(url, location.href).href;
    } catch {
      /* ignore */
    }
    if (abs !== url) {
      const byAbs = performance.getEntriesByName(abs) as PerformanceResourceTiming[];
      for (let i = byAbs.length - 1; i >= 0; i--) {
        const n = pick(byAbs[i]!);
        if (n != null) return n;
      }
    }

    const keyPath = (() => {
      try {
        const u = new URL(abs);
        return `${u.hostname}${u.pathname}`.toLowerCase();
      } catch {
        return abs.split("?")[0].toLowerCase();
      }
    })();

    for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
      try {
        const u = new URL(e.name);
        const k = `${u.hostname}${u.pathname}`.toLowerCase();
        if (k === keyPath) {
          const n = pick(e);
          if (n != null) return n;
        }
      } catch {
        if (e.name.split("?")[0].toLowerCase() === keyPath) {
          const n = pick(e);
          if (n != null) return n;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function collectSnapshot() {
  const imgs = [...document.querySelectorAll("img")].map((img) => {
    const raw = img.currentSrc || img.src;
    let url = raw;
    try {
      url = new URL(raw, location.href).href;
    } catch {
      /* keep raw */
    }
    return {
      url,
      alt: img.alt,
      width: img.width,
      height: img.height,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      bytes: resourceBytes(url) ?? resourceBytes(raw),
      broken: !img.complete || img.naturalWidth === 0,
      lazy: img.loading === "lazy",
    };
  });

  const scripts = [...document.querySelectorAll("script")].map((s) => ({
    src: s.src || undefined,
    inline: !s.src,
    async: s.async,
    defer: s.defer,
    module: s.type === "module",
    firstParty: !s.src || (() => {
      try {
        return new URL(s.src).hostname === location.hostname;
      } catch {
        return true;
      }
    })(),
    hasSri: Boolean(s.integrity),
  }));

  const links = [...document.querySelectorAll("a[href]")].slice(0, 200).map((a) => {
    const el = a as HTMLAnchorElement;
    let external = false;
    try {
      external = new URL(el.href, location.href).hostname !== location.hostname;
    } catch {
      /* ignore */
    }
    return {
      href: el.href,
      text: (el.textContent || "").trim().slice(0, 80),
      external,
      nofollow: (el.rel || "").includes("nofollow"),
    };
  });

  const forms = [...document.querySelectorAll("form")].map((f) => {
    const fields = [...f.querySelectorAll("input,select,textarea")];
    const missingLabels = fields.filter((field) => {
      const id = field.id;
      if (!id) return true;
      return !document.querySelector(`label[for="${CSS.escape(id)}"]`);
    }).length;
    const action = f.getAttribute("action") || undefined;
    return {
      action,
      method: (f.method || "get").toUpperCase(),
      insecureAction: Boolean(action?.startsWith("http:")),
      fieldCount: fields.length,
      missingLabels,
    };
  });

  let maxDepth = 0;
  const walk = (node: Element, depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(document.documentElement, 0);

  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const paint = performance.getEntriesByType("paint");
  const fcp = paint.find((p) => p.name === "first-contentful-paint")?.startTime;

  let lcpMs: number | undefined;
  let lcpElement: string | undefined;
  let cls = 0;
  let clsElement: string | undefined;
  try {
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint") as PerformanceEntry[];
    const last = lcpEntries[lcpEntries.length - 1] as PerformanceEntry & {
      element?: Element;
      startTime: number;
    };
    if (last) {
      lcpMs = last.startTime;
      lcpElement = last.element ? describeEl(last.element) : undefined;
    }
  } catch {
    /* ignore */
  }

  const meta = (name: string) =>
    document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ||
    document.querySelector(`meta[property="${name}"]`)?.getAttribute("content") ||
    undefined;

  const local: Record<string, string> = {};
  const session: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) local[k] = String(localStorage.getItem(k)).slice(0, 500);
    }
  } catch {
    /* ignore */
  }
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k) session[k] = String(sessionStorage.getItem(k)).slice(0, 500);
    }
  } catch {
    /* ignore */
  }

  const sourceMapUrls: string[] = [];
  for (const s of scripts) {
    if (s.src?.includes(".map")) sourceMapUrls.push(s.src);
  }

  return {
    images: imgs.filter((i) => i.url && /^https?:/i.test(i.url)),
    scripts,
    links,
    forms,
    seo: {
      title: document.title,
      description: meta("description"),
      canonical: (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href,
      ogTitle: meta("og:title"),
      ogImage: meta("og:image"),
      h1Count: document.querySelectorAll("h1").length,
      jsonLdCount: document.querySelectorAll('script[type="application/ld+json"]').length,
    },
    dom: {
      nodeCount: document.getElementsByTagName("*").length,
      maxDepth,
      iframeCount: document.querySelectorAll("iframe").length,
      inlineScriptBytes: scripts.filter((s) => s.inline).length * 500,
    },
    storage: { local, session },
    performance: {
      ttfbMs: nav?.responseStart,
      domContentLoadedMs: nav?.domContentLoadedEventEnd,
      loadEventMs: nav?.loadEventEnd,
      fcpMs: fcp,
      lcpMs,
      lcpElement,
      cls,
      clsElement,
      inpMs: undefined,
      totalTransferBytes: 0,
      totalDecodedBytes: 0,
      requestCount: 0,
      failedCount: 0,
      byType: {},
      firstPartyBytes: 0,
      thirdPartyBytes: 0,
      firstPartyRequests: 0,
      thirdPartyRequests: 0,
      slowestApis: [],
      largestResources: [],
    },
    runtime: {
      serviceWorkers: [],
      cacheNames: [],
      indexedDbNames: [],
      workerCount: 0,
      sourceMapUrls,
    },
    htmlSnapshot: document.documentElement.outerHTML.slice(0, 1_500_000),
  };
}

function describeEl(el: Element): string {
  const id = el.id ? `#${el.id}` : "";
  const cls = el.classList?.[0] ? `.${el.classList[0]}` : "";
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}
