import type { TrackerEntry } from "./types.js";

const KNOWN: Array<{ match: string; name: string; type: TrackerEntry["type"] }> = [
  { match: "google-analytics.com", name: "Google Analytics", type: "analytics" },
  { match: "googletagmanager.com", name: "Google Tag Manager", type: "analytics" },
  { match: "facebook.net", name: "Meta Pixel", type: "ads" },
  { match: "connect.facebook.net", name: "Meta Pixel", type: "ads" },
  { match: "doubleclick.net", name: "Google Ads", type: "ads" },
  { match: "hotjar.com", name: "Hotjar", type: "analytics" },
  { match: "segment.io", name: "Segment", type: "analytics" },
  { match: "segment.com", name: "Segment", type: "analytics" },
  { match: "mixpanel.com", name: "Mixpanel", type: "analytics" },
  { match: "amplitude.com", name: "Amplitude", type: "analytics" },
  { match: "tiktok.com", name: "TikTok", type: "ads" },
  { match: "linkedin.com", name: "LinkedIn Insight", type: "ads" },
  { match: "twitter.com", name: "X Pixel", type: "social" },
  { match: "sentry.io", name: "Sentry", type: "other" },
  { match: "clarity.ms", name: "Microsoft Clarity", type: "analytics" },
];

export function detectTrackers(urls: string[]): TrackerEntry[] {
  const found = new Map<string, TrackerEntry>();
  for (const url of urls) {
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    for (const k of KNOWN) {
      if (host.includes(k.match)) {
        found.set(k.name, { domain: host, name: k.name, type: k.type });
      }
    }
  }
  return [...found.values()];
}

export function detectStack(signals: {
  globals?: string[];
  headers?: Record<string, string>;
  scriptSrcs?: string[];
}): import("./types.js").TechSignal[] {
  const out: import("./types.js").TechSignal[] = [];
  const globals = signals.globals ?? [];
  const headers = signals.headers ?? {};
  const scripts = signals.scriptSrcs ?? [];

  if (globals.includes("__NEXT_DATA__") || scripts.some((s) => s.includes("/_next/"))) {
    out.push({ name: "Next.js", category: "framework", evidence: "__NEXT_DATA__ or /_next/" });
  }
  if (globals.includes("React") || globals.includes("__REACT_DEVTOOLS_GLOBAL_HOOK__")) {
    out.push({ name: "React", category: "library", evidence: "React global" });
  }
  if (globals.includes("Vue") || globals.includes("__VUE__")) {
    out.push({ name: "Vue", category: "framework", evidence: "Vue global" });
  }
  if (globals.includes("angular") || globals.includes("ng")) {
    out.push({ name: "Angular", category: "framework", evidence: "Angular global" });
  }
  if (headers["x-powered-by"]) {
    out.push({
      name: headers["x-powered-by"],
      category: "server",
      evidence: "x-powered-by",
    });
  }
  if (headers.server) {
    out.push({ name: headers.server, category: "server", evidence: "server header" });
  }
  if (scripts.some((s) => s.includes("cdn.jsdelivr.net") || s.includes("unpkg.com"))) {
    out.push({ name: "CDN scripts", category: "cdn", evidence: "jsDelivr/unpkg" });
  }
  return out;
}
