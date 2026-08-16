import type { NetworkEntry } from "./types.js";

const SECRET_HEADER_KEYS = [
  "authorization",
  "cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-access-token",
  "x-client-secret",
];

const SECRET_QUERY_KEYS = [
  "api_key",
  "apikey",
  "access_token",
  "token",
  "key",
  "client_secret",
];

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (SECRET_QUERY_KEYS.includes(key.toLowerCase())) {
        u.searchParams.set(key, `$${key.toUpperCase()}`);
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

function redactHeaders(
  headers: Record<string, string> | undefined,
  redacted: boolean,
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (redacted && SECRET_HEADER_KEYS.includes(lower)) {
      if (lower === "authorization") {
        const scheme = v.split(/\s+/)[0] ?? "Bearer";
        out[k] = `${scheme} $BEARER_TOKEN`;
      } else if (lower === "cookie") {
        out[k] = "$COOKIE";
      } else {
        out[k] = `$API_KEY`;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function escapeShell(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function generateCodegen(
  entry: NetworkEntry,
  redacted = true,
): { curl: string; fetch: string; python: string } {
  const url = redacted ? redactUrl(entry.url) : entry.url;
  const headers = redactHeaders(entry.requestHeaders, redacted);
  const method = entry.method.toUpperCase();
  const body = entry.requestBody;

  const curlParts = [`curl -X ${method} ${escapeShell(url)}`];
  for (const [k, v] of Object.entries(headers)) {
    curlParts.push(`  -H ${escapeShell(`${k}: ${v}`)}`);
  }
  if (body && method !== "GET" && method !== "HEAD") {
    curlParts.push(`  --data-raw ${escapeShell(body)}`);
  }
  const curl = curlParts.join(" \\\n");

  const headerObj = JSON.stringify(headers, null, 2);
  const fetchLines = [
    `fetch(${JSON.stringify(url)}, {`,
    `  method: ${JSON.stringify(method)},`,
    `  headers: ${headerObj},`,
  ];
  if (body && method !== "GET" && method !== "HEAD") {
    fetchLines.push(`  body: ${JSON.stringify(body)},`);
  }
  fetchLines.push(`});`);
  const fetchCode = fetchLines.join("\n");

  const pyHeaders = Object.entries(headers)
    .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n");
  const python = [
    "import requests",
    "",
    `resp = requests.request(`,
    `    ${JSON.stringify(method)},`,
    `    ${JSON.stringify(url)},`,
    `    headers={`,
    pyHeaders,
    `    },`,
    body && method !== "GET" && method !== "HEAD"
      ? `    data=${JSON.stringify(body)},`
      : null,
    `)`,
    "print(resp.status_code, resp.text)",
  ]
    .filter((l) => l != null)
    .join("\n");

  return { curl, fetch: fetchCode, python };
}

export function toPostmanCollection(
  apis: Array<{ method: string; url: string; headers?: Record<string, string>; body?: string; humanName?: string }>,
  name = "Web Autopsy Portable APIs",
): object {
  return {
    info: {
      name,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: apis.map((api) => ({
      name: api.humanName ?? `${api.method} ${api.url}`,
      request: {
        method: api.method,
        header: Object.entries(api.headers ?? {}).map(([key, value]) => ({ key, value })),
        url: api.url,
        body: api.body
          ? { mode: "raw", raw: api.body, options: { raw: { language: "json" } } }
          : undefined,
      },
    })),
  };
}

export function toOpenApi(
  apis: Array<{ method: string; url: string; humanName?: string; purpose?: string }>,
  title = "Web Autopsy APIs",
): object {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const api of apis) {
    try {
      const u = new URL(api.url);
      const path = u.pathname || "/";
      paths[path] ??= {};
      paths[path][api.method.toLowerCase()] = {
        summary: api.humanName ?? `${api.method} ${path}`,
        description: api.purpose,
        responses: { "200": { description: "OK" } },
      };
    } catch {
      /* skip */
    }
  }
  return {
    openapi: "3.0.3",
    info: { title, version: "1.0.0" },
    paths,
  };
}
