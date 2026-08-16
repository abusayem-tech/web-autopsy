"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HealthPill } from "@/components/health-pill";
import { CodeBlockWithCopy, CopyButton, UrlLine } from "@/components/url-line";
import { formatBytes, formatMs } from "@/lib/utils";
import { Download, FileJson, Printer, Trash2 } from "lucide-react";
import type { AutopsySession } from "@web-autopsy/core";
import { useRouter } from "next/navigation";

type Advice = {
  id: string;
  kind: string;
  title: string;
  whyItMatters: string;
  suggestion: string;
  severity: string;
  area: string;
};

type Finding = {
  id: string;
  ruleId: string;
  severity: string;
  title: string;
  plainTitle: string;
  detail?: Record<string, unknown> | null;
  area?: string;
};

type PortableApi = {
  method: string;
  url: string;
  humanName: string;
  purpose: string;
  replayClass: string;
  authType?: string | null;
  status?: number | null;
  durationMs?: number | null;
  redactedCodegen?: { curl?: string; fetch?: string; python?: string } | null;
};

type Tab =
  | "overview"
  | "findings"
  | "network"
  | "portable"
  | "images"
  | "performance"
  | "console"
  | "page"
  | "privacy"
  | "security"
  | "runtime"
  | "stack";

export function CaptureDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<{
    autopsy: {
      title: string;
      pageUrl: string;
      origin: string;
      savedAt: string;
      summary: Record<string, unknown>;
      payload: AutopsySession;
      htmlSnapshot?: string | null;
    };
    brief: {
      story: string;
      health: string;
      apiCards: Array<{ name: string; purpose: string; status: string }>;
    } | null;
    findings: Finding[];
    advice: Advice[];
    portableApis: PortableApi[];
    comments: Array<{ id: string; body: string; userName?: string; createdAt: string }>;
    role: string;
  } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [comment, setComment] = useState("");
  const [netFilter, setNetFilter] = useState<"all" | "api" | "image" | "script">("all");
  const [overviewView, setOverviewView] = useState<"technical" | "simple">("technical");
  const [findingsView, setFindingsView] = useState<"technical" | "simple">("technical");
  const [deleting, setDeleting] = useState(false);

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

  async function deleteCapture() {
    if (!data) return;
    const title = (data.autopsy.summary as { pageTitle?: string })?.pageTitle || data.autopsy.title;
    if (!window.confirm(`Delete capture “${title}”? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/autopsies/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Delete failed");
      }
      router.push("/captures");
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  const payload = data?.autopsy.payload;
  const findings = useMemo(() => {
    if (!data) return [];
    if (data.findings?.length) return data.findings;
    return (payload?.findings || []) as Finding[];
  }, [data, payload]);

  const portable = useMemo(() => {
    if (!data) return [];
    if (data.portableApis?.length) return data.portableApis;
    return (payload?.portableApis || []) as PortableApi[];
  }, [data, payload]);

  const advice = useMemo(() => {
    if (!data) return [];
    if (data.advice?.length) return data.advice;
    return (payload?.advice || []) as Advice[];
  }, [data, payload]);

  if (!data) return <p className="text-sm text-zinc-500">Loading capture…</p>;

  const summary = (data.autopsy.summary || {}) as {
    health?: string;
    pageSizeBytes?: number;
    loadTimeMs?: number;
    lcpMs?: number;
    requestCount?: number;
    storyLine?: string;
    subtitle?: string;
    pageTitle?: string;
    dangerCount?: number;
  };
  const session = payload || ({} as AutopsySession);
  const danger = advice.filter((a) => a.kind === "danger");
  const improve = advice.filter((a) => a.kind === "improve");
  const healthy = advice.filter((a) => a.kind === "healthy");
  const images = [...(session.images || [])].sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0));
  const perf = session.performance;
  const network = (session.requests || []).filter((r) => {
    if (netFilter === "all") return true;
    if (netFilter === "api") return r.resourceType === "fetch" || r.resourceType === "xhr";
    return r.resourceType === netFilter;
  });

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "findings", label: "Findings" },
    { id: "network", label: "Network" },
    { id: "portable", label: "Portable APIs" },
    { id: "images", label: "Images" },
    { id: "performance", label: "Performance" },
    { id: "console", label: "Console" },
    { id: "page", label: "Page" },
    { id: "privacy", label: "Privacy" },
    { id: "security", label: "Security" },
    { id: "runtime", label: "Runtime" },
    { id: "stack", label: "Stack" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl">
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
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className="min-w-0 max-w-full break-words text-xl font-semibold tracking-tight sm:truncate sm:text-2xl lg:text-3xl"
              title={summary.pageTitle || data.autopsy.title}
            >
              {summary.pageTitle || data.autopsy.title}
            </h1>
            <HealthPill health={data.brief?.health || summary.health} />
          </div>
          <div className="mt-1">
            <UrlLine url={data.autopsy.pageUrl} className="text-sm" mono={false} />
          </div>
          {(summary.subtitle || summary.storyLine) && (
            <p className="mt-1 break-words text-sm text-zinc-600">{summary.subtitle || summary.storyLine}</p>
          )}
          <p className="mt-1 text-xs text-zinc-500">{new Date(data.autopsy.savedAt).toLocaleString()}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
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
          {data.role !== "viewer" && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => void deleteCapture()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      <div className="no-print mb-5 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-9 shrink-0 rounded-lg px-3 text-sm ${
              tab === t.id ? "bg-teal-600 text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              {overviewView === "simple" ? "Plain-language summary" : "Technical metrics and advice"}
            </p>
            <ViewModeToggle value={overviewView} onChange={setOverviewView} />
          </div>

          {overviewView === "simple" ? (
            <>
              <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Story</h2>
                <p className="mt-2 text-lg leading-relaxed text-zinc-800">{data.brief?.story}</p>
                <p className="mt-3 text-sm text-zinc-600">
                  About {formatBytes(summary.pageSizeBytes ?? perf?.totalTransferBytes ?? 0)} ·{" "}
                  {summary.requestCount ?? perf?.requestCount ?? 0} requests
                  {danger.length ? ` · ${danger.length} issue${danger.length === 1 ? "" : "s"} need attention` : ""}.
                </p>
              </section>
              <AdviceGroup title="Fix these first" items={danger} tone="danger" mode="simple" />
              <AdviceGroup title="Worth improving" items={improve} tone="improve" mode="simple" />
              <AdviceGroup title="Looking good" items={healthy} tone="healthy" mode="simple" />
            </>
          ) : (
            <>
              <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Story</h2>
                <p className="mt-2 text-lg leading-relaxed text-zinc-800">{data.brief?.story}</p>
              </section>
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Page size", value: formatBytes(summary.pageSizeBytes ?? perf?.totalTransferBytes ?? 0) },
                  { label: "Load time", value: formatMs(summary.loadTimeMs ?? perf?.loadEventMs) },
                  { label: "LCP", value: formatMs(summary.lcpMs ?? perf?.lcpMs) },
                  { label: "Requests", value: String(summary.requestCount ?? perf?.requestCount ?? 0) },
                ].map((m) => (
                  <div key={m.label} className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{m.label}</div>
                    <div className="mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl">{m.value}</div>
                  </div>
                ))}
              </section>
              <AdviceGroup title="In danger" items={danger} tone="danger" mode="technical" />
              <AdviceGroup title="Improve" items={improve} tone="improve" mode="technical" />
              <AdviceGroup title="Going well" items={healthy} tone="healthy" mode="technical" />
            </>
          )}

          <CommentsBlock
            comments={data.comments}
            role={data.role}
            comment={comment}
            setComment={setComment}
            onPost={() => void postComment()}
          />
        </div>
      )}

      {tab === "findings" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              {findingsView === "simple"
                ? "What stood out, in plain language"
                : "Rule IDs, HTTP detail, and evidence"}
            </p>
            <ViewModeToggle value={findingsView} onChange={setFindingsView} />
          </div>
          <ul className="space-y-3">
            {findings.map((f) =>
              findingsView === "simple" ? (
                <li key={f.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {f.severity === "critical" || f.severity === "high"
                      ? "Needs attention"
                      : f.severity === "medium"
                        ? "Worth a look"
                        : "Note"}
                  </p>
                  <h3 className="mt-1 break-words text-base font-medium">{f.plainTitle}</h3>
                  {f.title !== f.plainTitle && (
                    <p className="mt-1 break-words text-sm text-zinc-600">{f.title}</p>
                  )}
                </li>
              ) : (
                <li key={f.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Chip>{f.severity}</Chip>
                    {f.area && <Chip>{f.area}</Chip>}
                    <Chip>{f.ruleId}</Chip>
                  </div>
                  <h3 className="mt-2 break-words font-medium">{f.plainTitle}</h3>
                  <p className="mt-1 break-words text-sm text-zinc-600">{f.title}</p>
                  {f.detail && (
                    <CodeBlockWithCopy
                      title="Detail"
                      code={JSON.stringify(f.detail, null, 2)}
                      maxClass="max-h-40"
                    />
                  )}
                </li>
              ),
            )}
            {!findings.length && <Empty>No findings in this capture.</Empty>}
          </ul>
        </div>
      )}

      {tab === "network" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["all", "api", "script", "image"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setNetFilter(f)}
                className={`min-h-9 rounded-lg px-3 text-xs ${
                  netFilter === f ? "bg-teal-600 text-white" : "bg-white ring-1 ring-zinc-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">
            Showing {network.length} of {session.requests?.length ?? 0} requests
          </p>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="w-14 px-3 py-2">Status</th>
                  <th className="w-16 px-3 py-2">Method</th>
                  <th className="hidden w-20 px-3 py-2 sm:table-cell">Type</th>
                  <th className="hidden w-14 px-3 py-2 sm:table-cell">Party</th>
                  <th className="w-16 px-3 py-2">Time</th>
                  <th className="hidden w-16 px-3 py-2 md:table-cell">Size</th>
                  <th className="px-3 py-2">URL</th>
                </tr>
              </thead>
              <tbody>
                {network.slice(-500).map((r, i) => (
                  <tr key={r.id || i} className="border-t border-zinc-100">
                    <td className="px-3 py-2">{r.status ?? (r.failed ? "ERR" : "—")}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.method}</td>
                    <td className="hidden px-3 py-2 text-xs sm:table-cell">{r.resourceType}</td>
                    <td className="hidden px-3 py-2 text-xs sm:table-cell">{r.firstParty ? "1st" : "3rd"}</td>
                    <td className="px-3 py-2">{formatMs(r.durationMs)}</td>
                    <td className="hidden px-3 py-2 md:table-cell">
                      {r.transferSize != null ? formatBytes(r.transferSize) : "—"}
                    </td>
                    <td className="min-w-0 px-3 py-2 font-mono text-xs" title={r.url}>
                      <span className="flex min-w-0 items-center gap-1">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 truncate text-teal-700 underline-offset-2 hover:underline"
                        >
                          {r.url}
                        </a>
                        <CopyButton text={r.url} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "portable" && (
        <ul className="space-y-3">
          {portable.map((a, i) => (
            <li key={i} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{a.humanName}</h3>
                <Chip>{a.replayClass}</Chip>
                {a.authType && <Chip>{a.authType}</Chip>}
                {a.status != null && <Chip>{String(a.status)}</Chip>}
              </div>
              <p className="mt-1 break-words text-sm text-zinc-600">{a.purpose}</p>
              <div className="mt-2 flex min-w-0 flex-wrap items-start gap-1.5">
                <span className="shrink-0 font-mono text-xs text-zinc-500">{a.method}</span>
                <UrlLine url={a.url} className="text-xs" />
              </div>
              {a.durationMs != null && (
                <p className="mt-1 text-xs text-zinc-500">Duration {formatMs(a.durationMs)}</p>
              )}
              {a.redactedCodegen?.curl && (
                <div className="mt-3">
                  <CodeBlockWithCopy title="curl" code={a.redactedCodegen.curl} maxClass="max-h-40" />
                </div>
              )}
            </li>
          ))}
          {!portable.length && <Empty>No portable APIs detected.</Empty>}
        </ul>
      )}

      {tab === "images" && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">
            {images.length} images · known size{" "}
            {formatBytes(images.reduce((s, i) => s + (i.bytes ?? 0), 0))} (URL previews only)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img, i) => (
              <a
                key={`${img.url}-${i}`}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt || ""}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = "0.2";
                  }}
                />
                <div className="space-y-0.5 p-2 text-[10px] text-zinc-500">
                  <div>{img.bytes != null && img.bytes > 0 ? formatBytes(img.bytes) : "size unknown"}</div>
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate" title={img.url}>
                      {img.url}
                    </span>
                    <CopyButton text={img.url} />
                  </div>
                </div>
              </a>
            ))}
          </div>
          {!images.length && <Empty>No images captured.</Empty>}
        </div>
      )}

      {tab === "performance" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              ["Transfer", formatBytes(perf?.totalTransferBytes ?? 0), "Total bytes transferred"],
              ["Requests", String(perf?.requestCount ?? 0), "HTTP requests observed"],
              ["TTFB", formatMs(perf?.ttfbMs), "Time to first byte"],
              ["LCP", formatMs(perf?.lcpMs), "Largest Contentful Paint"],
              ["FCP", formatMs(perf?.fcpMs), "First Contentful Paint"],
              ["CLS", perf?.cls != null ? perf.cls.toFixed(3) : "—", "Cumulative Layout Shift"],
              ["Load", formatMs(perf?.loadEventMs), "Window load event"],
              ["Failed", String(perf?.failedCount ?? 0), "Failed requests"],
              [
                "1st party",
                `${formatBytes(perf?.firstPartyBytes ?? 0)} · ${perf?.firstPartyRequests ?? 0}`,
                "Same-host traffic",
              ],
              [
                "3rd party",
                `${formatBytes(perf?.thirdPartyBytes ?? 0)} · ${perf?.thirdPartyRequests ?? 0}`,
                "Other-host traffic",
              ],
            ].map(([label, value, meaning]) => (
              <div key={label} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-medium uppercase text-zinc-500">{label}</div>
                <div className="mt-1 text-xl font-semibold">{value}</div>
                <p className="mt-2 text-xs text-zinc-500">{meaning}</p>
              </div>
            ))}
          </div>
          {!!perf?.slowestApis?.length && (
            <Section title="Slowest APIs">
              <ul className="space-y-2 text-sm">
                {perf.slowestApis.slice(0, 12).map((a, i) => (
                  <li key={i} className="flex min-w-0 justify-between gap-3">
                    <UrlLine url={a.url} className="min-w-0 flex-1 text-xs" />
                    <span className="shrink-0 text-zinc-500">{formatMs(a.durationMs)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {!!perf?.largestResources?.length && (
            <Section title="Largest resources">
              <ul className="space-y-2 text-sm">
                {perf.largestResources.slice(0, 12).map((a, i) => (
                  <li key={i} className="flex min-w-0 justify-between gap-3">
                    <UrlLine url={a.url} display={`[${a.type}] ${a.url}`} className="min-w-0 flex-1 text-xs" />
                    <span className="shrink-0 text-zinc-500">{formatBytes(a.bytes)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {tab === "console" && (
        <ul className="space-y-2">
          {(session.console || []).map((c, i) => (
            <li key={i} className="rounded-2xl border border-zinc-200 bg-white p-3 text-sm">
              <div className="flex gap-2 text-xs">
                <Chip>{c.level}</Chip>
                <span className="text-zinc-400">{new Date(c.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words">{c.message}</p>
              {c.stack && (
                <CodeBlockWithCopy title="Stack" code={c.stack} maxClass="max-h-32" />
              )}
            </li>
          ))}
          {!session.console?.length && <Empty>No console entries.</Empty>}
        </ul>
      )}

      {tab === "page" && (
        <div className="space-y-4">
          <Section title="SEO">
            <KV label="Title" value={session.seo?.title || "—"} />
            <KV label="Description" value={session.seo?.description || "—"} />
            <KV label="Canonical" value={session.seo?.canonical || "—"} />
            <KV label="OG title" value={session.seo?.ogTitle || "—"} />
            <KV label="H1 count" value={String(session.seo?.h1Count ?? 0)} />
            <KV label="JSON-LD" value={String(session.seo?.jsonLdCount ?? 0)} />
          </Section>
          <Section title="DOM">
            <KV label="Nodes" value={String(session.dom?.nodeCount ?? "—")} />
            <KV label="Max depth" value={String(session.dom?.maxDepth ?? "—")} />
            <KV label="Iframes" value={String(session.dom?.iframeCount ?? "—")} />
            <KV label="Scripts" value={String(session.scripts?.length ?? 0)} />
          </Section>
          <Section title={`Forms (${session.forms?.length ?? 0})`}>
            {(session.forms || []).slice(0, 40).map((f, i) => (
              <div key={i} className="border-t border-zinc-100 py-2 text-sm first:border-0">
                <div className="flex flex-wrap items-start gap-1.5 font-medium">
                  <span>{f.method}</span>
                  {f.action ? (
                    <UrlLine url={f.action} className="text-sm" mono={false} />
                  ) : (
                    <span className="text-zinc-500">(same page)</span>
                  )}
                </div>
                <div className="text-xs text-zinc-500">
                  {f.fieldCount} fields
                  {f.missingLabels ? ` · ${f.missingLabels} missing labels` : ""}
                </div>
              </div>
            ))}
            {!session.forms?.length && <p className="text-sm text-zinc-500">No forms.</p>}
          </Section>
          <Section title={`Links (sample ${(session.links || []).slice(0, 40).length})`}>
            <ul className="max-h-64 space-y-1 overflow-auto text-xs">
              {(session.links || []).slice(0, 40).map((l, i) => (
                <li key={i} className="min-w-0">
                  <UrlLine
                    url={l.href}
                    display={`${l.external ? "[ext] " : ""}${l.text || l.href}`}
                    className="text-xs"
                    mono={false}
                  />
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {tab === "privacy" && (
        <div className="space-y-4">
          <Section title={`Trackers (${session.trackers?.length ?? 0})`}>
            <ul className="space-y-2">
              {(session.trackers || []).map((t, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <Chip>{t.type}</Chip>
                  <span className="min-w-0 break-words font-medium">{t.name}</span>
                  <span className="break-all text-xs text-zinc-500">{t.domain}</span>
                </li>
              ))}
            </ul>
            {!session.trackers?.length && <p className="text-sm text-zinc-500">None matched.</p>}
          </Section>
          <Section title={`Cookies (${session.cookies?.length ?? 0})`}>
            <ul className="max-h-72 space-y-2 overflow-auto text-sm">
              {(session.cookies || []).map((c, i) => (
                <li key={i} className="rounded-lg border border-zinc-100 p-2">
                  <div className="break-all font-medium" title={c.name}>
                    {c.name}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {c.domain} · {c.httpOnly ? "HttpOnly " : ""}
                    {c.secure ? "Secure " : ""}
                    {c.sameSite || ""}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
          <Section title={`Fingerprinting (${session.fingerprinting?.length ?? 0})`}>
            <ul className="space-y-1 text-sm">
              {(session.fingerprinting || []).slice(0, 40).map((f, i) => (
                <li key={i}>
                  <code className="text-xs">{f.api}</code>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {tab === "security" && (
        <div className="space-y-4">
          <Section title="Security headers">
            <KV label="CSP" value={session.security?.hasCsp ? "Present" : "Missing"} />
            <KV label="HSTS" value={session.security?.hasHsts ? "Present" : "Missing"} />
            <KV label="X-Frame-Options" value={session.security?.hasXfo ? "Present" : "Missing"} />
            <KV
              label="Referrer-Policy"
              value={session.security?.hasReferrerPolicy ? "Present" : "Missing"}
            />
            <KV
              label="Permissions-Policy"
              value={session.security?.hasPermissionsPolicy ? "Present" : "Missing"}
            />
            <KV
              label="Mixed content"
              value={
                session.security?.mixedContentUrls?.length
                  ? `${session.security.mixedContentUrls.length} URLs`
                  : "None"
              }
            />
          </Section>
          <Section title="Well-known">
            <KV label="robots.txt" value={statusLabel(session.wellKnown?.robotsTxt?.status)} />
            <KV label="sitemap.xml" value={statusLabel(session.wellKnown?.sitemapXml?.status)} />
            <KV label="security.txt" value={statusLabel(session.wellKnown?.securityTxt?.status)} />
            <KV label="manifest" value={statusLabel(session.wellKnown?.manifest?.status)} />
          </Section>
          {session.security?.headers && Object.keys(session.security.headers).length > 0 && (
            <Section title="Raw headers">
              <CodeBlockWithCopy
                code={JSON.stringify(session.security.headers, null, 2)}
                maxClass="max-h-64"
              />
            </Section>
          )}
        </div>
      )}

      {tab === "runtime" && (
        <div className="space-y-4">
          <Section title="Workers & caches">
            <KV label="Service workers" value={String(session.runtime?.serviceWorkers?.length ?? 0)} />
            <KV label="Cache names" value={String(session.runtime?.cacheNames?.length ?? 0)} />
            <KV label="IndexedDB" value={String(session.runtime?.indexedDbNames?.length ?? 0)} />
            <KV label="Workers" value={String(session.runtime?.workerCount ?? 0)} />
          </Section>
          <Section title="Storage keys">
            <KV label="localStorage" value={String(Object.keys(session.storage?.local || {}).length)} />
            <KV label="sessionStorage" value={String(Object.keys(session.storage?.session || {}).length)} />
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs font-mono">
              {Object.keys(session.storage?.local || {})
                .slice(0, 40)
                .map((k) => (
                  <li key={k} className="flex min-w-0 items-start gap-1.5">
                    <span className="min-w-0 break-all" title={k}>
                      local: {k}
                    </span>
                    <CopyButton text={k} />
                  </li>
                ))}
            </ul>
          </Section>
          {!!session.runtime?.sourceMapUrls?.length && (
            <Section title="Source maps">
              <ul className="max-h-40 space-y-1 overflow-auto text-xs font-mono">
                {session.runtime.sourceMapUrls.map((u, i) => (
                  <li key={i} className="min-w-0">
                    <UrlLine url={u} className="text-xs" />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {tab === "stack" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(session.stack || []).map((s, i) => (
            <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Chip>{s.category}</Chip>
                <h3 className="min-w-0 break-words font-semibold">{s.name}</h3>
              </div>
              {s.evidence && <p className="mt-2 break-words text-xs text-zinc-500">{s.evidence}</p>}
            </div>
          ))}
          {!session.stack?.length && <Empty>No stack signals.</Empty>}
        </div>
      )}
    </div>
  );
}

function statusLabel(status?: number) {
  if (status == null) return "Not found";
  if (status >= 200 && status < 400) return `Yes (${status})`;
  return `HTTP ${status}`;
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: "technical" | "simple";
  onChange: (v: "technical" | "simple") => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 text-xs">
      {(
        [
          ["technical", "Technical"],
          ["simple", "Simple"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`min-h-8 rounded-md px-2.5 font-medium ${
            value === id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 space-y-1">{children}</div>
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  const linkable = /^https?:\/\//i.test(value);
  return (
    <div className="grid gap-0.5 text-sm sm:grid-cols-[8rem_1fr] sm:gap-2">
      <dt className="text-xs text-zinc-500 sm:text-sm">{label}</dt>
      <dd className="min-w-0 break-words text-zinc-800">
        {linkable ? <UrlLine url={value} className="text-sm" mono={false} /> : value}
      </dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

function AdviceGroup({
  title,
  items,
  tone,
  mode = "technical",
}: {
  title: string;
  items: Advice[];
  tone: "danger" | "improve" | "healthy";
  mode?: "technical" | "simple";
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
        {items.map((a) =>
          mode === "simple" ? (
            <li key={a.id} className="border-t border-zinc-100 pt-3 first:border-0 first:pt-0">
              <div className="break-words font-medium">{a.title}</div>
              <p className="mt-1 break-words text-sm font-medium text-teal-800">{a.suggestion}</p>
            </li>
          ) : (
            <li key={a.id} className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Chip>{a.severity}</Chip>
                <Chip>{a.area}</Chip>
                <div className="break-words font-medium">{a.title}</div>
              </div>
              <p className="mt-1 break-words text-sm text-zinc-600">{a.whyItMatters}</p>
              <p className="mt-2 break-words text-sm font-medium text-teal-800">What to do: {a.suggestion}</p>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function CommentsBlock({
  comments,
  role,
  comment,
  setComment,
  onPost,
}: {
  comments: Array<{ id: string; body: string; userName?: string; createdAt: string }>;
  role: string;
  comment: string;
  setComment: (v: string) => void;
  onPost: () => void;
}) {
  return (
    <section className="no-print rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Comments</h2>
      <ul className="mt-3 space-y-2">
        {comments.map((c) => (
          <li key={c.id} className="rounded-xl bg-zinc-50 px-3 py-2 text-sm">
            <span className="font-medium">{c.userName || "Teammate"}</span>
            <span className="text-zinc-500"> · {new Date(c.createdAt).toLocaleString()}</span>
            <p className="mt-1 break-words text-zinc-800">{c.body}</p>
          </li>
        ))}
      </ul>
      {role !== "viewer" && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a note for the team"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3"
          />
          <button
            type="button"
            onClick={onPost}
            className="min-h-11 shrink-0 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white"
          >
            Post
          </button>
        </div>
      )}
    </section>
  );
}
