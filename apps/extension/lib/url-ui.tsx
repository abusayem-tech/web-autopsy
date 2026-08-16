import React, { useState } from "react";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
      className={`shrink-0 rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 ${className}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void copyText(text).then((ok) => {
          if (!ok) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function UrlLine({
  url,
  display,
  className = "",
  mono = true,
}: {
  url: string;
  display?: string;
  className?: string;
  mono?: boolean;
}) {
  const href = url.trim();
  const label = display ?? href;
  const linkable = isHttpUrl(href);

  return (
    <span className={`inline-flex max-w-full min-w-0 items-start gap-1.5 ${className}`}>
      {linkable ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`min-w-0 break-all text-teal-700 underline-offset-2 hover:underline dark:text-teal-300 ${mono ? "font-mono" : ""}`}
          title={href}
        >
          {label}
        </a>
      ) : (
        <span className={`min-w-0 break-all ${mono ? "font-mono" : ""}`} title={href}>
          {label}
        </span>
      )}
      <CopyButton text={href} label="Copy" />
    </span>
  );
}

export function CodeBlockWithCopy({
  title,
  code,
  maxClass = "max-h-48",
}: {
  title?: string;
  code: string;
  maxClass?: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        {title ? <h4 className="text-xs font-semibold uppercase text-zinc-500">{title}</h4> : <span />}
        <CopyButton text={code} label="Copy" />
      </div>
      <pre
        className={`mt-1 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-950 p-2 text-[10px] text-zinc-100 ${maxClass}`}
      >
        {code}
      </pre>
    </div>
  );
}
