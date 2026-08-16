import type { AutopsySession, AutopsySummary, SavePayload } from "./types.js";
import { buildApiCatalog, classifyPortableApis } from "./portable-api.js";
import {
  analyzeFindings,
  buildBrief,
  computeHealth,
  findingsToAdvice,
  healthyCards,
} from "./findings.js";
import { formatBytes } from "./labels.js";

const MAX_BODY = 64 * 1024;
/** HTML kept for cloud save — Vercel request body hard limit is 4.5 MB. */
const MAX_HTML_CLOUD = 250 * 1024;
/** Soft ceiling per chunk (no screenshots / binary images). */
const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;

function truncate(s: string | undefined, max: number): string | undefined {
  if (!s) return s;
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated]`;
}

function isHttpUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Normalize URL for upsert / listing (strip hash, trailing slash, lowercase host). */
export function normalizePageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return url.trim();
  }
}

function slimHeaders(h?: Record<string, string>): Record<string, string> | undefined {
  if (!h) return undefined;
  const keep = new Set([
    "content-type",
    "accept",
    "x-requested-with",
    "authorization",
    "x-api-key",
    "api-key",
  ]);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (keep.has(k.toLowerCase())) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export function redactSession(session: AutopsySession, includeSecrets: boolean): AutopsySession {
  if (includeSecrets) return session;
  const redactHeaders = (h?: Record<string, string>) => {
    if (!h) return h;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
      const lower = k.toLowerCase();
      if (
        ["authorization", "cookie", "x-api-key", "api-key", "x-auth-token", "x-access-token"].includes(
          lower,
        )
      ) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  return {
    ...session,
    requests: session.requests.map((r) => ({
      ...r,
      requestHeaders: redactHeaders(r.requestHeaders),
      responseHeaders: r.responseHeaders,
      requestBody: truncate(r.requestBody, MAX_BODY),
      responseBody: truncate(r.responseBody, MAX_BODY),
    })),
    portableApis: session.portableApis.map((a) => ({
      ...a,
      headers: redactHeaders(a.headers),
      body: truncate(a.body, MAX_BODY),
    })),
    storage: {
      local: Object.fromEntries(
        Object.entries(session.storage.local).map(([k, v]) => [
          k,
          /token|secret|password|auth/i.test(k) ? "[REDACTED]" : v.slice(0, 200),
        ]),
      ),
      session: Object.fromEntries(
        Object.entries(session.storage.session).map(([k, v]) => [
          k,
          /token|secret|password|auth/i.test(k) ? "[REDACTED]" : v.slice(0, 200),
        ]),
      ),
    },
    cookies: session.cookies.map((c) => ({ ...c })),
    htmlSnapshot: truncate(session.htmlSnapshot, MAX_HTML_CLOUD),
  };
}

function attachImageBytes(session: AutopsySession): AutopsySession {
  const byUrl = new Map<string, number>();
  for (const r of session.requests) {
    if (r.transferSize != null && r.transferSize > 0) {
      byUrl.set(r.url, r.transferSize);
    }
  }
  const images = session.images.map((img) => {
    if (img.bytes != null && img.bytes > 0) return img;
    const match = byUrl.get(img.url);
    if (match != null) return { ...img, bytes: match };
    try {
      const bare = img.url.split("?")[0];
      for (const [url, bytes] of byUrl) {
        if (url.split("?")[0] === bare) return { ...img, bytes };
      }
    } catch {
      /* ignore */
    }
    return img;
  });
  return { ...session, images };
}

/** Drop bulky fields that are stored in dedicated columns / child tables. */
function slimSessionForCloud(session: AutopsySession, includeBodies: boolean): AutopsySession {
  return {
    ...session,
    htmlSnapshot: undefined,
    screenshotDataUrl: undefined,
    // Child tables hold these; keep empty arrays so types stay valid.
    findings: [],
    advice: [],
    portableApis: session.portableApis.map((a) => ({
      ...a,
      body: includeBodies ? truncate(a.body, MAX_BODY) : undefined,
      headers: slimHeaders(a.headers),
      redactedCodegen: a.redactedCodegen
        ? {
            curl: truncate(a.redactedCodegen.curl, 4_000) || "",
            fetch: truncate(a.redactedCodegen.fetch, 4_000) || "",
            python: truncate(a.redactedCodegen.python, 4_000) || "",
          }
        : undefined,
    })),
    requests: session.requests.slice(-400).map((r) => ({
      ...r,
      requestHeaders: slimHeaders(r.requestHeaders),
      responseHeaders: slimHeaders(r.responseHeaders),
      requestBody: includeBodies ? truncate(r.requestBody, MAX_BODY) : undefined,
      responseBody: includeBodies ? truncate(r.responseBody, MAX_BODY) : undefined,
    })),
    images: session.images
      .filter((img) => isHttpUrl(img.url))
      .slice(0, 200)
      .map((img) => ({
        url: img.url,
        alt: img.alt?.slice(0, 120),
        width: img.width,
        height: img.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        bytes: img.bytes,
        broken: img.broken,
        lazy: img.lazy,
      })),
    console: session.console.slice(-80).map((c) => ({
      ...c,
      message: c.message.slice(0, 2000),
      stack: c.stack ? c.stack.slice(0, 2000) : undefined,
    })),
    links: session.links.slice(0, 80),
    forms: session.forms.slice(0, 40),
    scripts: session.scripts.slice(0, 150).map((s) => ({
      src: s.src,
      inline: s.inline,
      async: s.async,
      defer: s.defer,
      module: s.module,
      firstParty: s.firstParty,
      hasSri: s.hasSri,
    })),
    storage: {
      local: Object.fromEntries(Object.entries(session.storage.local).slice(0, 40)),
      session: Object.fromEntries(Object.entries(session.storage.session).slice(0, 40)),
    },
  };
}

export function enrichSession(session: AutopsySession): AutopsySession {
  const withImages = attachImageBytes(session);
  const portableApis = classifyPortableApis(withImages.requests);
  const apiCatalog = buildApiCatalog(withImages.requests);
  const withPortable = { ...withImages, portableApis, apiCatalog };
  const findings = analyzeFindings(withPortable);
  const advice = [...findingsToAdvice(findings), ...healthyCards(withPortable)];
  return { ...withPortable, findings, advice };
}

export function buildSummary(session: AutopsySession): AutopsySummary {
  const health = computeHealth(session.advice);
  const pageTitle = session.pageTitle || session.seo.title || undefined;
  const subtitle = session.seo.description?.trim().slice(0, 180) || undefined;
  const origin = (() => {
    try {
      return new URL(session.pageUrl).origin;
    } catch {
      return undefined;
    }
  })();
  const storyLine = [
    formatBytes(session.performance.totalTransferBytes),
    `${session.performance.requestCount} requests`,
    session.advice.filter((a) => a.kind === "danger").length
      ? `${session.advice.filter((a) => a.kind === "danger").length} in danger`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    health,
    pageSizeBytes: session.performance.totalTransferBytes,
    loadTimeMs: session.performance.loadEventMs ?? session.performance.fullyLoadedMs,
    lcpMs: session.performance.lcpMs,
    requestCount: session.performance.requestCount,
    failedCount: session.performance.failedCount,
    dangerCount: session.advice.filter((a) => a.kind === "danger").length,
    improveCount: session.advice.filter((a) => a.kind === "improve").length,
    portableApiCount: session.portableApis.length,
    storyLine,
    pageTitle,
    subtitle,
    pageUrl: normalizePageUrl(session.pageUrl),
    origin,
    stackChips: session.stack.map((s) => s.name).slice(0, 6),
  };
}

export function buildSavePayload(
  session: AutopsySession,
  options: { title?: string; includeSecrets?: boolean; includeBodies?: boolean } = {},
): SavePayload {
  const includeSecrets = options.includeSecrets ?? false;
  const includeBodies = options.includeBodies ?? false;
  let enriched = enrichSession(session);
  if (!includeBodies) {
    enriched = {
      ...enriched,
      requests: enriched.requests.map((r) => ({
        ...r,
        requestBody: undefined,
        responseBody: undefined,
      })),
      portableApis: enriched.portableApis.map((a) => ({
        ...a,
        body: undefined,
      })),
    };
  }
  enriched = redactSession(enriched, includeSecrets);
  const pageUrl = normalizePageUrl(enriched.pageUrl);
  enriched = { ...enriched, pageUrl };

  const summary = buildSummary(enriched);
  const brief = buildBrief(enriched, enriched.advice);

  const title =
    options.title ||
    enriched.pageTitle ||
    enriched.seo.title ||
    summary.pageTitle ||
    pageUrl;

  const htmlSnapshot = truncate(enriched.htmlSnapshot, MAX_HTML_CLOUD);

  // Top-level child arrays for DB inserts; nested session is slim (URLs only — no binaries).
  const findings = enriched.findings;
  const portableApis = enriched.portableApis.map((a) => ({
    ...a,
    body: includeBodies ? a.body : undefined,
    headers: slimHeaders(a.headers),
  }));
  const advice = enriched.advice;

  let payload: SavePayload = {
    title,
    pageUrl,
    origin: (() => {
      try {
        return new URL(pageUrl).origin;
      } catch {
        return pageUrl;
      }
    })(),
    summary,
    payload: slimSessionForCloud(enriched, includeBodies),
    htmlSnapshot,
    includesSecrets: includeSecrets,
    findings,
    portableApis,
    advice,
    brief,
  };

  // Progressive shrink if still oversized.
  const size = JSON.stringify(payload).length;
  if (size > MAX_PAYLOAD_BYTES) {
    payload = {
      ...payload,
      htmlSnapshot: truncate(payload.htmlSnapshot, 100_000),
      payload: {
        ...payload.payload,
        requests: payload.payload.requests.slice(-200),
        images: payload.payload.images.slice(0, 80),
        console: payload.payload.console.slice(-40),
        links: [],
        portableApis: payload.payload.portableApis.slice(0, 40).map((a) => ({
          ...a,
          redactedCodegen: undefined,
          body: undefined,
        })),
      },
      portableApis: payload.portableApis.slice(0, 80).map((a) => ({
        ...a,
        redactedCodegen: a.redactedCodegen
          ? { curl: (a.redactedCodegen.curl || "").slice(0, 1500), fetch: "", python: "" }
          : undefined,
        body: undefined,
      })),
    };
  }

  return payload;
}

export function emptySession(tabId: number, pageUrl: string): AutopsySession {
  return {
    tabId,
    pageUrl,
    startedAt: Date.now(),
    requests: [],
    apiCatalog: [],
    portableApis: [],
    images: [],
    console: [],
    performance: {
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
    cookies: [],
    storage: { local: {}, session: {} },
    scripts: [],
    security: {
      headers: {},
      hasHsts: false,
      hasCsp: false,
      hasXfo: false,
      hasReferrerPolicy: false,
      hasPermissionsPolicy: false,
      mixedContentUrls: [],
    },
    seo: { h1Count: 0, jsonLdCount: 0 },
    links: [],
    forms: [],
    trackers: [],
    fingerprinting: [],
    wellKnown: {},
    dom: { nodeCount: 0, maxDepth: 0, iframeCount: 0, inlineScriptBytes: 0 },
    stack: [],
    runtime: {
      serviceWorkers: [],
      cacheNames: [],
      indexedDbNames: [],
      workerCount: 0,
      sourceMapUrls: [],
    },
    findings: [],
    advice: [],
  };
}
