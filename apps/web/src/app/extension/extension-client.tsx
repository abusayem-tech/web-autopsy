"use client";

import Link from "next/link";
import { Check, Download, Loader2, PlugZap } from "lucide-react";
import { EXTENSION_ZIP_HREF } from "@/lib/extension-bridge";
import { useExtension } from "@/components/extension-provider";

export function ExtensionClient() {
  const { status, ping, error, refreshing, connect, refresh } = useExtension();

  function beginInstall() {
    const a = document.createElement("a");
    a.href = EXTENSION_ZIP_HREF;
    a.download = "web-autopsy-chrome.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    void navigator.clipboard.writeText("chrome://extensions").catch(() => undefined);
    void refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Extension</h1>
        <p className="mt-1 text-zinc-600">
          Same app shell as Captures and Settings. Status is shared across every page.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        {status === "checking" && (
          <Row icon={<Loader2 className="h-5 w-5 animate-spin" />} title="Checking Chrome…" />
        )}

        {status === "missing" && (
          <div className="space-y-4">
            <Row icon={<Download className="h-5 w-5" />} title="Extension not installed" />
            <p className="text-sm text-zinc-600">
              Chrome blocks silent installs from websites. Download once, Load unpacked, then return here — we detect it
              and connect the token automatically.
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-600">
              <li>Download the ZIP (<code className="rounded bg-zinc-100 px-1">chrome://extensions</code> is copied).</li>
              <li>Unzip → Developer mode → Load unpacked → select the folder with manifest.json.</li>
              <li>Stay signed in — this page finishes pairing by itself.</li>
            </ol>
            <button
              type="button"
              onClick={beginInstall}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white"
            >
              <Download className="h-4 w-4" />
              Download &amp; wait for auto-connect
            </button>
            {refreshing && <p className="text-xs text-zinc-500">Listening for the extension…</p>}
          </div>
        )}

        {status === "installed" && (
          <div className="space-y-4">
            <Row icon={<PlugZap className="h-5 w-5" />} title="Installed — connecting account…" />
            <p className="text-sm text-zinc-600">Minting an API token and pushing it into Chrome storage.</p>
            {error && (
              <div className="space-y-3">
                <p className="text-sm text-red-600">{error}</p>
                <button
                  type="button"
                  onClick={() => void connect()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white"
                >
                  Retry connect
                </button>
              </div>
            )}
          </div>
        )}

        {status === "connected" && (
          <div className="space-y-4">
            <Row icon={<Check className="h-5 w-5 text-teal-700" />} title="Connected" />
            <p className="text-sm text-zinc-600">
              Linked to <code className="rounded bg-zinc-100 px-1">{ping?.apiBaseUrl || "this site"}</code>
              {ping?.version ? ` · extension v${ping.version}` : ""}.
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
                onClick={() => void connect()}
                className="inline-flex min-h-11 items-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-800"
              >
                Re-pair token
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}
