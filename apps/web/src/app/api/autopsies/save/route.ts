import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  activity,
  advice,
  autopsies,
  briefs,
  findings,
  portableApis,
} from "@/db/schema";
import { requireApiToken } from "@/lib/api-auth";
import { enhanceBriefWithAi } from "@/lib/brief-ai";
import { and, desc, eq } from "drizzle-orm";
import {
  normalizePageUrl,
  type AdviceCard,
  type AutopsySession,
  type AutopsySummary,
  type Brief,
  type Finding,
  type PortableApi,
  type SavePayload,
  type SaveUploadChunk,
} from "@web-autopsy/core";

async function assertOwns(autopsyId: string, workspaceId: string) {
  const [row] = await db
    .select({ id: autopsies.id })
    .from(autopsies)
    .where(and(eq(autopsies.id, autopsyId), eq(autopsies.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/**
 * Sequential cloud save — no screenshots / binary images.
 * Steps: meta → session → findings → portable → finish
 */
export async function POST(req: NextRequest) {
  const authz = await requireApiToken(req);
  if (!authz) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SaveUploadChunk;
  try {
    body = (await req.json()) as SaveUploadChunk;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.step) {
    return NextResponse.json({ error: "missing step" }, { status: 400 });
  }

  switch (body.step) {
    case "meta":
      return handleMeta(authz.token.workspaceId, authz.token.userId, body);
    case "session":
      return handleSession(authz.token.workspaceId, body);
    case "session_patch":
      return handleSessionPatch(authz.token.workspaceId, body);
    case "findings":
      return handleFindings(authz.token.workspaceId, body);
    case "portable":
      return handlePortable(authz.token.workspaceId, body);
    case "finish":
      return handleFinish(authz.token.workspaceId, authz.token.userId, body);
    default: {
      return NextResponse.json(
        { error: `unknown step: ${String((body as { step?: string }).step)}` },
        { status: 400 },
      );
    }
  }
}

async function handleMeta(
  workspaceId: string,
  userId: string,
  body: {
    title: string;
    pageUrl: string;
    origin: string;
    summary: AutopsySummary;
    htmlSnapshot?: string;
    includesSecrets?: boolean;
  },
) {
  if (!body.pageUrl || !body.title || !body.summary) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const pageUrl = normalizePageUrl(body.pageUrl);
  const origin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return body.origin || pageUrl;
    }
  })();

  const summary = {
    ...body.summary,
    pageUrl,
    origin,
    pageTitle: body.summary.pageTitle || body.title,
    subtitle: body.summary.subtitle || undefined,
    storyLine:
      body.summary.storyLine ||
      [body.summary.subtitle, `${body.summary.requestCount ?? 0} requests`].filter(Boolean).join(" · "),
  };

  const [existing] = await db
    .select({ id: autopsies.id })
    .from(autopsies)
    .where(and(eq(autopsies.workspaceId, workspaceId), eq(autopsies.pageUrl, pageUrl)))
    .orderBy(desc(autopsies.savedAt))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(autopsies)
      .set({
        savedBy: userId,
        title: body.title,
        pageUrl,
        origin,
        savedAt: new Date(),
        summary,
        htmlSnapshot: body.htmlSnapshot ?? null,
        screenshotPng: null,
        includesSecrets: body.includesSecrets ?? false,
      })
      .where(eq(autopsies.id, existing.id))
      .returning({ id: autopsies.id });

    return NextResponse.json({
      id: row!.id,
      updated: true,
      step: "meta",
      progress: 20,
    });
  }

  const [row] = await db
    .insert(autopsies)
    .values({
      workspaceId,
      savedBy: userId,
      title: body.title,
      pageUrl,
      origin,
      summary,
      payload: {},
      htmlSnapshot: body.htmlSnapshot ?? null,
      screenshotPng: null,
      includesSecrets: body.includesSecrets ?? false,
    })
    .returning({ id: autopsies.id });

  return NextResponse.json({
    id: row!.id,
    updated: false,
    step: "meta",
    progress: 20,
  });
}

async function handleSession(
  workspaceId: string,
  body: { id: string; payload: AutopsySession },
) {
  if (!body.id || !body.payload) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const owned = await assertOwns(body.id, workspaceId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Ensure images are URL metadata only (no data: URIs).
  const images = (body.payload.images || []).filter((img) => {
    try {
      const u = new URL(img.url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  });

  const slimPayload = {
    ...body.payload,
    images,
    htmlSnapshot: undefined,
    screenshotDataUrl: undefined,
  };

  await db
    .update(autopsies)
    .set({ payload: slimPayload, screenshotPng: null })
    .where(eq(autopsies.id, body.id));

  return NextResponse.json({ id: body.id, step: "session", progress: 40 });
}

async function handleSessionPatch(
  workspaceId: string,
  body: { id: string; patch: Partial<AutopsySession>; appendRequests?: boolean },
) {
  if (!body.id || !body.patch) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const owned = await assertOwns(body.id, workspaceId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [row] = await db.select({ payload: autopsies.payload }).from(autopsies).where(eq(autopsies.id, body.id)).limit(1);
  const existing = (row?.payload || {}) as AutopsySession;
  const patch = { ...body.patch };
  delete (patch as { htmlSnapshot?: unknown }).htmlSnapshot;
  delete (patch as { screenshotDataUrl?: unknown }).screenshotDataUrl;

  if (patch.images) {
    patch.images = patch.images.filter((img) => {
      try {
        const u = new URL(img.url);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    });
  }

  let next: AutopsySession = { ...existing, ...patch };
  if (body.appendRequests && Array.isArray(body.patch.requests)) {
    next = {
      ...next,
      requests: [...(existing.requests || []), ...body.patch.requests],
    };
  }

  await db
    .update(autopsies)
    .set({ payload: next, screenshotPng: null })
    .where(eq(autopsies.id, body.id));

  return NextResponse.json({ id: body.id, step: "session_patch", progress: 50 });
}

async function handleFindings(
  workspaceId: string,
  body: { id: string; findings: Finding[] },
) {
  if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const owned = await assertOwns(body.id, workspaceId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.delete(findings).where(eq(findings.autopsyId, body.id));
  if (body.findings?.length) {
    await db.insert(findings).values(
      body.findings.map((f) => ({
        autopsyId: body.id,
        ruleId: f.ruleId,
        severity: f.severity,
        title: f.title,
        plainTitle: f.plainTitle,
        detail: f.detail ?? null,
      })),
    );
  }

  return NextResponse.json({ id: body.id, step: "findings", progress: 60 });
}

async function handlePortable(
  workspaceId: string,
  body: { id: string; portableApis: PortableApi[] },
) {
  if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const owned = await assertOwns(body.id, workspaceId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.delete(portableApis).where(eq(portableApis.autopsyId, body.id));
  if (body.portableApis?.length) {
    await db.insert(portableApis).values(
      body.portableApis.map((a) => ({
        autopsyId: body.id,
        method: a.method,
        url: a.url,
        replayClass: a.replayClass,
        authType: a.authType ?? null,
        humanName: a.humanName,
        purpose: a.purpose,
        redactedCodegen: a.redactedCodegen ?? null,
      })),
    );
  }

  return NextResponse.json({ id: body.id, step: "portable", progress: 80 });
}

async function handleFinish(
  workspaceId: string,
  userId: string,
  body: {
    id: string;
    advice: AdviceCard[];
    brief?: Brief;
    findings?: Finding[];
    portableApis?: PortableApi[];
  },
) {
  if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const owned = await assertOwns(body.id, workspaceId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [row] = await db.select().from(autopsies).where(eq(autopsies.id, body.id)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const heuristic =
    body.brief ??
    ({
      story: `${row.title} capture saved.`,
      health: (row.summary as { health?: string })?.health || "healthy",
      apiCards: [],
      dangerCards: [],
      improveCards: [],
      healthyCards: [],
      model: "heuristic",
      generatedAt: new Date().toISOString(),
    } as Brief);
  const saveLike: SavePayload = {
    title: row.title,
    pageUrl: row.pageUrl,
    origin: row.origin,
    summary: row.summary as AutopsySummary,
    payload: row.payload as AutopsySession,
    includesSecrets: row.includesSecrets,
    findings: body.findings ?? [],
    portableApis: body.portableApis ?? [],
    advice: body.advice ?? [],
    brief: heuristic,
  };

  const brief = await enhanceBriefWithAi(saveLike, heuristic);

  await db.delete(advice).where(eq(advice.autopsyId, body.id));
  if (body.advice?.length) {
    await db.insert(advice).values(
      body.advice.map((a) => ({
        autopsyId: body.id,
        kind: a.kind,
        area: a.area,
        severity: a.severity,
        title: a.title,
        whyItMatters: a.whyItMatters,
        suggestion: a.suggestion,
        relatedFindingId: a.relatedFindingId ?? null,
      })),
    );
  }

  await db.delete(briefs).where(eq(briefs.autopsyId, body.id));
  await db.insert(briefs).values({
    autopsyId: body.id,
    story: brief.story,
    health: brief.health,
    apiCards: brief.apiCards,
    dangerCards: brief.dangerCards,
    improveCards: brief.improveCards,
    healthyCards: brief.healthyCards,
    model: brief.model ?? "heuristic",
  });

  const summary = {
    ...(row.summary as Record<string, unknown>),
    health: brief.health,
  };
  const prevPayload = (row.payload || {}) as AutopsySession;
  const mergedPayload: AutopsySession = {
    ...prevPayload,
    findings: body.findings ?? prevPayload.findings ?? [],
    advice: body.advice ?? prevPayload.advice ?? [],
    portableApis: body.portableApis ?? prevPayload.portableApis ?? [],
    htmlSnapshot: undefined,
    screenshotDataUrl: undefined,
  };
  await db
    .update(autopsies)
    .set({ summary, payload: mergedPayload, screenshotPng: null, savedAt: new Date() })
    .where(eq(autopsies.id, body.id));

  await db.insert(activity).values({
    workspaceId,
    userId,
    verb: "saved",
    autopsyId: body.id,
  });

  return NextResponse.json({
    id: body.id,
    step: "finish",
    progress: 100,
    health: brief.health,
  });
}
