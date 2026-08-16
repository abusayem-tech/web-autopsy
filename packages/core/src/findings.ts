import type {
  AdviceCard,
  AutopsySession,
  Finding,
  HealthStatus,
  Severity,
} from "./types.js";
import { formatBytes, formatMs, shortUrl } from "./labels.js";

function fid(
  ruleId: string,
  severity: Severity,
  title: string,
  plainTitle: string,
  area: Finding["area"],
  detail?: Record<string, unknown>,
): Finding {
  return {
    id: `${ruleId}-${Math.random().toString(36).slice(2, 8)}`,
    ruleId,
    severity,
    title,
    plainTitle,
    area,
    detail,
  };
}

export function analyzeFindings(session: AutopsySession): Finding[] {
  const findings: Finding[] = [];
  const { requests, images, console: logs, performance, security, cookies, scripts, seo, dom, runtime, portableApis } =
    session;

  for (const r of requests) {
    if (r.failed || (r.status != null && r.status >= 400)) {
      findings.push(
        fid(
          "failed-request",
          r.status != null && r.status >= 500 ? "critical" : "high",
          `Failed request ${r.method} ${r.url}`,
          `${r.method} ${shortUrl(r.url)} failed${r.status != null ? ` with HTTP ${r.status}` : ""}. That response is likely leaving a blank or broken UI section.`,
          "api",
          { url: r.url, status: r.status, method: r.method },
        ),
      );
    }
    if (
      (r.resourceType === "xhr" || r.resourceType === "fetch") &&
      r.durationMs != null &&
      r.durationMs > 1000
    ) {
      findings.push(
        fid(
          "slow-api",
          "medium",
          `Slow API (${formatMs(r.durationMs)})`,
          `${r.method} ${shortUrl(r.url)} took ${formatMs(r.durationMs)}. Users wait on this call before the page feels ready.`,
          "api",
          { url: r.url, durationMs: r.durationMs, method: r.method },
        ),
      );
    }
  }

  const seen = new Map<string, number>();
  for (const r of requests) {
    if (r.resourceType !== "xhr" && r.resourceType !== "fetch") continue;
    const key = `${r.method} ${r.url}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count >= 3) {
      const space = key.indexOf(" ");
      const method = space > 0 ? key.slice(0, space) : "GET";
      const url = space > 0 ? key.slice(space + 1) : key;
      findings.push(
        fid(
          "duplicate-api",
          "medium",
          `Duplicate API calls: ${key}`,
          `${method} ${shortUrl(url)} ran ${count} times. Deduplicate or cache so the UI does not hammer the same endpoint.`,
          "api",
          { key, count, url, method },
        ),
      );
    }
  }

  for (const api of portableApis) {
    if (api.replayClass === "portable-token") {
      findings.push(
        fid(
          "portable-token",
          "high",
          `Token in frontend request: ${api.humanName}`,
          "Anyone can copy this key from the browser. Move secrets to a server; rotate the key.",
          "security",
          { url: api.url, authType: api.authType },
        ),
      );
    }
  }

  for (const img of images) {
    if (img.broken) {
      findings.push(
        fid(
          "broken-image",
          "high",
          `Broken image: ${img.url}`,
          "Users see a hole where a picture should be. Fix the URL.",
          "images",
          { url: img.url },
        ),
      );
    }
    if (
      img.naturalWidth &&
      img.width &&
      img.naturalWidth > img.width * 2 &&
      img.naturalWidth > 200
    ) {
      findings.push(
        fid(
          "oversized-image",
          "medium",
          `Oversized image displayed smaller than natural size`,
          "A photo is much larger than it needs to be on screen. Compress or resize it.",
          "images",
          { url: img.url, naturalWidth: img.naturalWidth, width: img.width },
        ),
      );
    }
    if (!img.alt || img.alt.trim() === "") {
      findings.push(
        fid(
          "missing-alt",
          "low",
          `Image missing alt text`,
          "Screen readers cannot describe this image. Add a short alt description.",
          "a11y",
          { url: img.url },
        ),
      );
    }
  }

  for (const log of logs) {
    if (log.level === "error") {
      findings.push(
        fid(
          "console-error",
          "high",
          `Console error: ${log.message.slice(0, 120)}`,
          "Something threw an error in the browser. Users may see a dead button or broken feature.",
          "runtime",
          { message: log.message },
        ),
      );
    }
  }

  if (performance.totalTransferBytes > 2 * 1024 * 1024) {
    findings.push(
      fid(
        "heavy-page",
        "medium",
        `Heavy page (${formatBytes(performance.totalTransferBytes)})`,
        `This page is ${formatBytes(performance.totalTransferBytes)}. Compress images or lazy-load assets.`,
        "performance",
        { bytes: performance.totalTransferBytes },
      ),
    );
  }

  if (performance.ttfbMs != null && performance.ttfbMs > 800) {
    findings.push(
      fid(
        "slow-ttfb",
        "medium",
        `Slow server response (TTFB ${formatMs(performance.ttfbMs)})`,
        "The server took too long to start answering. Check backend performance or CDN.",
        "performance",
        { ttfbMs: performance.ttfbMs },
      ),
    );
  }

  if (performance.lcpMs != null && performance.lcpMs > 2500) {
    findings.push(
      fid(
        "poor-lcp",
        performance.lcpMs > 4000 ? "high" : "medium",
        `Poor LCP (${formatMs(performance.lcpMs)})`,
        `Main content took ${formatMs(performance.lcpMs)} to appear${performance.lcpElement ? ` (${performance.lcpElement})` : ""}.`,
        "performance",
        { lcpMs: performance.lcpMs, element: performance.lcpElement },
      ),
    );
  }

  if (performance.cls != null && performance.cls > 0.1) {
    findings.push(
      fid(
        "poor-cls",
        performance.cls > 0.25 ? "high" : "medium",
        `Layout shift (CLS ${performance.cls.toFixed(3)})`,
        "Content jumped while loading. Reserve space for images and banners.",
        "performance",
        { cls: performance.cls, element: performance.clsElement },
      ),
    );
  }

  for (const url of security.mixedContentUrls) {
    findings.push(
      fid(
        "mixed-content",
        "critical",
        `Mixed content: ${url}`,
        "An HTTP asset is loaded on an HTTPS page. Browsers may block it.",
        "security",
        { url },
      ),
    );
  }

  if (session.pageUrl.startsWith("https://")) {
    if (!security.hasHsts) {
      findings.push(
        fid(
          "missing-hsts",
          "medium",
          "Missing HSTS header",
          "Browsers are not forced to stay on HTTPS. Add Strict-Transport-Security.",
          "security",
        ),
      );
    }
    if (!security.hasCsp) {
      findings.push(
        fid(
          "missing-csp",
          "medium",
          "Missing Content-Security-Policy",
          "Without CSP, injected scripts are easier. Add a Content-Security-Policy.",
          "security",
        ),
      );
    }
    for (const c of cookies) {
      if (!c.secure) {
        findings.push(
          fid(
            "insecure-cookie",
            "high",
            `Cookie missing Secure: ${c.name}`,
            "A cookie can travel over HTTP. Mark it Secure on HTTPS sites.",
            "security",
            { name: c.name },
          ),
        );
      }
      if (!c.httpOnly && /session|auth|token|sid/i.test(c.name)) {
        findings.push(
          fid(
            "cookie-no-httponly",
            "medium",
            `Auth-like cookie missing HttpOnly: ${c.name}`,
            "JavaScript can read this cookie. Prefer HttpOnly for session cookies.",
            "security",
            { name: c.name },
          ),
        );
      }
    }
  }

  for (const s of scripts) {
    if (!s.firstParty && s.src && !s.hasSri) {
      findings.push(
        fid(
          "cdn-no-sri",
          "low",
          `Third-party script without SRI`,
          "A CDN script has no integrity check. Add SRI hashes when possible.",
          "security",
          { src: s.src },
        ),
      );
    }
  }

  if (!seo.title) {
    findings.push(
      fid("missing-title", "medium", "Missing document title", "Search engines and tabs need a clear title.", "seo"),
    );
  }
  if (!seo.description) {
    findings.push(
      fid(
        "missing-description",
        "low",
        "Missing meta description",
        "Add a short description for search results.",
        "seo",
      ),
    );
  }
  if (seo.h1Count === 0) {
    findings.push(fid("missing-h1", "low", "No H1 heading", "Pages should have one clear main heading.", "seo"));
  } else if (seo.h1Count > 1) {
    findings.push(
      fid("multiple-h1", "low", `Multiple H1 headings (${seo.h1Count})`, "Prefer a single H1 for clarity.", "seo"),
    );
  }

  if (dom.nodeCount > 1500) {
    findings.push(
      fid(
        "dom-bloat",
        "medium",
        `Large DOM (${dom.nodeCount} nodes)`,
        "A huge DOM can slow interaction. Simplify the page structure.",
        "performance",
        { nodeCount: dom.nodeCount },
      ),
    );
  }

  for (const sm of runtime.sourceMapUrls) {
    findings.push(
      fid(
        "sourcemap-prod",
        "medium",
        `Source map on page: ${sm}`,
        "Original source may be public. Stop shipping maps on production.",
        "runtime",
        { url: sm },
      ),
    );
  }

  if (session.trackers.length > 8) {
    findings.push(
      fid(
        "heavy-trackers",
        "medium",
        `Many trackers (${session.trackers.length})`,
        "Lots of tracking scripts slow the page and raise privacy concerns.",
        "privacy",
        { count: session.trackers.length },
      ),
    );
  }

  return findings;
}

export function findingsToAdvice(findings: Finding[]): AdviceCard[] {
  return findings.map((f) => {
    let kind: AdviceCard["kind"] = "improve";
    if (f.severity === "critical" || f.severity === "high") kind = "danger";
    if (f.ruleId === "portable-token" && f.severity === "info") kind = "improve";

    const detailUrl = typeof f.detail?.url === "string" ? shortUrl(f.detail.url) : undefined;
    const detailStatus = f.detail?.status != null ? String(f.detail.status) : undefined;
    const detailMs = typeof f.detail?.durationMs === "number" ? formatMs(f.detail.durationMs) : undefined;

    const suggestion =
      f.ruleId === "portable-token"
        ? `Move secrets off the browser for ${detailUrl || "this request"}; rotate any exposed keys.`
        : f.ruleId === "broken-image"
          ? `Fix or remove the broken image${detailUrl ? ` at ${detailUrl}` : ""}.`
          : f.ruleId === "failed-request"
            ? `Debug ${detailUrl || "this endpoint"}${detailStatus ? ` (HTTP ${detailStatus})` : ""} or show a friendly fallback.`
            : f.ruleId === "slow-api"
              ? `Speed up ${detailUrl || "this API"}${detailMs ? ` (currently ${detailMs})` : ""} — cache, paginate, or move work server-side.`
              : f.ruleId === "duplicate-api"
                ? `Deduplicate calls to ${typeof f.detail?.key === "string" ? shortUrl(String(f.detail.key).replace(/^\w+\s+/, "")) : "this endpoint"} (seen ${String(f.detail?.count ?? "many")} times).`
                : f.ruleId === "poor-lcp"
                  ? "Compress the hero image and preload critical assets."
                  : f.ruleId === "missing-csp"
                    ? "Add a Content-Security-Policy header."
                    : f.plainTitle.includes("Compress")
                      ? f.plainTitle
                      : "Review this finding and ship a fix in the next pass.";

    return {
      id: `advice-${f.id}`,
      kind,
      area: f.area,
      severity: f.severity,
      title: f.plainTitle,
      whyItMatters: f.title,
      suggestion,
      relatedFindingId: f.id,
    };
  });
}

export function healthyCards(session: AutopsySession): AdviceCard[] {
  const cards: AdviceCard[] = [];
  const okApis = session.requests.filter(
    (r) =>
      (r.resourceType === "xhr" || r.resourceType === "fetch") &&
      r.status != null &&
      r.status >= 200 &&
      r.status < 300 &&
      (r.durationMs == null || r.durationMs < 500),
  );
  if (okApis.length > 0) {
    cards.push({
      id: "healthy-apis",
      kind: "healthy",
      area: "api",
      severity: "info",
      title: "Core APIs responded quickly",
      whyItMatters: `${okApis.length} API calls succeeded under half a second.`,
      suggestion: "Keep these endpoints stable — no change needed.",
    });
  }
  if (session.pageUrl.startsWith("https://")) {
    cards.push({
      id: "healthy-https",
      kind: "healthy",
      area: "security",
      severity: "info",
      title: "Page is served over HTTPS",
      whyItMatters: "Traffic between the browser and server is encrypted.",
      suggestion: "Keep HTTPS enabled everywhere.",
    });
  }
  if (session.performance.lcpMs != null && session.performance.lcpMs <= 2500) {
    cards.push({
      id: "healthy-lcp",
      kind: "healthy",
      area: "performance",
      severity: "info",
      title: "Main content appeared promptly",
      whyItMatters: `LCP was ${formatMs(session.performance.lcpMs)}.`,
      suggestion: "Protect this win when adding new assets.",
    });
  }
  return cards;
}

export function computeHealth(advice: AdviceCard[]): HealthStatus {
  if (advice.some((a) => a.kind === "danger" && (a.severity === "critical" || a.severity === "high"))) {
    return "broken";
  }
  if (advice.some((a) => a.kind === "danger" || a.kind === "improve")) {
    return "shaky";
  }
  return "healthy";
}

export function buildBrief(session: AutopsySession, advice: AdviceCard[]): import("./types.js").Brief {
  const danger = advice.filter((a) => a.kind === "danger");
  const improve = advice.filter((a) => a.kind === "improve");
  const healthy = advice.filter((a) => a.kind === "healthy");
  const title = session.pageTitle || session.seo.title || session.pageUrl;
  const health = computeHealth(advice);

  const story =
    health === "broken"
      ? `${title} has serious issues right now — failed calls or security problems that can break the experience.`
      : health === "shaky"
        ? `${title} mostly works, but there are clear improvements for speed, accessibility, or hygiene.`
        : `${title} looks healthy in this capture: core requests succeeded and nothing critical stood out.`;

  return {
    story,
    health,
    apiCards: session.portableApis.slice(0, 20).map((a) => ({
      name: a.humanName,
      purpose: a.purpose,
      status:
        a.status == null
          ? "unknown"
          : a.status >= 200 && a.status < 300
            ? "working"
            : "failing",
      audience: a.replayClass,
    })),
    dangerCards: danger,
    improveCards: improve,
    healthyCards: healthy,
    model: "heuristic",
    generatedAt: new Date().toISOString(),
  };
}
