"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HealthPill } from "@/components/health-pill";

export function SearchClient() {
  const [q, setQ] = useState("");
  const [captures, setCaptures] = useState<
    Array<{ id: string; title: string; pageUrl: string; summary: { health?: string; storyLine?: string } }>
  >([]);
  const [origins, setOrigins] = useState<Array<{ origin: string; count: number }>>([]);

  useEffect(() => {
    void fetch(`/api/autopsies?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => setCaptures(d.captures ?? []));
  }, [q]);

  useEffect(() => {
    void fetch("/api/workspace")
      .then((r) => r.json())
      .then((d) => setOrigins(d.origins ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Search</h1>
        <p className="mt-1 text-zinc-600">Find captures by title or URL. Press ⌘K anywhere.</p>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search…"
        className="min-h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-base shadow-sm"
      />
      <ul className="space-y-2">
        {captures.map((c) => (
          <li key={c.id}>
            <Link href={`/captures/${c.id}`} className="block min-w-0 rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 truncate font-medium" title={c.title}>
                  {c.title}
                </span>
                <HealthPill health={c.summary?.health} />
              </div>
              <div className="mt-0.5 break-all text-sm text-zinc-500" title={c.pageUrl}>
                {c.pageUrl}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <section>
        <h2 className="text-lg font-semibold">Origins</h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {origins.map((o) => (
            <li key={o.origin}>
              <Link
                href={`/origins/${encodeURIComponent(o.origin)}`}
                className="block rounded-xl border border-zinc-200 bg-white p-3 text-sm"
              >
                <div className="break-all font-medium" title={o.origin}>
                  {o.origin}
                </div>
                <div className="text-zinc-500">{o.count} saves</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
