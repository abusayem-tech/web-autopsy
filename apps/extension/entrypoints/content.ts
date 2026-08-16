const CHANNEL = "__WEB_AUTOPSY__";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  async main() {
    await injectScript("/inject.js", { keepInDom: true });

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== CHANNEL) return;
      void chrome.runtime.sendMessage({
        type: "INJECT_EVENT",
        event: { kind: data.kind, payload: data.payload },
      });
    });

    const sendSnapshot = () => {
      const snapshot = collectSnapshot();
      void chrome.runtime.sendMessage({ type: "PAGE_SNAPSHOT", snapshot });
    };

    const hintUrl = () => {
      void chrome.runtime.sendMessage({
        type: "TAB_URL_HINT",
        url: location.href,
        title: document.title,
      });
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
        setTimeout(sendSnapshot, 500);
      });
    }
    setInterval(() => {
      hintUrl();
      sendSnapshot();
    }, 4000);
  },
});

function resourceBytes(url: string): number | undefined {
  if (!url) return undefined;
  try {
    const entries = performance.getEntriesByName(url) as PerformanceResourceTiming[];
    const last = entries[entries.length - 1];
    if (last && last.transferSize > 0) return last.transferSize;
    const bare = url.split("?")[0];
    for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
      if (e.name.split("?")[0] === bare && e.transferSize > 0) return e.transferSize;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function collectSnapshot() {
  const imgs = [...document.querySelectorAll("img")].map((img) => {
    const url = img.currentSrc || img.src;
    return {
      url,
      alt: img.alt,
      width: img.width,
      height: img.height,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      bytes: resourceBytes(url),
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
