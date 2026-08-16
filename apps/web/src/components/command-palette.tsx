"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; title: string; pageUrl: string }>>([]);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/autopsies?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.captures ?? []);
    }, 150);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/40 p-4 pt-[15vh]">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search captures, URLs…"
          className="w-full border-b border-zinc-100 px-4 py-3 text-base outline-none"
        />
        <ul className="max-h-80 overflow-auto p-2">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full min-h-11 flex-col rounded-xl px-3 py-2 text-left hover:bg-zinc-50"
                onClick={() => {
                  setOpen(false);
                  router.push(`/captures/${r.id}`);
                }}
              >
                <span className="font-medium">{r.title}</span>
                <span className="truncate text-xs text-zinc-500">{r.pageUrl}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="px-3 py-6 text-center text-sm text-zinc-500">No matches</li>}
        </ul>
      </div>
    </div>
  );
}
