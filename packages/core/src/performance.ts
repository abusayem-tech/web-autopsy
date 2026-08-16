import type { NetworkEntry, PerfSnapshot, ResourceType } from "./types.js";

function emptyByType(): PerfSnapshot["byType"] {
  return {
    document: { count: 0, bytes: 0 },
    script: { count: 0, bytes: 0 },
    stylesheet: { count: 0, bytes: 0 },
    image: { count: 0, bytes: 0 },
    font: { count: 0, bytes: 0 },
    xhr: { count: 0, bytes: 0 },
    fetch: { count: 0, bytes: 0 },
    media: { count: 0, bytes: 0 },
    websocket: { count: 0, bytes: 0 },
    other: { count: 0, bytes: 0 },
  };
}

export function buildPerfSnapshot(
  requests: NetworkEntry[],
  nav?: {
    ttfbMs?: number;
    domContentLoadedMs?: number;
    loadEventMs?: number;
    lcpMs?: number;
    fcpMs?: number;
    cls?: number;
    inpMs?: number;
    lcpElement?: string;
    clsElement?: string;
    inpElement?: string;
  },
): PerfSnapshot {
  const byType = emptyByType();
  let totalTransferBytes = 0;
  let totalDecodedBytes = 0;
  let failedCount = 0;
  let firstPartyBytes = 0;
  let thirdPartyBytes = 0;
  let firstPartyRequests = 0;
  let thirdPartyRequests = 0;
  let fullyLoadedMs = 0;

  for (const r of requests) {
    const bytes = r.transferSize ?? 0;
    const decoded = r.decodedSize ?? bytes;
    totalTransferBytes += bytes;
    totalDecodedBytes += decoded;
    const type: ResourceType = r.resourceType || "other";
    byType[type] ??= { count: 0, bytes: 0 };
    byType[type].count += 1;
    byType[type].bytes += bytes;
    if (r.failed || (r.status != null && r.status >= 400)) failedCount += 1;
    if (r.firstParty) {
      firstPartyBytes += bytes;
      firstPartyRequests += 1;
    } else {
      thirdPartyBytes += bytes;
      thirdPartyRequests += 1;
    }
    if (r.durationMs != null && r.timestamp) {
      fullyLoadedMs = Math.max(fullyLoadedMs, r.durationMs);
    }
  }

  const apis = requests.filter((r) => r.resourceType === "xhr" || r.resourceType === "fetch");
  const slowestApis = [...apis]
    .filter((r) => r.durationMs != null)
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, 5)
    .map((r) => ({ url: r.url, durationMs: r.durationMs ?? 0, status: r.status }));

  const largestResources = [...requests]
    .filter((r) => (r.transferSize ?? 0) > 0)
    .sort((a, b) => (b.transferSize ?? 0) - (a.transferSize ?? 0))
    .slice(0, 5)
    .map((r) => ({ url: r.url, bytes: r.transferSize ?? 0, type: r.resourceType }));

  return {
    totalTransferBytes,
    totalDecodedBytes,
    requestCount: requests.length,
    failedCount,
    byType,
    firstPartyBytes,
    thirdPartyBytes,
    firstPartyRequests,
    thirdPartyRequests,
    ttfbMs: nav?.ttfbMs,
    domContentLoadedMs: nav?.domContentLoadedMs,
    loadEventMs: nav?.loadEventMs,
    fullyLoadedMs: nav?.loadEventMs ?? fullyLoadedMs,
    lcpMs: nav?.lcpMs,
    fcpMs: nav?.fcpMs,
    cls: nav?.cls,
    inpMs: nav?.inpMs,
    lcpElement: nav?.lcpElement,
    clsElement: nav?.clsElement,
    inpElement: nav?.inpElement,
    slowestApis,
    largestResources,
  };
}
