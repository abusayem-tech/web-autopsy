"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HealthPill } from "@/components/health-pill";
import { formatBytes, formatMs } from "@/lib/utils";

export function OriginClient({ origin }: { origin: string }) {
  const [captures, setCaptures] = useState<
    Array<{
      id: string;
      title: string;
      pageUrl: string;
      savedAt: string;
      summary: {
        health?: string;
        pageSizeBytes?: number;
        loadTimeMs?: number;
        lcpMs?: number;
        dangerCount?: number;
      };
    }>
  >([]);

  useEffect(() => {
    void fetch(`/api/workspace?origin=${encodeURIComponent(origin)}`)
      .then((r) => r.json())
      .then((d) => setCaptures(d.captures ?? []));
  }, [origin]);

  const deltas = captures.map((c, i) => {
    const prev = captures[i + 1];
    if (!prev) return { size: null as number | null, lcp: null as number | null, danger: null as number | null };
    return {
      size: (c.summary.pageSizeBytes ?? 0) - (prev.summary.pageSizeBytes ?? 0),
      lcp: (c.summary.lcpMs ?? 0) - (prev.summary.lcpMs ?? 0),
      danger: (c.summary.dangerCount ?? 0) - (prev.summary.dangerCount ?? 0),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/captures" className="text-sm text-zinc-500">
          ← Captures
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{origin}</h1>
        <p className="mt-1 text-zinc-600">Timeline of saves — spot regressions in size, LCP, and danger count.</p>
      </div>
      <ol className="space-y-3">
        {captures.map((c, i) => {
          const d = deltas[i];
          const worse =
            (d?.danger != null && d.danger > 0) ||
            (d?.lcp != null && d.lcp > 200) ||
            (d?.size != null && d.size > 200_000);
          const better =
            (d?.danger != null && d.danger < 0) ||
            (d?.lcp != null && d.lcp < -200) ||
            (d?.size != null && d.size < -200_000);
          return (
            <li key={c.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/captures/${c.id}`} className="font-semibold hover:text-teal-700">
                  {c.title}
                </Link>
                <HealthPill health={c.summary.health} />
              </div>
              <p className="mt-1 text-sm text-zinc-500">{new Date(c.savedAt).toLocaleString()}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-700">
                <span>{formatBytes(c.summary.pageSizeBytes ?? 0)}</span>
                <span>Load {formatMs(c.summary.loadTimeMs)}</span>
                <span>LCP {formatMs(c.summary.lcpMs)}</span>
                <span>{c.summary.dangerCount ?? 0} in danger</span>
              </div>
              {i < captures.length - 1 && (
                <p className="mt-2 text-xs font-medium">
                  {worse && <span className="text-red-600">Got worse vs previous save</span>}
                  {better && !worse && <span className="text-emerald-700">Got better vs previous save</span>}
                  {!worse && !better && <span className="text-zinc-500">Similar to previous save</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
