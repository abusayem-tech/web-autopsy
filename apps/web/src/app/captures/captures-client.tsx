"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HealthPill } from "@/components/health-pill";
import { useExtension } from "@/components/extension-provider";
import { formatBytes, formatMs } from "@/lib/utils";

type Capture = {
  id: string;
  title: string;
  pageUrl: string;
  origin: string;
  savedAt: string;
  summary: {
    health?: string;
    pageSizeBytes?: number;
    loadTimeMs?: number;
    storyLine?: string;
    dangerCount?: number;
  };
};

export function CapturesClient() {
  const { status: extensionStatus } = useExtension();
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/autopsies?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!cancelled) {
        setCaptures(data.captures ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  const extensionHint =
    extensionStatus === "connected"
      ? "Browse a site, open Web Autopsy, then click Save."
      : extensionStatus === "installed"
        ? "Finish connecting the extension, then Save a page."
        : "Connect the Chrome extension, then Save a page from the inspector.";

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Captures</h1>
          <p className="mt-1 text-zinc-600">
            Saved autopsies for your workspace. Nothing appears here until someone clicks Save.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by title or URL"
          className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base sm:max-w-xs"
        />
      </div>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}

      {!loading && !captures.length && (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold">No captures yet</h2>
          <p className="mx-auto mt-2 max-w-md text-zinc-600">{extensionHint}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {extensionStatus !== "connected" ? (
              <Link
                href="/extension"
                className="inline-flex min-h-11 items-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white"
              >
                {extensionStatus === "installed" ? "Finish connect" : "Set up extension"}
              </Link>
            ) : (
              <p className="text-sm font-medium text-teal-800">Extension connected — capture from Chrome.</p>
            )}
          </div>
        </div>
      )}

      <ul className="grid gap-3">
        {captures.map((c) => (
          <li key={c.id}>
            <Link
              href={`/captures/${c.id}`}
              className="block rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-teal-200 hover:shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{c.title}</h2>
                    <HealthPill health={c.summary?.health} />
                  </div>
                  <p className="mt-1 truncate text-sm text-zinc-500">{c.pageUrl}</p>
                  <p className="mt-2 text-sm text-zinc-600">
                    {c.summary?.storyLine ||
                      `${formatBytes(c.summary?.pageSizeBytes ?? 0)} · ${formatMs(c.summary?.loadTimeMs)}`}
                  </p>
                </div>
                <div className="text-right text-xs text-zinc-500">
                  <div>{new Date(c.savedAt).toLocaleString()}</div>
                  <div className="mt-1">{c.summary?.dangerCount ? `${c.summary.dangerCount} in danger` : "—"}</div>
                  <Link
                    href={`/origins/${encodeURIComponent(c.origin)}`}
                    className="mt-2 inline-block text-teal-700 underline-offset-2 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Timeline
                  </Link>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
