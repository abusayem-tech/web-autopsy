import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AdviceCard, AutopsySession, Finding, ImageEntry, NetworkEntry, PortableApi } from "@web-autopsy/core";
import { enrichSession, formatBytes, formatMs, isTrackerUrl, shortUrl } from "@web-autopsy/core";
import {
  confirmSwitchPage,
  downloadRebuildKit,
  fetchSession,
  getActiveTabId,
  saveToCloud,
} from "../../lib/session";
import "~/assets/style.css";

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

type NetScope = "site" | "first" | "third" | "all";
type NetKind = "all" | "api" | "script" | "stylesheet" | "image" | "font" | "other";

function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [session, setSession] = useState<AutopsySession | null>(null);
  const [section, setSection] = useState<Tab>("overview");
  const [paused, setPaused] = useState(false);
  const [deep, setDeep] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [savePercent, setSavePercent] = useState<number | null>(null);
  const [reloading, setReloading] = useState(false);
  const [netScope, setNetScope] = useState<NetScope>("site");
  const [netKind, setNetKind] = useState<NetKind>("api");
  const [netHideTrackers, setNetHideTrackers] = useState(true);
  const [netFailedOnly, setNetFailedOnly] = useState(false);
  const [portableOpen, setPortableOpen] = useState<string | null>(null);
  const [pendingPage, setPendingPage] = useState<{ url: string; title?: string } | null>(null);
  const [trackedUrl, setTrackedUrl] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  async function refresh(id: number) {
    const data = await fetchSession(id);
    setSession(enrichSession(data.session));
    setPaused(data.paused);
    setDeep(data.deepCapture);
    setPendingPage(data.pendingPage ?? null);
    setTrackedUrl(data.trackedUrl ?? data.session.pageUrl);
  }

  useEffect(() => {
    void getActiveTabId().then(async (id) => {
      setTabId(id);
      if (id == null) return;
      const data = await fetchSession(id);
      setSession(enrichSession(data.session));
      setPaused(data.paused);
      setDeep(data.deepCapture);
      setPendingPage(data.pendingPage ?? null);
      setTrackedUrl(data.trackedUrl ?? data.session.pageUrl);

      // Only auto-start a clean capture when there is no pending page change
      // and this tab has no data yet for the tracked page.
      if (!data.pendingPage && (data.session.requests?.length ?? 0) === 0) {
        setReloading(true);
        setStatus("Starting clean capture for this page…");
        try {
          const res = (await chrome.runtime.sendMessage({ type: "START_FRESH_CAPTURE", tabId: id })) as {
            skipped?: boolean;
            reloaded?: boolean;
            needConfirm?: boolean;
            pendingPage?: { url: string; title?: string };
          };
          if (res?.needConfirm && res.pendingPage) {
            setPendingPage(res.pendingPage);
          } else if (res?.reloaded) {
            await new Promise((r) => setTimeout(r, 1800));
          }
        } catch {
          /* ignore */
        } finally {
          setReloading(false);
          setStatus(null);
          void refresh(id);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (tabId == null || reloading) return;
    const t = setInterval(() => void refresh(tabId), 2000);
    return () => clearInterval(t);
  }, [tabId, reloading]);

  const sections: Array<{ id: Tab; label: string }> = useMemo(
    () => [
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
    ],
    [],
  );

  const network = useMemo(() => {
    if (!session) return [];
    return session.requests.filter((r) => {
      if (netHideTrackers && isTrackerUrl(r.url)) return false;
      if (netFailedOnly && !(r.failed || (r.status != null && r.status >= 400))) return false;
      if (netScope === "first" && !r.firstParty) return false;
      if (netScope === "third" && r.firstParty) return false;
      if (netScope === "site") {
        // Site APIs: first-party, or same registrable host family, excluding trackers
        if (!r.firstParty && isTrackerUrl(r.url)) return false;
        if (!r.firstParty) {
          try {
            const pageHost = new URL(session.pageUrl).hostname;
            const reqHost = new URL(r.url).hostname;
            const pageRoot = pageHost.split(".").slice(-2).join(".");
            const reqRoot = reqHost.split(".").slice(-2).join(".");
            if (pageRoot !== reqRoot) return false;
          } catch {
            return false;
          }
        }
      }
      if (netKind === "all") return true;
      if (netKind === "api") return r.resourceType === "fetch" || r.resourceType === "xhr";
      if (netKind === "other") {
        return !["script", "stylesheet", "image", "font", "fetch", "xhr", "document"].includes(r.resourceType);
      }
      return r.resourceType === netKind;
    });
  }, [session, netScope, netKind, netHideTrackers, netFailedOnly]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 text-sm text-zinc-500 dark:bg-zinc-950">
        {reloading ? "Reloading page for a clean capture…" : "Loading session… Open a website tab first."}
      </div>
    );
  }

  const danger = session.advice.filter((a) => a.kind === "danger");
  const improve = session.advice.filter((a) => a.kind === "improve");
  const healthy = session.advice.filter((a) => a.kind === "healthy");
  const imagesSorted = [...session.images].sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0));

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white p-3 md:block dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-1 px-2 text-sm font-semibold">Web Autopsy</div>
        <div className="mb-4 truncate px-2 text-[10px] text-zinc-400">v{chrome.runtime.getManifest().version}</div>
        <nav className="space-y-1">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`flex min-h-10 w-full items-center rounded-lg px-2 text-left text-sm ${
                section === s.id
                  ? "bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-xl font-semibold">{session.pageTitle || session.pageUrl}</h1>
            <p className="truncate text-xs text-zinc-500">{session.pageUrl}</p>
          </div>
          <ToolbarButton
            onClick={() => {
              if (tabId == null) return;
              void chrome.runtime
                .sendMessage({ type: "SET_PAUSED", tabId, paused: !paused })
                .then(() => refresh(tabId));
            }}
          >
            {paused ? "Resume" : "Pause"}
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (tabId == null) return;
              void chrome.runtime.sendMessage({ type: "TOGGLE_DEEP_CAPTURE", tabId }).then(() => refresh(tabId));
            }}
          >
            Deep {deep ? "On" : "Off"}
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (tabId == null) return;
              void downloadRebuildKit(tabId).then(() => setStatus("Downloaded rebuild kit"));
            }}
          >
            Download
          </ToolbarButton>
          <button
            type="button"
            disabled={savePercent != null}
            className="min-h-10 rounded-lg bg-teal-600 px-3 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => {
              if (tabId == null) return;
              setSavePercent(0);
              setStatus("Preparing save…");
              void saveToCloud(tabId, {
                onProgress: (p) => {
                  setSavePercent(p.percent);
                  setStatus(p.label);
                },
              })
                .then((r) => {
                  setStatus(r.updated ? `Updated ${r.id}` : `Saved ${r.id}`);
                  setSavePercent(null);
                })
                .catch((e) => {
                  setStatus(e.message);
                  setSavePercent(null);
                });
            }}
          >
            {savePercent != null ? `${savePercent}%` : "Save"}
          </button>
        </div>
        {pendingPage && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="font-semibold">New page detected</p>
            <p className="mt-1 text-xs opacity-90">
              The browser moved to a different page. Capture data below is still for the previous page and will not
              update until you switch.
            </p>
            <dl className="mt-3 space-y-1 text-xs">
              <div>
                <dt className="inline font-medium">Tracking: </dt>
                <dd className="inline break-all">{trackedUrl || session.pageUrl}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Browser now: </dt>
                <dd className="inline break-all">{pendingPage.url}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={switching}
                className="min-h-10 rounded-lg bg-teal-600 px-3 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => {
                  if (tabId == null) return;
                  setSwitching(true);
                  setStatus("Clearing old capture and loading the new page…");
                  void confirmSwitchPage(tabId)
                    .then(async (r) => {
                      if (!r.ok) throw new Error(r.error || "Switch failed");
                      if (r.reloaded) await new Promise((x) => setTimeout(x, 1800));
                      await refresh(tabId);
                      setPendingPage(null);
                      setStatus("Now tracking the new page");
                    })
                    .catch((e) => setStatus(e.message))
                    .finally(() => setSwitching(false));
                }}
              >
                {switching ? "Switching…" : "Clear & track new page"}
              </button>
              <button
                type="button"
                className="min-h-10 rounded-lg border border-amber-400 px-3 text-sm"
                onClick={() => setStatus("Keeping the previous page capture. Switch whenever you’re ready.")}
              >
                Keep previous capture
              </button>
            </div>
          </div>
        )}
        {savePercent != null && (
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-xs text-zinc-500">
              <span>{status || "Uploading…"}</span>
              <span>{savePercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-300"
                style={{ width: `${savePercent}%` }}
              />
            </div>
          </div>
        )}
        {status && savePercent == null && <p className="mb-3 text-sm text-teal-700 dark:text-teal-300">{status}</p>}
        <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`min-h-10 shrink-0 rounded-lg px-3 text-sm ${
                section === s.id ? "bg-teal-600 text-white" : "bg-white dark:bg-zinc-900"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === "overview" && (
          <OverviewPanel
            session={session}
            danger={danger}
            improve={improve}
            healthy={healthy}
            onGoto={(t) => setSection(t)}
          />
        )}
        {section === "findings" && <FindingsPanel findings={session.findings} />}
        {section === "network" && (
          <NetworkPanel
            rows={network}
            total={session.requests.length}
            netScope={netScope}
            setNetScope={setNetScope}
            netKind={netKind}
            setNetKind={setNetKind}
            netHideTrackers={netHideTrackers}
            setNetHideTrackers={setNetHideTrackers}
            netFailedOnly={netFailedOnly}
            setNetFailedOnly={setNetFailedOnly}
          />
        )}
        {section === "portable" && (
          <PortablePanel apis={session.portableApis} openId={portableOpen} setOpenId={setPortableOpen} />
        )}
        {section === "images" && <ImagesPanel images={imagesSorted} />}
        {section === "performance" && <PerformancePanel session={session} />}
        {section === "console" && <ConsolePanel session={session} />}
        {section === "page" && <PagePanel session={session} />}
        {section === "privacy" && <PrivacyPanel session={session} />}
        {section === "security" && <SecurityPanel session={session} />}
        {section === "runtime" && <RuntimePanel session={session} />}
        {section === "stack" && <StackPanel session={session} />}
      </main>
    </div>
  );
}

function ToolbarButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className="min-h-10 rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-700"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Chip({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "teal" | "amber" | "red" | "green" }) {
  const tones = {
    zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    teal: "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-100",
    amber: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
    red: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-100",
    green: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  };
  return <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ${tones[tone]}`}>{children}</span>;
}

function OverviewPanel({
  session,
  danger,
  improve,
  healthy,
  onGoto,
}: {
  session: AutopsySession;
  danger: AdviceCard[];
  improve: AdviceCard[];
  healthy: AdviceCard[];
  onGoto: (t: Tab) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">Capture snapshot</p>
        <p className="mt-1 text-lg font-medium">
          {formatBytes(session.performance.totalTransferBytes)} · {session.performance.requestCount} requests ·{" "}
          {danger.length} critical issues
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <button type="button" className="text-teal-700 underline" onClick={() => onGoto("findings")}>
            View findings
          </button>
          <button type="button" className="text-teal-700 underline" onClick={() => onGoto("portable")}>
            Portable APIs ({session.portableApis.length})
          </button>
          <button type="button" className="text-teal-700 underline" onClick={() => onGoto("network")}>
            Network
          </button>
        </div>
      </div>
      <AdviceList title="In danger" items={danger} tone="red" />
      <AdviceList title="Improve" items={improve} tone="amber" />
      <AdviceList title="Going well" items={healthy} tone="green" />
    </div>
  );
}

function AdviceList({
  title,
  items,
  tone,
}: {
  title: string;
  items: AdviceCard[];
  tone: "red" | "amber" | "green";
}) {
  if (!items.length) return null;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-3 space-y-3">
        {items.map((a) => (
          <li key={a.id} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={tone}>{a.severity}</Chip>
              <Chip>{a.area}</Chip>
              <span className="font-medium text-sm">{a.title}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{a.whyItMatters}</p>
            <p className="mt-1 text-sm text-teal-800 dark:text-teal-200">→ {a.suggestion}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FindingsPanel({ findings }: { findings: Finding[] }) {
  if (!findings.length) {
    return <EmptyState title="No findings yet" body="Browse the page a bit more, then check back." />;
  }
  return (
    <ul className="space-y-3">
      {findings.map((f) => {
        const url = typeof f.detail?.url === "string" ? f.detail.url : undefined;
        const status = f.detail?.status != null ? String(f.detail.status) : undefined;
        const method = typeof f.detail?.method === "string" ? f.detail.method : undefined;
        const duration =
          typeof f.detail?.durationMs === "number" ? formatMs(f.detail.durationMs) : undefined;
        return (
          <li
            key={f.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={f.severity === "critical" || f.severity === "high" ? "red" : "amber"}>{f.severity}</Chip>
              <Chip>{f.area}</Chip>
              <Chip tone="zinc">{f.ruleId}</Chip>
            </div>
            <h3 className="mt-2 font-medium">{f.plainTitle}</h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{f.title}</p>
            {(url || status || method || duration) && (
              <dl className="mt-3 grid gap-1 text-xs text-zinc-500 sm:grid-cols-2">
                {method && (
                  <>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">Method</dt>
                    <dd>{method}</dd>
                  </>
                )}
                {status && (
                  <>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">HTTP status</dt>
                    <dd>{status}</dd>
                  </>
                )}
                {duration && (
                  <>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">Duration</dt>
                    <dd>{duration}</dd>
                  </>
                )}
                {url && (
                  <>
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300">URL</dt>
                    <dd className="break-all font-mono">{url}</dd>
                  </>
                )}
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NetworkPanel({
  rows,
  total,
  netScope,
  setNetScope,
  netKind,
  setNetKind,
  netHideTrackers,
  setNetHideTrackers,
  netFailedOnly,
  setNetFailedOnly,
}: {
  rows: NetworkEntry[];
  total: number;
  netScope: NetScope;
  setNetScope: (v: NetScope) => void;
  netKind: NetKind;
  setNetKind: (v: NetKind) => void;
  netHideTrackers: boolean;
  setNetHideTrackers: (v: boolean) => void;
  netFailedOnly: boolean;
  setNetFailedOnly: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        Showing {rows.length} of {total} requests. Default view focuses on this site’s APIs and hides trackers.
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["site", "Site family"],
            ["first", "First-party only"],
            ["third", "Third-party"],
            ["all", "All hosts"],
          ] as const
        ).map(([id, label]) => (
          <FilterBtn key={id} active={netScope === id} onClick={() => setNetScope(id)}>
            {label}
          </FilterBtn>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["api", "all", "script", "stylesheet", "image", "font", "other"] as const).map((f) => (
          <FilterBtn key={f} active={netKind === f} onClick={() => setNetKind(f)}>
            {f}
          </FilterBtn>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={netHideTrackers}
            onChange={(e) => setNetHideTrackers(e.target.checked)}
          />
          Hide Google / Microsoft / trackers
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={netFailedOnly} onChange={(e) => setNetFailedOnly(e.target.checked)} />
          Failed / 4xx–5xx only
        </label>
      </div>
      <div className="overflow-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Method</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Party</th>
              <th className="px-2 py-2">ms</th>
              <th className="px-2 py-2">Size</th>
              <th className="px-2 py-2">URL</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(-400).map((r) => (
              <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-2 py-1">{r.status ?? (r.failed ? "ERR" : "—")}</td>
                <td className="px-2 py-1">{r.method}</td>
                <td className="px-2 py-1">{r.resourceType}</td>
                <td className="px-2 py-1">{r.firstParty ? "1st" : "3rd"}</td>
                <td className="px-2 py-1">{r.durationMs?.toFixed(0) ?? "—"}</td>
                <td className="px-2 py-1">{r.transferSize != null ? formatBytes(r.transferSize) : "—"}</td>
                <td className="max-w-xl truncate px-2 py-1 font-mono" title={r.url}>
                  {shortUrl(r.url, 96)}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">
                  No requests match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-lg px-2 text-xs ${
        active ? "bg-teal-600 text-white" : "bg-white dark:bg-zinc-900"
      }`}
    >
      {children}
    </button>
  );
}

function PortablePanel({
  apis,
  openId,
  setOpenId,
}: {
  apis: PortableApi[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  if (!apis.length) {
    return (
      <EmptyState
        title="No portable APIs yet"
        body="Interact with the page so XHR/fetch calls appear. Trackers and browser-bound calls are excluded."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {apis.map((a) => {
        const open = openId === a.id;
        return (
          <li
            key={a.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{a.humanName}</h3>
                  <Chip tone="teal">{a.replayClass}</Chip>
                  {a.authType && <Chip tone="amber">{a.authType}</Chip>}
                  {a.status != null && <Chip tone={a.status >= 400 ? "red" : "green"}>{a.status}</Chip>}
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{a.purpose}</p>
              </div>
              <button
                type="button"
                className="text-xs text-teal-700 underline"
                onClick={() => setOpenId(open ? null : a.id)}
              >
                {open ? "Hide details" : "Show details"}
              </button>
            </div>
            <code className="mt-2 block truncate text-xs text-zinc-500">
              {a.method} {a.url}
            </code>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
              {a.durationMs != null && <span>Duration {formatMs(a.durationMs)}</span>}
              <span>
                Replay:{" "}
                {a.replayClass === "portable-public"
                  ? "callable without browser cookies"
                  : a.replayClass === "portable-token"
                    ? "needs an API token (seen in the request)"
                    : a.replayClass === "session-cookie"
                      ? "tied to a logged-in browser session"
                      : "bound to browser challenges"}
              </span>
            </div>
            {open && (
              <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                {a.headers && Object.keys(a.headers).length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-zinc-500">Request headers</h4>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-zinc-950 p-2 text-[10px] text-zinc-100">
                      {JSON.stringify(a.headers, null, 2)}
                    </pre>
                  </div>
                )}
                {a.body && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-zinc-500">Body</h4>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-zinc-950 p-2 text-[10px] text-zinc-100">
                      {a.body.slice(0, 4000)}
                    </pre>
                  </div>
                )}
                {a.redactedCodegen && (
                  <div className="grid gap-2 md:grid-cols-3">
                    {(["curl", "fetch", "python"] as const).map((lang) => (
                      <div key={lang}>
                        <h4 className="text-xs font-semibold uppercase text-zinc-500">{lang}</h4>
                        <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-zinc-950 p-2 text-[10px] text-zinc-100">
                          {a.redactedCodegen![lang]}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ImagesPanel({ images }: { images: ImageEntry[] }) {
  if (!images.length) {
    return <EmptyState title="No images captured" body="Images from the DOM appear here after the page loads." />;
  }
  const total = images.reduce((s, i) => s + (i.bytes ?? 0), 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        {images.length} images · known transfer size {formatBytes(total)} (sorted largest first). Use this to spot
        storage / bandwidth hogs.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {images.map((img, i) => (
          <a
            key={`${img.url}-${i}`}
            href={img.url}
            target="_blank"
            rel="noreferrer"
            className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="relative aspect-square bg-zinc-100 dark:bg-zinc-800">
              <img src={img.url} alt={img.alt || ""} className="h-full w-full object-cover" />
              <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-1">
                <Chip tone={img.broken ? "red" : "teal"}>
                  {img.bytes != null ? formatBytes(img.bytes) : "size unknown"}
                </Chip>
                {(img.naturalWidth || img.width) && (
                  <Chip>
                    {img.naturalWidth || img.width}×{img.naturalHeight || img.height}
                  </Chip>
                )}
              </div>
            </div>
            <div className="space-y-0.5 p-2">
              <div className="truncate text-[10px] text-zinc-500" title={img.url}>
                {shortUrl(img.url, 48)}
              </div>
              {img.lazy && <div className="text-[10px] text-zinc-400">lazy</div>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function PerformancePanel({ session }: { session: AutopsySession }) {
  const p = session.performance;
  const cards: Array<{ label: string; value: string; meaning: string }> = [
    {
      label: "Transfer",
      value: formatBytes(p.totalTransferBytes),
      meaning: "Total bytes downloaded over the network for this page load (compressed transfer size).",
    },
    {
      label: "Requests",
      value: String(p.requestCount),
      meaning: "How many HTTP requests fired. More requests usually means more latency and battery use.",
    },
    {
      label: "TTFB",
      value: p.ttfbMs != null ? formatMs(p.ttfbMs) : "—",
      meaning: "Time to first byte — how long until the server started responding to the document.",
    },
    {
      label: "LCP",
      value: p.lcpMs != null ? formatMs(p.lcpMs) : "—",
      meaning: "Largest Contentful Paint — when the main visible content finished painting. Aim under ~2.5s.",
    },
    {
      label: "FCP",
      value: p.fcpMs != null ? formatMs(p.fcpMs) : "—",
      meaning: "First Contentful Paint — when the user first sees any text or image.",
    },
    {
      label: "CLS",
      value: p.cls != null ? p.cls.toFixed(3) : "—",
      meaning: "Cumulative Layout Shift — how much the layout jumped while loading. Lower is better (under 0.1).",
    },
    {
      label: "Load",
      value: p.loadEventMs != null ? formatMs(p.loadEventMs) : "—",
      meaning: "Window load event — document and dependent resources finished loading.",
    },
    {
      label: "Failed",
      value: String(p.failedCount),
      meaning: "Requests that errored or returned failure statuses. These often break UI sections.",
    },
    {
      label: "1st party",
      value: `${formatBytes(p.firstPartyBytes)} · ${p.firstPartyRequests} req`,
      meaning: "Traffic to the same host as the page — usually your app’s own assets and APIs.",
    },
    {
      label: "3rd party",
      value: `${formatBytes(p.thirdPartyBytes)} · ${p.thirdPartyRequests} req`,
      meaning: "Traffic to other hosts (CDNs, ads, analytics). Often the source of surprise weight.",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{c.label}</div>
            <div className="mt-1 text-xl font-semibold">{c.value}</div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">{c.meaning}</p>
          </div>
        ))}
      </div>
      {p.slowestApis?.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-semibold">Slowest APIs</h3>
          <p className="mt-1 text-xs text-zinc-500">Calls that kept the UI waiting the longest.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {p.slowestApis.slice(0, 8).map((a, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate font-mono text-xs">{shortUrl(a.url)}</span>
                <span className="shrink-0 text-zinc-500">{formatMs(a.durationMs)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {p.largestResources?.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-semibold">Largest resources</h3>
          <p className="mt-1 text-xs text-zinc-500">Heaviest downloads — prime candidates to compress or defer.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {p.largestResources.slice(0, 8).map((a, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate font-mono text-xs">
                  [{a.type}] {shortUrl(a.url)}
                </span>
                <span className="shrink-0 text-zinc-500">{formatBytes(a.bytes)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {(p.lcpElement || p.clsElement) && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {p.lcpElement && (
            <p>
              <span className="font-medium">LCP element:</span>{" "}
              <code className="text-xs">{p.lcpElement}</code>
            </p>
          )}
          {p.clsElement && (
            <p className="mt-2">
              <span className="font-medium">CLS source:</span>{" "}
              <code className="text-xs">{p.clsElement}</code>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function ConsolePanel({ session }: { session: AutopsySession }) {
  if (!session.console.length) {
    return <EmptyState title="No console noise" body="Errors and warnings from the page will show up here." />;
  }
  return (
    <ul className="space-y-2">
      {session.console.map((c, i) => (
        <li
          key={i}
          className="rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center gap-2">
            <Chip tone={c.level === "error" ? "red" : c.level === "warn" ? "amber" : "zinc"}>{c.level}</Chip>
            <span className="text-xs text-zinc-400">{new Date(c.timestamp).toLocaleTimeString()}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words">{c.message}</p>
          {c.stack && (
            <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-zinc-950 p-2 text-[10px] text-zinc-300">
              {c.stack}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}

function PagePanel({ session }: { session: AutopsySession }) {
  const { seo, dom, forms, links } = session;
  return (
    <div className="space-y-4">
      <InfoCard title="SEO">
        <KV label="Title" value={seo.title || "—"} />
        <KV label="Description" value={seo.description || "—"} />
        <KV label="Canonical" value={seo.canonical || "—"} />
        <KV label="OG title" value={seo.ogTitle || "—"} />
        <KV label="H1 count" value={String(seo.h1Count ?? 0)} />
        <KV label="JSON-LD" value={String(seo.jsonLdCount ?? 0)} />
      </InfoCard>
      <InfoCard title="DOM health">
        <KV label="Nodes" value={String(dom.nodeCount ?? "—")} />
        <KV label="Max depth" value={String(dom.maxDepth ?? "—")} />
        <KV label="Iframes" value={String(dom.iframeCount ?? "—")} />
        <KV label="Scripts" value={String(session.scripts.length)} />
      </InfoCard>
      <InfoCard title={`Forms (${forms.length})`}>
        {forms.slice(0, 12).map((f, i) => (
          <div key={i} className="border-t border-zinc-100 py-2 text-sm first:border-0 dark:border-zinc-800">
            <div className="font-medium">
              {(f.method || "GET").toUpperCase()} {f.action || "(same page)"}
            </div>
            <div className="text-xs text-zinc-500">
              {f.fieldCount} fields
              {f.missingLabels ? ` · ${f.missingLabels} missing labels` : ""}
              {f.insecureAction ? " · insecure http action" : ""}
            </div>
          </div>
        ))}
        {!forms.length && <p className="text-sm text-zinc-500">No forms detected.</p>}
      </InfoCard>
      <InfoCard title={`Links (sample ${Math.min(links.length, 30)})`}>
        <ul className="max-h-64 space-y-1 overflow-auto text-xs">
          {links.slice(0, 30).map((l, i) => (
            <li key={i} className="truncate">
              {l.external ? "[ext] " : ""}
              {l.text || l.href}
            </li>
          ))}
        </ul>
      </InfoCard>
    </div>
  );
}

function PrivacyPanel({ session }: { session: AutopsySession }) {
  return (
    <div className="space-y-4">
      <InfoCard title={`Trackers (${session.trackers.length})`}>
        {session.trackers.length ? (
          <ul className="space-y-2">
            {session.trackers.map((t, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <Chip tone="amber">{t.type}</Chip>
                <span className="font-medium">{t.name}</span>
                <span className="text-xs text-zinc-500">{t.domain}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No known trackers matched.</p>
        )}
      </InfoCard>
      <InfoCard title={`Cookies (${session.cookies.length})`}>
        <ul className="max-h-72 space-y-2 overflow-auto text-sm">
          {session.cookies.slice(0, 40).map((c, i) => (
            <li key={i} className="rounded-lg border border-zinc-100 p-2 dark:border-zinc-800">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-zinc-500">
                {c.domain || "—"} · {c.httpOnly ? "HttpOnly " : ""}
                {c.secure ? "Secure " : ""}
                {c.sameSite || ""}
              </div>
            </li>
          ))}
        </ul>
      </InfoCard>
      <InfoCard title={`Fingerprinting probes (${session.fingerprinting.length})`}>
        {session.fingerprinting.length ? (
          <ul className="space-y-1 text-sm">
            {session.fingerprinting.slice(0, 30).map((f, i) => (
              <li key={i}>
                <code className="text-xs">{f.api}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No fingerprinting API probes recorded.</p>
        )}
      </InfoCard>
    </div>
  );
}

function SecurityPanel({ session }: { session: AutopsySession }) {
  const s = session.security;
  const h = s.headers || {};
  const present = (status?: number) =>
    status != null && status >= 200 && status < 400 ? `Yes (${status})` : status != null ? `HTTP ${status}` : "Not found";
  return (
    <div className="space-y-4">
      <InfoCard title="Security headers">
        <KV label="CSP" value={s.hasCsp ? h["content-security-policy"] || "Present" : "Missing"} />
        <KV label="HSTS" value={s.hasHsts ? h["strict-transport-security"] || "Present" : "Missing"} />
        <KV label="X-Frame-Options" value={s.hasXfo ? h["x-frame-options"] || "Present" : "Missing"} />
        <KV
          label="Referrer-Policy"
          value={s.hasReferrerPolicy ? h["referrer-policy"] || "Present" : "Missing"}
        />
        <KV
          label="Permissions-Policy"
          value={s.hasPermissionsPolicy ? h["permissions-policy"] || "Present" : "Missing"}
        />
        <KV
          label="Mixed content"
          value={s.mixedContentUrls?.length ? `${s.mixedContentUrls.length} URLs` : "None"}
        />
      </InfoCard>
      <InfoCard title="Well-known files">
        <KV label="robots.txt" value={present(session.wellKnown.robotsTxt?.status)} />
        <KV label="sitemap.xml" value={present(session.wellKnown.sitemapXml?.status)} />
        <KV label="security.txt" value={present(session.wellKnown.securityTxt?.status)} />
        <KV label="manifest" value={present(session.wellKnown.manifest?.status)} />
      </InfoCard>
      <InfoCard title="Scripts without SRI">
        <p className="mb-2 text-xs text-zinc-500">
          Third-party scripts should use Subresource Integrity so a CDN compromise cannot inject code.
        </p>
        <ul className="max-h-48 space-y-1 overflow-auto text-xs">
          {session.scripts
            .filter((sc) => sc.src && !sc.firstParty && !sc.hasSri)
            .slice(0, 20)
            .map((sc, i) => (
              <li key={i} className="truncate font-mono">
                {sc.src}
              </li>
            ))}
        </ul>
      </InfoCard>
    </div>
  );
}

function RuntimePanel({ session }: { session: AutopsySession }) {
  const r = session.runtime;
  return (
    <div className="space-y-4">
      <InfoCard title="Service workers & caches">
        <KV label="Service workers" value={String(r.serviceWorkers?.length ?? 0)} />
        <KV label="Cache names" value={String(r.cacheNames?.length ?? 0)} />
        <KV label="IndexedDB DBs" value={String(r.indexedDbNames?.length ?? 0)} />
        <KV label="Workers" value={String(r.workerCount ?? 0)} />
      </InfoCard>
      <InfoCard title="Service worker URLs">
        {r.serviceWorkers?.length ? (
          <ul className="space-y-1 text-xs font-mono">
            {r.serviceWorkers.map((u, i) => (
              <li key={i} className="truncate">
                {u}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">None registered (or not yet readable).</p>
        )}
      </InfoCard>
      <InfoCard title="Source maps">
        {r.sourceMapUrls?.length ? (
          <ul className="max-h-48 space-y-1 overflow-auto text-xs font-mono">
            {r.sourceMapUrls.map((u, i) => (
              <li key={i} className="truncate">
                {u}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No source map URLs detected in script tags.</p>
        )}
      </InfoCard>
      <InfoCard title="Storage keys">
        <KV label="localStorage" value={String(Object.keys(session.storage.local || {}).length)} />
        <KV label="sessionStorage" value={String(Object.keys(session.storage.session || {}).length)} />
        <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
          {Object.keys(session.storage.local || {})
            .slice(0, 20)
            .map((k) => (
              <li key={k} className="truncate font-mono">
                local: {k}
              </li>
            ))}
        </ul>
      </InfoCard>
    </div>
  );
}

function StackPanel({ session }: { session: AutopsySession }) {
  if (!session.stack.length) {
    return <EmptyState title="No stack signals" body="Frameworks and libraries will appear when detected." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {session.stack.map((s, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center gap-2">
            <Chip tone="teal">{s.category}</Chip>
            <h3 className="font-semibold">{s.name}</h3>
          </div>
          {s.evidence && <p className="mt-2 text-xs text-zinc-500">{s.evidence}</p>}
        </div>
      ))}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 space-y-1">{children}</div>
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="break-words text-zinc-800 dark:text-zinc-100">{value}</dd>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
    </div>
  );
}

const root = document.getElementById("root") || document.body.appendChild(document.createElement("div"));
root.id = "root";
createRoot(root).render(<App />);
