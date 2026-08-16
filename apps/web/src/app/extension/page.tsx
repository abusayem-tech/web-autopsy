"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Download, Loader2, PlugZap, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  EXTENSION_ZIP_HREF,
  pairExtension,
  pingExtension,
  type ExtensionPing,
} from "@/lib/extension-bridge";

type Phase =
  | "checking"
  | "need-login"
  | "need-install"
  | "ready-to-pair"
  | "pairing"
  | "paired"
  | "error";

export default function ExtensionInstallPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [ping, setPing] = useState<ExtensionPing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ version?: string; bytes?: number } | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const session = await authClient.getSession();
    const loggedIn = Boolean(session.data?.user);
    const status = await pingExtension();
    setPing(status);

    if (!loggedIn) {
      setPhase("need-login");
      return;
    }
    if (!status?.ok) {
      setPhase("need-install");
      return;
    }
    if (status.paired) {
      setPhase("paired");
      return;
    }
    setPhase("ready-to-pair");
  }, []);

  useEffect(() => {
    void fetch("/extension/latest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setMeta(d);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While waiting for install, keep probing so pairing can finish with zero extra clicks.
  useEffect(() => {
    if (phase !== "need-install" && phase !== "ready-to-pair") return;
    const id = window.setInterval(() => {
      void (async () => {
        const session = await authClient.getSession();
        if (!session.data?.user) return;
        const status = await pingExtension();
        if (!status?.ok) return;
        setPing(status);
        if (status.paired) {
          setPhase("paired");
          return;
        }
        // Extension just appeared — auto-pair without another click.
        setPhase("pairing");
        try {
          const res = await fetch("/api/extension/pair", { method: "POST" });
          if (res.status === 401) {
            setPhase("need-login");
            return;
          }
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || "Could not create extension token");
          }
          const data = (await res.json()) as { token: string; apiBaseUrl: string };
          const paired = await pairExtension({ apiBaseUrl: data.apiBaseUrl, apiToken: data.token });
          if (!paired.ok) throw new Error(paired.error || "Extension did not accept credentials");
          setPhase("paired");
          setPing({ ok: true, paired: true, apiBaseUrl: data.apiBaseUrl });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Auto-connect failed");
          setPhase("ready-to-pair");
        }
      })();
    }, 1500);
    return () => window.clearInterval(id);
  }, [phase]);

  async function connectNow() {
    setError(null);
    setPhase("pairing");
    try {
      const res = await fetch("/api/extension/pair", { method: "POST" });
      if (res.status === 401) {
        setPhase("need-login");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Could not create extension token");
      }
      const data = (await res.json()) as { token: string; apiBaseUrl: string };
      const paired = await pairExtension({ apiBaseUrl: data.apiBaseUrl, apiToken: data.token });
      if (!paired.ok) throw new Error(paired.error || "Extension did not accept credentials");
      setPhase("paired");
      setPing({ ok: true, paired: true, apiBaseUrl: data.apiBaseUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
      setPhase("error");
    }
  }

  function beginInstall() {
    const a = document.createElement("a");
    a.href = EXTENSION_ZIP_HREF;
    a.download = "web-autopsy-chrome.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    void navigator.clipboard.writeText("chrome://extensions").catch(() => undefined);
    setPhase("need-install");
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-teal-50/70 via-zinc-50 to-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-xs text-white">WA</span>
            Web Autopsy
          </Link>
          <Link href="/captures" className="text-sm font-medium text-teal-700 hover:underline">
            Archive
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <p className="text-sm font-medium uppercase tracking-wide text-teal-700">Chrome extension</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Connect in one click</h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-600">
          This site creates your extension token and pushes it into Chrome automatically. You never copy secrets by hand.
        </p>
        {meta?.version && (
          <p className="mt-2 text-sm text-zinc-500">
            Package v{meta.version}
            {meta.bytes ? ` · ${Math.round(meta.bytes / 1024)} KB` : ""}
          </p>
        )}

        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          {phase === "checking" && (
            <StatusRow icon={<Loader2 className="h-5 w-5 animate-spin" />} title="Checking Chrome…" />
          )}

          {phase === "need-login" && (
            <div className="space-y-4">
              <StatusRow icon={<ShieldCheck className="h-5 w-5" />} title="Sign in to connect your account" />
              <p className="text-sm text-zinc-600">
                Auto-setup creates an API token under your workspace and injects it into the extension.
              </p>
              <button
                type="button"
                onClick={() => router.push("/?next=/extension")}
                className="inline-flex min-h-12 items-center rounded-2xl bg-teal-600 px-5 text-base font-semibold text-white"
              >
                Sign in to continue
              </button>
            </div>
          )}

          {phase === "need-install" && (
            <div className="space-y-4">
              <StatusRow
                icon={<Download className="h-5 w-5" />}
                title="Install the extension once (Chrome requirement)"
              />
              <p className="text-sm text-zinc-600">
                Google Chrome blocks websites from installing extensions silently. After this one Load unpacked, leave
                this tab open — we detect the extension and finish token setup automatically.
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-600">
                <li>Click below to download the ZIP (<code className="rounded bg-zinc-100 px-1">chrome://extensions</code> is copied for you).</li>
                <li>Unzip → Chrome extensions → enable Developer mode → <strong>Load unpacked</strong> → select the folder.</li>
                <li>Return here — pairing completes by itself.</li>
              </ol>
              <button
                type="button"
                onClick={beginInstall}
                className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-teal-600 px-5 text-base font-semibold text-white"
              >
                <Download className="h-5 w-5" />
                Download &amp; wait for auto-connect
              </button>
              <p className="text-xs text-zinc-500">Listening for the extension…</p>
            </div>
          )}

          {(phase === "ready-to-pair" || phase === "error") && (
            <div className="space-y-4">
              <StatusRow
                icon={<PlugZap className="h-5 w-5" />}
                title="Extension detected — connect your archive"
              />
              <p className="text-sm text-zinc-600">
                We will mint a token named <strong>Chrome extension (auto)</strong> and push the API URL + token into
                Chrome storage. Nothing to paste.
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button"
                onClick={() => void connectNow()}
                className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-teal-600 px-5 text-base font-semibold text-white"
              >
                <PlugZap className="h-5 w-5" />
                Connect automatically
              </button>
            </div>
          )}

          {phase === "pairing" && (
            <StatusRow icon={<Loader2 className="h-5 w-5 animate-spin" />} title="Creating token and pairing…" />
          )}

          {phase === "paired" && (
            <div className="space-y-4">
              <StatusRow icon={<Check className="h-5 w-5 text-teal-700" />} title="Connected" success />
              <p className="text-sm text-zinc-600">
                The extension is linked to{" "}
                <code className="rounded bg-zinc-100 px-1">{ping?.apiBaseUrl || "this site"}</code>. Browse any site,
                open Web Autopsy, then click <strong>Save</strong>.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/captures"
                  className="inline-flex min-h-11 items-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white"
                >
                  Go to captures
                </Link>
                <button
                  type="button"
                  onClick={() => void connectNow()}
                  className="inline-flex min-h-11 items-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-800"
                >
                  Re-pair token
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-zinc-500">
          True silent install is only possible via the Chrome Web Store. Token setup on this site is fully automatic once
          the extension is present.
        </p>
      </main>
    </div>
  );
}

function StatusRow({
  icon,
  title,
  success,
}: {
  icon: React.ReactNode;
  title: string;
  success?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${success ? "bg-teal-50 text-teal-700" : "bg-zinc-100 text-zinc-700"}`}
      >
        {icon}
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}
