import React, { useEffect, useState } from "react";
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

function Sidepanel() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [session, setSession] = useState<AutopsySession | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const tick = async () => {
      const id = await getActiveTabId();
      setTabId(id);
      if (id != null) {
        const data = await fetchSession(id);
        setSession(enrichSession(data.session));
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 2000);
    return () => clearInterval(t);
  }, []);

  const danger = session?.advice.filter((a) => a.kind === "danger").length ?? 0;

  return (
    <div className="min-h-screen space-y-3 bg-zinc-50 p-3 text-sm text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="font-semibold">Web Autopsy</div>
      <p className="truncate text-xs text-zinc-500">{session?.pageUrl || "No active page"}</p>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Requests" value={String(session?.performance.requestCount ?? 0)} />
        <Stat label="In danger" value={String(danger)} />
        <Stat
          label="Size"
          value={`${((session?.performance.totalTransferBytes ?? 0) / 1024).toFixed(0)} KB`}
        />
        <Stat label="Portable" value={String(session?.portableApis.length ?? 0)} />
      </div>
      <ul className="space-y-1">
        {(session?.requests || [])
          .filter((r) => r.resourceType === "fetch" || r.resourceType === "xhr")
          .slice(-8)
          .reverse()
          .map((r) => (
            <li key={r.id} className="truncate rounded-lg bg-white px-2 py-1 text-[11px] dark:bg-zinc-900">
              {r.status ?? "…"} {r.method} {r.url}
            </li>
          ))}
      </ul>
      {msg && <p className="text-xs text-teal-700">{msg}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="min-h-10 rounded-lg bg-teal-600 text-xs font-semibold text-white"
          onClick={() => {
            if (tabId == null) return;
            void saveToCloud(tabId)
              .then((r) => setMsg(`Saved ${r.id}`))
              .catch((e) => setMsg(e.message));
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="min-h-10 rounded-lg border border-zinc-200 text-xs dark:border-zinc-700"
          onClick={() => {
            if (tabId == null) return;
            void downloadRebuildKit(tabId).then(() => setMsg("Downloaded"));
          }}
        >
          Download
        </button>
        <button
          type="button"
          className="col-span-2 min-h-10 rounded-lg border border-zinc-200 text-xs dark:border-zinc-700"
          onClick={() => {
            if (tabId == null) return;
            void chrome.tabs.create({
              url: chrome.runtime.getURL(`/inspector.html?tabId=${tabId}`),
            });
          }}
        >
          Open inspector
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[10px] uppercase text-zinc-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Sidepanel />);
