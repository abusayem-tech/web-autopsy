"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SettingsClient() {
  const router = useRouter();
  const [tokens, setTokens] = useState<Array<{ id: string; name: string; createdAt: string; revokedAt?: string | null }>>([]);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [role, setRole] = useState("");

  async function load() {
    const res = await fetch("/api/tokens");
    if (!res.ok) return;
    const data = await res.json();
    setTokens(data.tokens ?? []);
    setRole(data.role ?? "");
  }

  useEffect(() => {
    void load();
  }, []);

  async function createToken() {
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Extension" }),
    });
    const data = await res.json();
    if (data.token) setFreshToken(data.token);
    await load();
  }

  async function revoke(id: string) {
    await fetch(`/api/tokens?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-zinc-600">
          Extension API tokens authenticate Save from Chrome. Tokens are hashed at rest. Viewers cannot create tokens.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Chrome extension</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Connect from the website — we create the token and push it into Chrome automatically. No copying secrets.
        </p>
        <a
          href="/extension"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white"
        >
          Auto-connect extension
        </a>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Trust</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600">
          <li>Unsaved browsing never uploads to this site.</li>
          <li>Secrets are redacted by default on Save.</li>
          <li>Viewer roles never see live tokens or secret exports.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Extension API tokens</h2>
          {role !== "viewer" && (
            <button
              type="button"
              onClick={() => void createToken()}
              className="min-h-11 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white"
            >
              Create token
            </button>
          )}
        </div>
        {freshToken && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-900">Copy now — shown once</p>
            <code className="mt-2 block break-all rounded-lg bg-white p-2 font-mono text-xs">{freshToken}</code>
            <p className="mt-2 text-amber-800">
              Paste into the extension Options as API token. Base URL:{" "}
              <code className="rounded bg-white px-1">{typeof window !== "undefined" ? window.location.origin : ""}</code>
            </p>
          </div>
        )}
        <ul className="mt-4 space-y-2">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-zinc-500">
                  {new Date(t.createdAt).toLocaleString()}
                  {t.revokedAt ? " · revoked" : ""}
                </div>
              </div>
              {!t.revokedAt && role !== "viewer" && (
                <button type="button" className="text-red-600" onClick={() => void revoke(t.id)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        className="text-sm text-zinc-500 underline"
        onClick={() => void authClient.signOut().then(() => router.push("/"))}
      >
        Sign out
      </button>
    </div>
  );
}
