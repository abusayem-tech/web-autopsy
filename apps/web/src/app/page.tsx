"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signup") {
        const res = await authClient.signUp.email({
          email,
          password,
          name: email.split("@")[0] || "User",
        });
        if (res.error) throw new Error(res.error.message || "Sign up failed");
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message || "Sign in failed");
      }
      router.push("/captures");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-teal-50/60 via-zinc-50 to-zinc-50">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-sm font-bold text-white">
            WA
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Web Autopsy</h1>
          <p className="mt-2 text-base text-zinc-600">
            Capture any page with the extension. Save only what you choose. Your team sees a plain-language story of
            what is in danger and what to improve.
          </p>
          <p className="mt-3 text-sm text-zinc-500">
            Unsaved browsing never leaves your machine.
          </p>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex rounded-xl bg-zinc-100 p-1">
            <button
              type="button"
              className={`min-h-10 flex-1 rounded-lg text-sm font-medium ${mode === "signin" ? "bg-white shadow-sm" : "text-zinc-600"}`}
              onClick={() => setMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`min-h-10 flex-1 rounded-lg text-sm font-medium ${mode === "signup" ? "bg-white shadow-sm" : "text-zinc-600"}`}
              onClick={() => setMode("signup")}
            >
              Create account
            </button>
          </div>
          <label className="mb-3 block text-sm font-medium text-zinc-700">
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none ring-teal-600/30 focus:ring-2"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-zinc-700">
            Password
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none ring-teal-600/30 focus:ring-2"
            />
          </label>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-600 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
