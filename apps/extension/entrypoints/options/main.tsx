import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "~/assets/style.css";

function Options() {
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void chrome.storage.sync.get(["apiBaseUrl", "apiToken"]).then((d) => {
      setApiBaseUrl(d.apiBaseUrl || "https://web-autopsy.vercel.app");
      setApiToken(d.apiToken || "");
    });
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6 text-sm">
      <h1 className="text-xl font-semibold">Web Autopsy Options</h1>
      <p className="text-zinc-600">
        Point the extension at your deployed archive site and paste an API token from Settings.
      </p>
      <label className="block">
        <span className="font-medium">API base URL</span>
        <input
          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
          placeholder="https://your-app.vercel.app"
          value={apiBaseUrl}
          onChange={(e) => setApiBaseUrl(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="font-medium">API token</span>
        <input
          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
          placeholder="wa_…"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="min-h-10 rounded-lg bg-teal-600 px-4 font-semibold text-white"
        onClick={() => {
          void chrome.storage.sync.set({ apiBaseUrl, apiToken }).then(() => setSaved(true));
        }}
      >
        Save
      </button>
      {saved && <p className="text-teal-700">Saved.</p>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Options />);
