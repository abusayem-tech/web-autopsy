"use client";

import { useEffect, useState } from "react";

export function TeamClient() {
  const [data, setData] = useState<{
    workspace: { name: string };
    role: string;
    members: Array<{ name: string; email: string; role: string }>;
  } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/team");
    if (res.ok) setData(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function invite() {
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const json = await res.json();
    if (json.inviteUrl) setInviteUrl(json.inviteUrl);
    await load();
  }

  if (!data) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{data.workspace.name}</h1>
        <p className="mt-1 text-zinc-600">Invite teammates. Viewers can read Story briefings but never see live secrets.</p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Members</h2>
        <ul className="mt-3 space-y-2">
          {data.members.map((m) => (
            <li key={m.email} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm">
              <span className="min-w-0 break-words">
                {m.name} <span className="break-all text-zinc-500">({m.email})</span>
              </span>
              <span className="shrink-0 capitalize text-zinc-600">{m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      {data.role === "owner" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Invite</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="min-h-11 rounded-xl border border-zinc-200 px-3"
            >
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="button"
              onClick={() => void invite()}
              className="min-h-11 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white"
            >
              Invite
            </button>
          </div>
          {inviteUrl && (
            <p className="mt-3 break-all rounded-xl bg-teal-50 p-3 text-xs text-teal-900">
              Share this invite link: {inviteUrl}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
