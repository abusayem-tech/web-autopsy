function graphqlOperationName(body?: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as { operationName?: string; query?: string };
    if (parsed.operationName) return parsed.operationName;
    if (parsed.query) {
      const m = parsed.query.match(/(?:query|mutation|subscription)\s+(\w+)/);
      return m?.[1];
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function pathSegments(url: string): string[] {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

function titleCase(s: string): string {
  return s
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function humanApiName(method: string, url: string, body?: string): string {
  const gql = graphqlOperationName(body);
  if (gql) return titleCase(gql);

  const segs = pathSegments(url);
  const last = segs[segs.length - 1] ?? "resource";
  const prev = segs[segs.length - 2];
  const m = method.toUpperCase();

  if (m === "GET" && /^\d+$/.test(last) && prev) {
    return `Get ${titleCase(prev)}`;
  }
  if (m === "GET") return `Load ${titleCase(last)}`;
  if (m === "POST") return `Create ${titleCase(last)}`;
  if (m === "PUT" || m === "PATCH") return `Update ${titleCase(last)}`;
  if (m === "DELETE") return `Delete ${titleCase(last)}`;
  return `${m} ${titleCase(last)}`;
}

export function humanApiPurpose(method: string, url: string, body?: string): string {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    path = u.pathname;
  } catch {
    /* ignore */
  }

  const gql = graphqlOperationName(body);
  if (gql) {
    return `Runs GraphQL “${gql}” on ${host || "the API host"}${path ? ` (${path})` : ""}.`;
  }

  const segs = pathSegments(url);
  const last = segs[segs.length - 1] ?? "data";
  const prev = segs[segs.length - 2];
  const label = titleCase(last).toLowerCase();
  const parent = prev ? titleCase(prev).toLowerCase() : null;
  const m = method.toUpperCase();
  const lower = url.toLowerCase();

  let action: string;
  if (lower.includes("search") || lower.includes("query") || lower.includes("find")) {
    action = `Searches for matching ${label}`;
  } else if (lower.includes("auth") || lower.includes("login") || lower.includes("session") || lower.includes("oauth")) {
    action = `Handles authentication / session for ${label}`;
  } else if (lower.includes("upload") || lower.includes("media") || lower.includes("asset")) {
    action = `Moves file or media data (${label})`;
  } else if (lower.includes("webhook") || lower.includes("hook")) {
    action = `Receives or fires a webhook about ${label}`;
  } else if (m === "GET" && /^\d+$/.test(last) && parent) {
    action = `Loads one ${parent} record by id`;
  } else if (m === "GET") {
    action = `Fetches ${label} from the server`;
  } else if (m === "POST") {
    action = `Creates or submits ${label}`;
  } else if (m === "PUT" || m === "PATCH") {
    action = `Updates ${label} on the server`;
  } else if (m === "DELETE") {
    action = `Deletes ${label} on the server`;
  } else {
    action = `Talks to the server about ${label}`;
  }

  const where = host ? ` Endpoint: ${host}${path || ""}.` : "";
  return `${action}.${where}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMs(n: number): string {
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

export function shortUrl(url: string, max = 72): string {
  try {
    const u = new URL(url);
    const s = `${u.hostname}${u.pathname}${u.search}`;
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  } catch {
    return url.length > max ? `${url.slice(0, max - 1)}…` : url;
  }
}
