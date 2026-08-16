"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HealthPill } from "@/components/health-pill";
import { formatBytes, formatMs } from "@/lib/utils";
import { Download, FileJson, Printer } from "lucide-react";

type Advice = {
  id: string;
  kind: string;
  title: string;
  whyItMatters: string;
  suggestion: string;
  severity: string;
  area: string;
};

export function CaptureDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<{
    autopsy: {
      title: string;
      pageUrl: string;
      origin: string;
      savedAt: string;
      summary: {
        health?: string;
        pageSizeBytes?: number;
        loadTimeMs?: number;
        lcpMs?: number;
        requestCount?: number;
      };
      payload: {
        images?: Array<{ url: string; alt?: string; broken?: boolean }>;
        performance?: {
          byType?: Record<string, { bytes: number; count: number }>;
          firstPartyBytes?: number;
          thirdPartyBytes?: number;
        };
        requests?: Array<{
          method: string;
          url: string;
          status?: number;
          resourceType: string;
          durationMs?: number;
        }>;
      };
    };
    brief: {
      story: string;
      health: string;
      apiCards: Array<{ name: string; purpose: string; status: string }>;
    } | null;
    advice: Advice[];
    portableApis: Array<{
      method: string;
      url: string;
      humanName: string;
      purpose: string;
      replayClass: string;
      redactedCodegen?: { curl?: string };
    }>;
    comments: Array<{ id: string; body: string; userName?: string; createdAt: string }>;
    role: string;
  } | null>(null);
  const [mode, setMode] = useState<"story" | "technical">("story");
  const [comment, setComment] = useState("");

  async function load() {
    const res = await fetch(`/api/autopsies/${id}`);
    if (res.ok) setData(await res.json());
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function postComment() {
    if (!comment.trim()) return;
    await fetch(`/api/autopsies/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: comment }),
    });
    setComment("");
    await load();
  }

  if (!data) return <p className="text-sm text-zinc-500">Loading capture…</p>;

  const danger = data.advice.filter((a) => a.kind === "danger");
  const improve = data.advice.filter((a) => a.kind === "improve");
  const healthy = data.advice.filter((a) => a.kind === "healthy");
  const images = data.autopsy.payload?.images ?? [];
  const summary = data.autopsy.summary ?? {};

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link href="/captures" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Captures
        </Link>
        <Link
          href={`/origins/${encodeURIComponent(data.autopsy.origin)}`}
          className="text-sm text-teal-700 hover:underline"
        >
          Origin timeline
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{data.autopsy.title}</h1>
            <HealthPill health={data.brief?.health || summary.health} />
          </div>
          <a href={data.autopsy.pageUrl} className="mt-1 block truncate text-sm text-teal-700" target="_blank" rel="noreferrer">
            {data.autopsy.pageUrl}
          </a>
          <p className="mt-1 text-xs text-zinc-500">{new Date(data.autopsy.savedAt).toLocaleString()}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <div className="flex rounded-xl bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => setMode("story")}
              className={`min-h-10 rounded-lg px-3 text-sm font-medium ${mode === "story" ? "bg-white shadow-sm" : "text-zinc-600"}`}
            >
              Story
            </button>
            <button
              type="button"
              onClick={() => setMode("technical")}
              className={`min-h-10 rounded-lg px-3 text-sm font-medium ${mode === "technical" ? "bg-white shadow-sm" : "text-zinc-600"}`}
            >
              Technical
            </button>
          </div>
          <a
            href={`/api/autopsies/${id}?format=zip`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium"
          >
            <Download className="h-4 w-4" /> Download
          </a>
          <a
            href={`/api/autopsies/${id}?format=postman`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium"
          >
            <FileJson className="h-4 w-4" /> Postman
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      {mode === "story" ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">What this page is doing</h2>
            <p className="mt-2 text-lg leading-relaxed text-zinc-800">{data.brief?.story}</p>
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Page size", value: formatBytes(summary.pageSizeBytes ?? 0) },
              { label: "Load time", value: formatMs(summary.loadTimeMs) },
              { label: "LCP", value: formatMs(summary.lcpMs) },
              { label: "Requests", value: String(summary.requestCount ?? 0) },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{m.label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{m.value}</div>
              </div>
            ))}
          </section>

          <AdviceGroup title="In danger" items={danger} tone="danger" />
          <AdviceGroup title="Improve" items={improve} tone="improve" />
          <AdviceGroup title="Going well" items={healthy} tone="healthy" />

          <section className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-lg font-semibold">APIs in plain English</h2>
            <ul className="mt-3 grid gap-2">
              {(data.brief?.apiCards ?? []).map((a, i) => (
                <li key={i} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                  <div className="font-medium">{a.name}</div>
                  <div className="text-sm text-zinc-600">{a.purpose}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{a.status}</div>
                </li>
              ))}
              {!data.brief?.apiCards?.length && (
                <li className="text-sm text-zinc-500">No portable APIs detected in this capture.</li>
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Images (URL preview)</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {images.slice(0, 24).map((img, i) => (
                <a key={i} href={img.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.alt || "page image"}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="truncate p-2 text-[10px] text-zinc-500">{img.url}</div>
                </a>
              ))}
            </div>
          </section>

          <section className="no-print rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Comments</h2>
            <ul className="mt-3 space-y-2">
              {data.comments.map((c) => (
                <li key={c.id} className="rounded-xl bg-zinc-50 px-3 py-2 text-sm">
                  <span className="font-medium">{c.userName || "Teammate"}</span>
                  <span className="text-zinc-500"> · {new Date(c.createdAt).toLocaleString()}</span>
                  <p className="mt-1 text-zinc-800">{c.body}</p>
                </li>
              ))}
            </ul>
            {data.role !== "viewer" && (
              <div className="mt-3 flex gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a note for the team"
                  className="min-h-11 flex-1 rounded-xl border border-zinc-200 px-3"
                />
                <button
                  type="button"
                  onClick={() => void postComment()}
                  className="min-h-11 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white"
                >
                  Post
                </button>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <h2 className="border-b border-zinc-100 px-4 py-3 text-lg font-semibold">Portable APIs</h2>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2">URL</th>
                </tr>
              </thead>
              <tbody>
                {data.portableApis.map((a, i) => (
                  <tr key={i} className="border-t border-zinc-100">
                    <td className="px-3 py-2 font-medium">{a.humanName}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.method}</td>
                    <td className="px-3 py-2 text-xs">{a.replayClass}</td>
                    <td className="max-w-md truncate px-3 py-2 font-mono text-xs">{a.url}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <h2 className="border-b border-zinc-100 px-4 py-3 text-lg font-semibold">Network</h2>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">URL</th>
                </tr>
              </thead>
              <tbody>
                {(data.autopsy.payload?.requests ?? []).slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-t border-zinc-100">
                    <td className="px-3 py-2">{r.status ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.method}</td>
                    <td className="px-3 py-2 text-xs">{r.resourceType}</td>
                    <td className="px-3 py-2">{formatMs(r.durationMs)}</td>
                    <td className="max-w-lg truncate px-3 py-2 font-mono text-xs">{r.url}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}

function AdviceGroup({
  title,
  items,
  tone,
}: {
  title: string;
  items: Advice[];
  tone: "danger" | "improve" | "healthy";
}) {
  if (!items.length) return null;
  const ring =
    tone === "danger"
      ? "border-red-200"
      : tone === "improve"
        ? "border-amber-200"
        : "border-emerald-200";
  return (
    <section className={`rounded-2xl border bg-white p-5 ${ring}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-3 space-y-3">
        {items.map((a) => (
          <li key={a.id} className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
            <div className="font-medium">{a.title}</div>
            <p className="mt-1 text-sm text-zinc-600">{a.whyItMatters}</p>
            <p className="mt-2 text-sm font-medium text-teal-800">What to do: {a.suggestion}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
