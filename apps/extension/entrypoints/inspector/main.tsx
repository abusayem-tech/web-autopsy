import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AutopsySession } from "@web-autopsy/core";
import { enrichSession } from "@web-autopsy/core";
import {
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

function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [session, setSession] = useState<AutopsySession | null>(null);
  const [section, setSection] = useState<Tab>("overview");
  const [paused, setPaused] = useState(false);
  const [deep, setDeep] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [netFilter, setNetFilter] = useState("all");

  async function refresh(id: number) {
    const data = await fetchSession(id);
    setSession(enrichSession(data.session));
    setPaused(data.paused);
    setDeep(data.deepCapture);
  }

  useEffect(() => {
    void getActiveTabId().then((id) => {
      setTabId(id);
      if (id != null) void refresh(id);
    });
    const t = setInterval(() => {
      if (tabId != null) void refresh(tabId);
    }, 2000);
    return () => clearInterval(t);
  }, [tabId]);

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

  if (!session) {
    return <div className="p-6 text-sm text-zinc-500">Loading session… Open a website tab first.</div>;
  }

  const danger = session.advice.filter((a) => a.kind === "danger");
  const improve = session.advice.filter((a) => a.kind === "improve");
  const healthy = session.advice.filter((a) => a.kind === "healthy");
  const network = session.requests.filter((r) => {
    if (netFilter === "all") return true;
    if (netFilter === "api") return r.resourceType === "fetch" || r.resourceType === "xhr";
    return r.resourceType === netFilter;
  });

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white p-3 md:block dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 px-2 text-sm font-semibold">Web Autopsy</div>
        <nav className="space-y-1">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`flex min-h-10 w-full items-center rounded-lg px-2 text-left text-sm ${
                section === s.id ? "bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-xl font-semibold">{session.pageTitle || session.pageUrl}</h1>
          <button
            type="button"
            className="min-h-10 rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-700"
            onClick={() => {
              if (tabId == null) return;
              void chrome.runtime
                .sendMessage({ type: "SET_PAUSED", tabId, paused: !paused })
                .then(() => refresh(tabId));
            }}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="min-h-10 rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-700"
            onClick={() => {
              if (tabId == null) return;
              void chrome.runtime
                .sendMessage({ type: "TOGGLE_DEEP_CAPTURE", tabId })
                .then(() => refresh(tabId));
            }}
          >
            Deep {deep ? "On" : "Off"}
          </button>
          <button
            type="button"
            className="min-h-10 rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-700"
            onClick={() => {
              if (tabId == null) return;
              void downloadRebuildKit(tabId).then(() => setStatus("Downloaded rebuild kit"));
            }}
          >
            Download
          </button>
          <button
            type="button"
            className="min-h-10 rounded-lg bg-teal-600 px-3 text-sm font-semibold text-white"
            onClick={() => {
              if (tabId == null) return;
              setStatus("Saving…");
              void saveToCloud(tabId)
                .then((r) => setStatus(`Saved ${r.id}`))
                .catch((e) => setStatus(e.message));
            }}
          >
            Save
          </button>
        </div>
        {status && <p className="mb-3 text-sm text-teal-700">{status}</p>}
        <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`min-h-10 shrink-0 rounded-lg px-3 text-sm ${section === s.id ? "bg-teal-600 text-white" : "bg-white dark:bg-zinc-900"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === "overview" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500">Story preview for teammates</p>
              <p className="mt-1 text-lg">
                {session.pageTitle || session.pageUrl} · {(session.performance.totalTransferBytes / 1024).toFixed(1)} KB ·{" "}
                {session.performance.requestCount} requests · {danger.length} in danger
              </p>
            </div>
            <AdviceList title="In danger" items={danger} />
            <AdviceList title="Improve" items={improve} />
            <AdviceList title="Going well" items={healthy} />
          </div>
        )}

        {section === "findings" && (
          <ul className="space-y-2">
            {session.findings.map((f) => (
              <li key={f.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="font-medium">{f.plainTitle}</div>
                <div className="text-xs text-zinc-500">
                  {f.severity} · {f.area} · {f.ruleId}
                </div>
              </li>
            ))}
          </ul>
        )}

        {section === "network" && (
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              {["all", "api", "script", "stylesheet", "image", "other"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setNetFilter(f)}
                  className={`min-h-9 rounded-lg px-2 text-xs ${netFilter === f ? "bg-teal-600 text-white" : "bg-white dark:bg-zinc-900"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="overflow-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800">
                  <tr>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">ms</th>
                    <th className="px-2 py-2">URL</th>
                  </tr>
                </thead>
                <tbody>
                  {network.slice(-300).map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-2 py-1">{r.status ?? "—"}</td>
                      <td className="px-2 py-1">{r.method}</td>
                      <td className="px-2 py-1">{r.resourceType}</td>
                      <td className="px-2 py-1">{r.durationMs?.toFixed(0) ?? "—"}</td>
                      <td className="max-w-xl truncate px-2 py-1 font-mono">{r.url}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {section === "portable" && (
          <ul className="space-y-3">
            {session.portableApis.map((a) => (
              <li key={a.id} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="font-medium">
                  {a.humanName}{" "}
                  <span className="text-xs font-normal text-zinc-500">{a.replayClass}</span>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">{a.purpose}</p>
                <code className="mt-1 block truncate text-xs">{a.method} {a.url}</code>
                {a.redactedCodegen?.curl && (
                  <pre className="mt-2 overflow-auto rounded-lg bg-zinc-950 p-2 text-[10px] text-zinc-100">
                    {a.redactedCodegen.curl}
                  </pre>
                )}
              </li>
            ))}
            {!session.portableApis.length && <p className="text-sm text-zinc-500">No portable APIs yet.</p>}
          </ul>
        )}

        {section === "images" && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {session.images.map((img, i) => (
              <a key={i} href={img.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800">
                <img src={img.url} alt={img.alt || ""} className="aspect-square w-full object-cover" />
                <div className="truncate p-2 text-[10px] text-zinc-500">{img.url}</div>
              </a>
            ))}
          </div>
        )}

        {section === "performance" && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Transfer", `${(session.performance.totalTransferBytes / 1024).toFixed(1)} KB`],
              ["Requests", String(session.performance.requestCount)],
              ["TTFB", `${session.performance.ttfbMs?.toFixed(0) ?? "—"} ms`],
              ["LCP", `${session.performance.lcpMs?.toFixed(0) ?? "—"} ms`],
              ["FCP", `${session.performance.fcpMs?.toFixed(0) ?? "—"} ms`],
              ["CLS", session.performance.cls?.toFixed(3) ?? "—"],
              ["Load", `${session.performance.loadEventMs?.toFixed(0) ?? "—"} ms`],
              ["Failed", String(session.performance.failedCount)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="text-xs text-zinc-500">{k}</div>
                <div className="text-lg font-semibold">{v}</div>
              </div>
            ))}
          </div>
        )}

        {section === "console" && (
          <ul className="space-y-2">
            {session.console.map((c, i) => (
              <li key={i} className="rounded-lg border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                <span className="font-semibold uppercase text-red-600">{c.level}</span> {c.message}
              </li>
            ))}
          </ul>
        )}

        {section === "page" && (
          <pre className="overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {JSON.stringify({ seo: session.seo, dom: session.dom, forms: session.forms.slice(0, 20) }, null, 2)}
          </pre>
        )}
        {section === "privacy" && (
          <pre className="overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {JSON.stringify({ trackers: session.trackers, cookies: session.cookies, fingerprinting: session.fingerprinting }, null, 2)}
          </pre>
        )}
        {section === "security" && (
          <pre className="overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {JSON.stringify({ security: session.security, wellKnown: session.wellKnown }, null, 2)}
          </pre>
        )}
        {section === "runtime" && (
          <pre className="overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {JSON.stringify(session.runtime, null, 2)}
          </pre>
        )}
        {section === "stack" && (
          <ul className="space-y-2">
            {session.stack.map((s, i) => (
              <li key={i} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                {s.name} <span className="text-zinc-500">({s.category})</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function AdviceList({ title, items }: { title: string; items: AutopsySession["advice"] }) {
  if (!items.length) return null;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-2 space-y-2">
        {items.map((a) => (
          <li key={a.id} className="text-sm">
            <div className="font-medium">{a.title}</div>
            <div className="text-zinc-600 dark:text-zinc-300">{a.suggestion}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const root = document.getElementById("root") || document.body.appendChild(document.createElement("div"));
root.id = "root";
createRoot(root).render(<App />);
