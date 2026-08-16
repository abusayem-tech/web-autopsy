import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AutopsySession } from "@web-autopsy/core";
import { enrichSession } from "@web-autopsy/core";
import {
  confirmSwitchPage,
  downloadRebuildKit,
  extensionAlive,
  fetchSession,
  getActiveTabId,
  isExtensionContextInvalidated,
  refreshCapture,
  saveToCloud,
} from "../../lib/session";
import { UrlLine } from "../../lib/url-ui";
import "~/assets/style.css";

function Sidepanel() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [session, setSession] = useState<AutopsySession | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingPage, setPendingPage] = useState<{ url: string; title?: string } | null>(null);
  const [trackedUrl, setTrackedUrl] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled || refreshingRef.current || !extensionAlive()) return;
      try {
        const id = await getActiveTabId();
        if (cancelled) return;
        setTabId(id);
        if (id != null) {
          const data = await fetchSession(id);
          if (cancelled || refreshingRef.current) return;
          setSession(enrichSession(data.session));
          setPendingPage(data.pendingPage ?? null);
          setTrackedUrl(data.trackedUrl ?? data.session.pageUrl);
        }
      } catch (e) {
        if (isExtensionContextInvalidated(e)) {
          cancelled = true;
          setMsg("Extension was reloaded — close and reopen this panel.");
          return;
        }
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const danger = session?.advice.filter((a) => a.kind === "danger").length ?? 0;

  return (
    <div className="min-h-screen min-w-0 space-y-3 overflow-x-hidden bg-zinc-50 p-3 text-sm text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="font-semibold">Web Autopsy</div>
      {(trackedUrl || session?.pageUrl) && (
        <UrlLine url={trackedUrl || session!.pageUrl} className="text-xs" mono={false} />
      )}
      {!trackedUrl && !session?.pageUrl && (
        <p className="text-xs text-zinc-500">No active page</p>
      )}

      {pendingPage && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
          <p className="font-semibold">New page detected</p>
          <div className="mt-1 opacity-90">
            <UrlLine url={pendingPage.url} className="text-xs" mono={false} />
          </div>
          <p className="mt-1">Old capture stays until you switch.</p>
          <button
            type="button"
            disabled={switching || tabId == null}
            className="mt-2 min-h-9 w-full rounded-lg bg-teal-600 text-xs font-semibold text-white disabled:opacity-60"
            onClick={() => {
              if (tabId == null) return;
              setSwitching(true);
              void confirmSwitchPage(tabId)
                .then(async (r) => {
                  if (!r.ok) throw new Error(r.error || "Switch failed");
                  if (r.reloaded) await new Promise((x) => setTimeout(x, 1500));
                  const data = await fetchSession(tabId);
                  setSession(enrichSession(data.session));
                  setPendingPage(data.pendingPage ?? null);
                  setTrackedUrl(data.trackedUrl ?? null);
                  setMsg("Tracking new page");
                })
                .catch((e) => setMsg(e.message))
                .finally(() => setSwitching(false));
            }}
          >
            {switching ? "Switching…" : "Clear & track new page"}
          </button>
        </div>
      )}

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
            <li
              key={r.id}
              className="rounded-lg bg-white px-2 py-1 font-mono text-[11px] dark:bg-zinc-900"
            >
              <span className="text-zinc-500">
                {r.status ?? "…"} {r.method}{" "}
              </span>
              <UrlLine url={r.url} className="text-[11px]" />
            </li>
          ))}
      </ul>
      {msg && <p className="text-xs text-teal-700">{msg}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={refreshing || switching || tabId == null}
          className="min-h-10 rounded-lg border border-zinc-200 text-xs dark:border-zinc-700 disabled:opacity-60"
          onClick={() => {
            if (tabId == null) return;
            setRefreshing(true);
            refreshingRef.current = true;
            setSession(null);
            setPendingPage(null);
            setMsg("Clearing and reloading…");
            void refreshCapture(tabId)
              .then(async (r) => {
                if (!r.ok) throw new Error(r.error || "Refresh failed");
                if (r.reloaded) await new Promise((x) => setTimeout(x, 1500));
                const data = await fetchSession(tabId);
                setSession(enrichSession(data.session));
                setPendingPage(data.pendingPage ?? null);
                setTrackedUrl(data.trackedUrl ?? data.session.pageUrl);
                setMsg("Fresh capture ready");
              })
              .catch((e) => setMsg(e.message))
              .finally(() => {
                refreshingRef.current = false;
                setRefreshing(false);
              });
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
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
          className="min-h-10 rounded-lg border border-zinc-200 text-xs dark:border-zinc-700"
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
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[10px] uppercase text-zinc-500">{label}</div>
      <div className="break-all font-semibold">{value}</div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Sidepanel />);
