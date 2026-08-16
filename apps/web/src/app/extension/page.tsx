"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Download, ExternalLink, FolderOpen, Puzzle } from "lucide-react";

type ExtensionMeta = {
  version: string;
  bytes: number;
  downloadPath: string;
  updatedAt?: string;
};

const DOWNLOAD_HREF = "/extension/web-autopsy-chrome.zip";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ExtensionInstallPage() {
  const [meta, setMeta] = useState<ExtensionMeta | null>(null);
  const [copied, setCopied] = useState(false);
  const [stepDone, setStepDone] = useState<Record<number, boolean>>({});

  useEffect(() => {
    void fetch("/extension/latest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setMeta(d);
      })
      .catch(() => undefined);
  }, []);

  function mark(step: number) {
    setStepDone((s) => ({ ...s, [step]: true }));
  }

  async function copyExtensionsUrl() {
    try {
      await navigator.clipboard.writeText("chrome://extensions");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function startInstall() {
    // Trigger download, then scroll to guided steps.
    const a = document.createElement("a");
    a.href = DOWNLOAD_HREF;
    a.download = "web-autopsy-chrome.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    mark(1);
    document.getElementById("install-steps")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const version = meta?.version ?? "0.1.0";
  const sizeLabel = meta ? formatBytes(meta.bytes) : "…";

  return (
    <div className="min-h-dvh bg-gradient-to-b from-teal-50/70 via-zinc-50 to-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-xs text-white">WA</span>
            Web Autopsy
          </Link>
          <Link href="/" className="text-sm font-medium text-teal-700 hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-teal-700">Chrome extension</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Install Web Autopsy</h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600">
            Chrome does not allow websites to inject extensions automatically. Download the package from this site, then
            load it once in Developer mode — about a minute.
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Version {version} · {sizeLabel} · Manifest V3
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={startInstall}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 text-base font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            <Download className="h-5 w-5" />
            Download &amp; install
          </button>
          <a
            href={DOWNLOAD_HREF}
            download="web-autopsy-chrome.zip"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-5 text-base font-semibold text-zinc-800 transition hover:bg-zinc-50"
          >
            Download ZIP only
          </a>
        </div>

        <section id="install-steps" className="mt-12 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Guided install</h2>

          <Step
            n={1}
            title="Download the ZIP"
            done={stepDone[1]}
            icon={Download}
            action={
              <a
                href={DOWNLOAD_HREF}
                download="web-autopsy-chrome.zip"
                onClick={() => mark(1)}
                className="text-sm font-semibold text-teal-700 hover:underline"
              >
                web-autopsy-chrome.zip
              </a>
            }
          >
            Save it somewhere easy to find (Downloads is fine).
          </Step>

          <Step n={2} title="Unzip the file" done={stepDone[2]} icon={FolderOpen} onDone={() => mark(2)}>
            Double-click the ZIP. You should get a folder that contains <code className="rounded bg-zinc-100 px-1">manifest.json</code>
            .
          </Step>

          <Step
            n={3}
            title="Open Chrome extensions"
            done={stepDone[3]}
            icon={Puzzle}
            action={
              <button
                type="button"
                onClick={() => {
                  void copyExtensionsUrl();
                  mark(3);
                }}
                className="text-sm font-semibold text-teal-700 hover:underline"
              >
                {copied ? "Copied!" : "Copy chrome://extensions"}
              </button>
            }
          >
            Paste <code className="rounded bg-zinc-100 px-1">chrome://extensions</code> into the address bar and press
            Enter. (Browsers block websites from opening that page for you.)
          </Step>

          <Step n={4} title="Load unpacked" done={stepDone[4]} icon={Puzzle} onDone={() => mark(4)}>
            Turn on <strong>Developer mode</strong> (top right), click <strong>Load unpacked</strong>, and select the
            unzipped folder (the one with <code className="rounded bg-zinc-100 px-1">manifest.json</code>).
          </Step>

          <Step n={5} title="Connect to this archive" done={stepDone[5]} icon={ExternalLink} onDone={() => mark(5)}>
            Open the extension Options. Set API base URL to{" "}
            <code className="break-all rounded bg-zinc-100 px-1">{typeof window !== "undefined" ? window.location.origin : "https://web-autopsy.vercel.app"}</code>
            , then paste an API token from{" "}
            <Link href="/settings" className="font-semibold text-teal-700 hover:underline">
              Settings
            </Link>
            .
          </Step>
        </section>

        <section className="mt-12 rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">After install</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-600">
            <li>Browse any site — the extension captures locally only.</li>
            <li>Open the Web Autopsy inspector or side panel.</li>
            <li>Click <strong>Save</strong> when you want the capture in your team archive.</li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/settings"
              className="inline-flex min-h-11 items-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white"
            >
              Create API token
            </Link>
            <Link
              href="/captures"
              className="inline-flex min-h-11 items-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-800"
            >
              Go to captures
            </Link>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-zinc-500">
          Unsaved browsing never leaves your machine. No Chrome Web Store listing in v1 — updates come from this page.
        </p>
      </main>
    </div>
  );
}

function Step({
  n,
  title,
  children,
  done,
  icon: Icon,
  action,
  onDone,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  done?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  onDone?: () => void;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${done ? "bg-teal-600 text-white" : "bg-zinc-100 text-zinc-700"}`}
      >
        {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">
            <span className="text-zinc-400">{n}.</span> {title}
          </h3>
          <div className="flex items-center gap-3">
            {action}
            {onDone && !done && (
              <button type="button" onClick={onDone} className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
                Mark done
              </button>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-zinc-600">{children}</p>
      </div>
    </div>
  );
}
