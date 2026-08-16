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
  const gql = graphqlOperationName(body);
  if (gql) return `Runs the GraphQL operation “${gql}”.`;

  const segs = pathSegments(url);
  const last = segs[segs.length - 1] ?? "data";
  const label = titleCase(last).toLowerCase();
  const m = method.toUpperCase();

  if (url.toLowerCase().includes("search")) {
    return `Asks the server to search for matching ${label}.`;
  }
  if (m === "GET") return `Fetches ${label} from the server.`;
  if (m === "POST") return `Sends new ${label} to the server.`;
  if (m === "PUT" || m === "PATCH") return `Updates ${label} on the server.`;
  if (m === "DELETE") return `Removes ${label} on the server.`;
  return `Talks to the server about ${label}.`;
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
