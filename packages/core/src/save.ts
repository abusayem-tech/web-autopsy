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

const MAX_BODY = 512 * 1024;
const MAX_HTML = 1.5 * 1024 * 1024;
const MAX_PAYLOAD_HINT = 4 * 1024 * 1024;

function truncate(s: string | undefined, max: number): string | undefined {
  if (!s) return s;
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated]`;
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
    htmlSnapshot: truncate(session.htmlSnapshot, MAX_HTML),
  };
}

export function enrichSession(session: AutopsySession): AutopsySession {
  const portableApis = classifyPortableApis(session.requests);
  const apiCatalog = buildApiCatalog(session.requests);
  const withPortable = { ...session, portableApis, apiCatalog };
  const findings = analyzeFindings(withPortable);
  const advice = [...findingsToAdvice(findings), ...healthyCards(withPortable)];
  return { ...withPortable, findings, advice };
}

export function buildSummary(session: AutopsySession): AutopsySummary {
  const health = computeHealth(session.advice);
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
    storyLine: `${formatBytes(session.performance.totalTransferBytes)} · ${session.performance.requestCount} requests`,
    stackChips: session.stack.map((s) => s.name).slice(0, 6),
  };
}

export function buildSavePayload(
  session: AutopsySession,
  options: { title?: string; includeSecrets?: boolean; includeBodies?: boolean } = {},
): SavePayload {
  const includeSecrets = options.includeSecrets ?? false;
  let enriched = enrichSession(session);
  if (!options.includeBodies) {
    enriched = {
      ...enriched,
      requests: enriched.requests.map((r) => ({
        ...r,
        requestBody: undefined,
        responseBody: undefined,
      })),
    };
  }
  enriched = redactSession(enriched, includeSecrets);
  const summary = buildSummary(enriched);
  const brief = buildBrief(enriched, enriched.advice);

  const payload: SavePayload = {
    title: options.title || enriched.pageTitle || enriched.seo.title || enriched.pageUrl,
    pageUrl: enriched.pageUrl,
    origin: (() => {
      try {
        return new URL(enriched.pageUrl).origin;
      } catch {
        return enriched.pageUrl;
      }
    })(),
    summary,
    payload: enriched,
    htmlSnapshot: enriched.htmlSnapshot,
    screenshotBase64: enriched.screenshotDataUrl?.replace(/^data:image\/\w+;base64,/, ""),
    includesSecrets: includeSecrets,
    findings: enriched.findings,
    portableApis: enriched.portableApis,
    advice: enriched.advice,
    brief,
  };

  const size = JSON.stringify(payload).length;
  if (size > MAX_PAYLOAD_HINT) {
    payload.payload = {
      ...payload.payload,
      requests: payload.payload.requests.slice(-500),
      console: payload.payload.console.slice(-100),
      htmlSnapshot: truncate(payload.payload.htmlSnapshot, 500_000),
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
