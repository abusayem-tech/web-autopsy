"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Captions, Puzzle, Search, Settings, Users } from "lucide-react";
import { ExtensionProvider, useExtension } from "@/components/extension-provider";

const links = [
  { href: "/captures", label: "Captures", icon: Captions },
  { href: "/search", label: "Search", icon: Search },
  { href: "/team", label: "Team", icon: Users },
  { href: "/extension", label: "Extension", icon: Puzzle },
  { href: "/settings", label: "Settings", icon: Settings },
];

function ExtensionStatusChip() {
  const { status, refreshing, outdated } = useExtension();
  if (status === "checking") {
    return <span className="hidden text-xs text-zinc-400 sm:inline">Checking extension…</span>;
  }
  if (outdated && (status === "connected" || status === "installed")) {
    return (
      <Link
        href="/extension"
        className="inline-flex max-w-[9rem] items-center gap-1.5 truncate rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200 sm:max-w-none sm:px-2.5"
        title="Extension update available"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
        <span className="truncate">Update</span>
      </Link>
    );
  }
  if (status === "connected") {
    return (
      <Link
        href="/extension"
        className="inline-flex max-w-[9rem] items-center gap-1.5 truncate rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-800 ring-1 ring-teal-200 sm:max-w-none sm:px-2.5"
        title="Extension connected"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
        <span className="truncate sm:hidden">Connected</span>
        <span className="hidden truncate sm:inline">Extension connected</span>
      </Link>
    );
  }
  if (status === "installed") {
    return (
      <Link
        href="/extension"
        className="inline-flex max-w-[9rem] items-center gap-1.5 truncate rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200 sm:max-w-none sm:px-2.5"
        title={refreshing ? "Connecting…" : "Finish connect"}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
        <span className="truncate">{refreshing ? "Connecting…" : "Finish connect"}</span>
      </Link>
    );
  }
  return (
    <Link
      href="/extension"
      className="inline-flex max-w-[9rem] items-center gap-1.5 truncate rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 sm:max-w-none sm:px-2.5"
      title="Extension needed"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
      <span className="truncate sm:hidden">Needed</span>
      <span className="hidden truncate sm:inline">Extension needed</span>
    </Link>
  );
}

function ExtensionBanner() {
  const pathname = usePathname();
  const { status, outdated, ping, latest } = useExtension();
  if (status === "checking") return null;
  if (pathname.startsWith("/extension")) return null;

  if (outdated && (status === "connected" || status === "installed")) {
    return (
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-6xl min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-950">
          <p className="min-w-0 flex-1 break-words">
            Extension v{ping?.version} is outdated. Latest is v{latest?.version}. Uninstall the old build, then
            download and Load unpacked again.
          </p>
          <Link href="/extension" className="shrink-0 font-semibold text-teal-800 underline-offset-2 hover:underline">
            Update now
          </Link>
        </div>
      </div>
    );
  }

  if (status === "connected") return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-950">
        <p className="min-w-0 flex-1 break-words">
          {status === "installed"
            ? "Extension detected but not linked to this account yet."
            : "Install and connect the Chrome extension to capture pages."}
        </p>
        <Link href="/extension" className="shrink-0 font-semibold text-teal-800 underline-offset-2 hover:underline">
          {status === "installed" ? "Connect now" : "Set up extension"}
        </Link>
      </div>
    </div>
  );
}

function ShellInner({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName?: string;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl min-w-0 items-center justify-between gap-2 px-4 sm:gap-4">
          <Link href="/captures" className="flex min-w-0 shrink-0 items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-xs text-white">
              WA
            </span>
            <span className="hidden sm:inline">Web Autopsy</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {links.map((l) => {
              const Icon = l.icon;
              const active = pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition",
                    active ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <ExtensionStatusChip />
            <span className="hidden max-w-[8rem] truncate text-sm text-zinc-500 sm:inline" title={userName}>
              {userName}
            </span>
          </div>
        </div>
      </header>
      <ExtensionBanner />
      <main className="mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-6 pb-24 md:pb-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="flex overflow-x-auto justify-around">
          {links.map((l) => {
            const Icon = l.icon;
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium sm:text-[11px]",
                  active ? "text-teal-700" : "text-zinc-500",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="max-w-full truncate">{l.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function AppShell({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName?: string;
}) {
  return (
    <ExtensionProvider>
      <ShellInner userName={userName}>{children}</ShellInner>
    </ExtensionProvider>
  );
}
