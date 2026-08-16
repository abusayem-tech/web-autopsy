import { describe, expect, it } from "vitest";
import {
  buildSavePayload,
  classifyPortableApis,
  classifyReplay,
  emptySession,
  enrichSession,
  generateCodegen,
  humanApiName,
  toPostmanCollection,
} from "./index.js";
import type { NetworkEntry } from "./types.js";

function req(partial: Partial<NetworkEntry> & Pick<NetworkEntry, "id" | "url" | "method">): NetworkEntry {
  return {
    resourceType: "fetch",
    timestamp: Date.now(),
    firstParty: true,
    ...partial,
  };
}

describe("portable-api", () => {
  it("classifies public APIs", () => {
    const entry = req({
      id: "1",
      method: "GET",
      url: "https://api.example.com/v1/products",
      resourceType: "fetch",
      status: 200,
    });
    expect(classifyReplay(entry)).toBe("portable-public");
  });

  it("classifies bearer token APIs", () => {
    const entry = req({
      id: "2",
      method: "GET",
      url: "https://api.example.com/v1/me",
      requestHeaders: { Authorization: "Bearer secret-token" },
    });
    expect(classifyReplay(entry)).toBe("portable-token");
  });

  it("classifies CSRF as browser-bound", () => {
    const entry = req({
      id: "3",
      method: "POST",
      url: "https://example.com/api/cart",
      requestHeaders: {
        Cookie: "session=abc",
        "X-CSRF-Token": "tok",
      },
    });
    expect(classifyReplay(entry)).toBe("browser-bound");
  });

  it("excludes browser-bound from portable list", () => {
    const list = classifyPortableApis([
      req({
        id: "a",
        method: "GET",
        url: "https://api.example.com/v1/products",
      }),
      req({
        id: "b",
        method: "POST",
        url: "https://example.com/api/cart",
        requestHeaders: { Cookie: "s=1", "X-CSRF-Token": "x" },
      }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.url).toContain("/products");
  });
});

describe("labels", () => {
  it("names product list GET", () => {
    expect(humanApiName("GET", "https://x.com/v1/products")).toBe("Load Products");
  });
});

describe("codegen", () => {
  it("redacts authorization", () => {
    const code = generateCodegen(
      req({
        id: "1",
        method: "GET",
        url: "https://api.example.com/v1/me",
        requestHeaders: { Authorization: "Bearer real-secret" },
      }),
      true,
    );
    expect(code.curl).toContain("$BEARER_TOKEN");
    expect(code.curl).not.toContain("real-secret");
  });
});

describe("save pipeline", () => {
  it("enriches and builds payload", () => {
    const session = emptySession(1, "https://shop.example.com/products");
    session.pageTitle = "Products";
    session.requests = [
      req({
        id: "1",
        method: "GET",
        url: "https://shop.example.com/api/v1/products",
        status: 200,
        durationMs: 120,
        transferSize: 5000,
      }),
      req({
        id: "2",
        method: "GET",
        url: "https://shop.example.com/api/v1/secret",
        status: 200,
        requestHeaders: { Authorization: "Bearer abc" },
        transferSize: 100,
      }),
    ];
    session.performance.totalTransferBytes = 5100;
    session.performance.requestCount = 2;

    const enriched = enrichSession(session);
    expect(enriched.portableApis.length).toBeGreaterThan(0);
    expect(enriched.findings.some((f) => f.ruleId === "portable-token")).toBe(true);

    const payload = buildSavePayload(enriched, { includeSecrets: false });
    expect(payload.summary.health).toBeTruthy();
    expect(payload.brief?.story).toContain("Products");
    expect(JSON.stringify(payload)).not.toContain("Bearer abc");
  });

  it("builds postman collection", () => {
    const col = toPostmanCollection([
      { method: "GET", url: "https://api.example.com/v1/products", humanName: "Load Products" },
    ]);
    expect((col as { item: unknown[] }).item).toHaveLength(1);
  });
});
