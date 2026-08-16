import type { NetworkEntry, PortableApi, ReplayClass } from "./types.js";
import { humanApiName, humanApiPurpose } from "./labels.js";
import { generateCodegen } from "./codegen.js";

const TOKEN_HEADERS = [
  "authorization",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-access-token",
  "x-client-id",
  "x-client-secret",
];

const TOKEN_QUERY_KEYS = [
  "api_key",
  "apikey",
  "access_token",
  "token",
  "key",
  "client_secret",
  "client_id",
];

const CSRF_HEADERS = ["x-csrf-token", "x-xsrf-token", "x-csrf", "csrf-token"];

const CHALLENGE_COOKIE_HINTS = ["cf_clearance", "__cf_bm", "_abck", "ak_bmsc"];

const TRACKER_HOST_HINTS = [
  "google-analytics.com",
  "googletagmanager.com",
  "googleadservices.com",
  "googlesyndication.com",
  "google.com/pagead",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "gstatic.com",
  "googleapis.com",
  "facebook.net",
  "facebook.com",
  "doubleclick.net",
  "hotjar.com",
  "segment.io",
  "segment.com",
  "mixpanel.com",
  "amplitude.com",
  "sentry.io",
  "clarity.ms",
  "bing.com",
  "microsoft.com",
  "msn.com",
  "linkedin.com",
  "licdn.com",
  "twitter.com",
  "twimg.com",
  "t.co",
  "tiktok.com",
  "ads-twitter.com",
  "newrelic.com",
  "nr-data.net",
  "datadoghq.com",
  "fullstory.com",
  "heap-api.com",
  "intercom.io",
  "intercomcdn.com",
  "hubspot.com",
  "hs-analytics.net",
  "hs-scripts.com",
  "cloudflareinsights.com",
];

function headerMap(headers?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function hasCookie(headers: Record<string, string>): boolean {
  return Boolean(headers.cookie);
}

function hasTokenAuth(headers: Record<string, string>, url: string, body?: string): {
  present: boolean;
  authType?: string;
} {
  for (const h of TOKEN_HEADERS) {
    if (headers[h]) {
      if (h === "authorization") {
        const scheme = headers[h].split(/\s+/)[0] ?? "Authorization";
        return { present: true, authType: scheme };
      }
      return { present: true, authType: h };
    }
  }
  try {
    const u = new URL(url);
    for (const key of TOKEN_QUERY_KEYS) {
      if (u.searchParams.has(key)) {
        return { present: true, authType: `query:${key}` };
      }
    }
  } catch {
    /* ignore */
  }
  if (body) {
    const lower = body.toLowerCase();
    for (const key of TOKEN_QUERY_KEYS) {
      if (lower.includes(`"${key}"`) || lower.includes(`${key}=`)) {
        return { present: true, authType: `body:${key}` };
      }
    }
  }
  return { present: false };
}

function isBrowserBound(headers: Record<string, string>, cookieHeader?: string): boolean {
  for (const h of CSRF_HEADERS) {
    if (headers[h]) return true;
  }
  if (headers.dpop) return true;
  const cookie = cookieHeader ?? headers.cookie ?? "";
  return CHALLENGE_COOKIE_HINTS.some((hint) => cookie.includes(hint));
}

function isApiLike(entry: NetworkEntry): boolean {
  if (entry.resourceType === "xhr" || entry.resourceType === "fetch") return true;
  const url = entry.url.toLowerCase();
  if (url.includes("/graphql") || url.includes("/api/") || url.includes("/v1/") || url.includes("/v2/")) {
    return true;
  }
  return false;
}

export function isTrackerUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return TRACKER_HOST_HINTS.some((h) => host.includes(h));
  } catch {
    return false;
  }
}

/** @deprecated use isTrackerUrl */
function isTrackerish(url: string): boolean {
  return isTrackerUrl(url);
}

export function classifyReplay(entry: NetworkEntry): ReplayClass {
  const headers = headerMap(entry.requestHeaders);
  if (isBrowserBound(headers)) return "browser-bound";
  const token = hasTokenAuth(headers, entry.url, entry.requestBody);
  if (token.present) return "portable-token";
  if (hasCookie(headers)) return "session-cookie";
  return "portable-public";
}

export function classifyPortableApis(
  requests: NetworkEntry[],
  options?: { includeSessionCookie?: boolean },
): PortableApi[] {
  const includeSession = options?.includeSessionCookie ?? false;
  const out: PortableApi[] = [];

  for (const entry of requests) {
    if (!isApiLike(entry)) continue;
    if (isTrackerish(entry.url)) continue;
    if (entry.resourceType === "image" || entry.resourceType === "stylesheet" || entry.resourceType === "font") {
      continue;
    }

    const replayClass = classifyReplay(entry);
    if (replayClass === "browser-bound") continue;
    if (replayClass === "session-cookie" && !includeSession) continue;

    const headers = headerMap(entry.requestHeaders);
    const token = hasTokenAuth(headers, entry.url, entry.requestBody);
    const humanName = humanApiName(entry.method, entry.url, entry.requestBody);
    const purpose = humanApiPurpose(entry.method, entry.url, entry.requestBody);

    out.push({
      id: entry.id,
      method: entry.method,
      url: entry.url,
      replayClass,
      authType: token.authType,
      humanName,
      purpose,
      status: entry.status,
      durationMs: entry.durationMs,
      headers: entry.requestHeaders,
      body: entry.requestBody,
      redactedCodegen: generateCodegen(entry, true),
    });
  }

  return out;
}

export function buildApiCatalog(requests: NetworkEntry[]): import("./types.js").ApiEndpoint[] {
  const map = new Map<string, import("./types.js").ApiEndpoint>();
  for (const entry of requests) {
    if (!isApiLike(entry)) continue;
    let origin = "";
    let path = entry.url;
    try {
      const u = new URL(entry.url);
      origin = u.origin;
      path = u.pathname;
    } catch {
      /* ignore */
    }
    const key = `${entry.method} ${origin}${path}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (entry.status != null) existing.statuses.push(entry.status);
      if (entry.durationMs != null) {
        const prev = existing.avgDurationMs ?? 0;
        existing.avgDurationMs = (prev * (existing.count - 1) + entry.durationMs) / existing.count;
      }
    } else {
      map.set(key, {
        key,
        method: entry.method,
        origin,
        path,
        count: 1,
        statuses: entry.status != null ? [entry.status] : [],
        avgDurationMs: entry.durationMs,
        humanName: humanApiName(entry.method, entry.url, entry.requestBody),
        purpose: humanApiPurpose(entry.method, entry.url, entry.requestBody),
        replayClass: classifyReplay(entry),
      });
    }
  }
  return [...map.values()];
}
