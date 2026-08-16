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
import { requireApiToken, requireSession } from "@/lib/api-auth";
import { enhanceBriefWithAi } from "@/lib/brief-ai";
import { getUserWorkspace } from "@/lib/auth";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { normalizePageUrl, type SavePayload } from "@web-autopsy/core";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ws = await getUserWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ error: "no workspace" }, { status: 400 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const origin = req.nextUrl.searchParams.get("origin")?.trim();

  const conditions = [eq(autopsies.workspaceId, ws.workspace.id)];
  if (origin) conditions.push(eq(autopsies.origin, origin));
  if (q) {
    conditions.push(
      or(
        ilike(autopsies.title, `%${q}%`),
        ilike(autopsies.pageUrl, `%${q}%`),
        ilike(autopsies.origin, `%${q}%`),
        sql`${autopsies.summary}->>'subtitle' ilike ${`%${q}%`}`,
        sql`${autopsies.summary}->>'storyLine' ilike ${`%${q}%`}`,
      )!,
    );
  }

  const rows = await db
    .select({
      id: autopsies.id,
      title: autopsies.title,
      pageUrl: autopsies.pageUrl,
      origin: autopsies.origin,
      savedAt: autopsies.savedAt,
      summary: autopsies.summary,
      savedBy: autopsies.savedBy,
      hasScreenshot: sql<boolean>`${autopsies.screenshotPng} is not null`,
    })
    .from(autopsies)
    .where(and(...conditions))
    .orderBy(desc(autopsies.savedAt))
    .limit(100);

  return NextResponse.json({ captures: rows, role: ws.role });
}

async function replaceChildren(
  autopsyId: string,
  body: SavePayload,
  brief: NonNullable<SavePayload["brief"]> & { model?: string },
) {
  await db.delete(findings).where(eq(findings.autopsyId, autopsyId));
  await db.delete(portableApis).where(eq(portableApis.autopsyId, autopsyId));
  await db.delete(advice).where(eq(advice.autopsyId, autopsyId));
  await db.delete(briefs).where(eq(briefs.autopsyId, autopsyId));

  if (body.findings?.length) {
    await db.insert(findings).values(
      body.findings.map((f) => ({
        autopsyId,
        ruleId: f.ruleId,
        severity: f.severity,
        title: f.title,
        plainTitle: f.plainTitle,
        detail: f.detail ?? null,
      })),
    );
  }

  if (body.portableApis?.length) {
    await db.insert(portableApis).values(
      body.portableApis.map((a) => ({
        autopsyId,
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

  if (body.advice?.length) {
    await db.insert(advice).values(
      body.advice.map((a) => ({
        autopsyId,
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

  await db.insert(briefs).values({
    autopsyId,
    story: brief.story,
    health: brief.health,
    apiCards: brief.apiCards,
    dangerCards: brief.dangerCards,
    improveCards: brief.improveCards,
    healthyCards: brief.healthyCards,
    model: brief.model ?? "heuristic",
  });
}

export async function POST(req: NextRequest) {
  const authz = await requireApiToken(req);
  if (!authz) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SavePayload;
  try {
    body = (await req.json()) as SavePayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.pageUrl || !body?.title || !body?.summary) {
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

  const heuristicBrief = body.brief!;
  const brief = await enhanceBriefWithAi({ ...body, pageUrl, origin }, heuristicBrief);

  // List metadata: keep short subtitle/storyLine — full narrative lives in briefs.
  // Never store screenshots — images are URL previews only.
  const summary = {
    ...body.summary,
    health: brief.health,
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
    .where(and(eq(autopsies.workspaceId, authz.token.workspaceId), eq(autopsies.pageUrl, pageUrl)))
    .orderBy(desc(autopsies.savedAt))
    .limit(1);

  let row: typeof autopsies.$inferSelect;
  let updated = false;

  if (existing) {
    updated = true;
    const [updatedRow] = await db
      .update(autopsies)
      .set({
        savedBy: authz.token.userId,
        title: body.title,
        pageUrl,
        origin,
        savedAt: new Date(),
        summary,
        payload: body.payload,
        htmlSnapshot: body.htmlSnapshot ?? null,
        screenshotPng: null,
        includesSecrets: body.includesSecrets ?? false,
      })
      .where(eq(autopsies.id, existing.id))
      .returning();
    if (!updatedRow) {
      return NextResponse.json({ error: "update failed" }, { status: 500 });
    }
    row = updatedRow;
    await replaceChildren(row.id, body, brief);
    await db.insert(activity).values({
      workspaceId: authz.token.workspaceId,
      userId: authz.token.userId,
      verb: "updated",
      autopsyId: row.id,
    });
  } else {
    const [inserted] = await db
      .insert(autopsies)
      .values({
        workspaceId: authz.token.workspaceId,
        savedBy: authz.token.userId,
        title: body.title,
        pageUrl,
        origin,
        summary,
        payload: body.payload,
        htmlSnapshot: body.htmlSnapshot ?? null,
        screenshotPng: null,
        includesSecrets: body.includesSecrets ?? false,
      })
      .returning();

    if (!inserted) {
      return NextResponse.json({ error: "insert failed" }, { status: 500 });
    }
    row = inserted;
    await replaceChildren(row.id, body, brief);
    await db.insert(activity).values({
      workspaceId: authz.token.workspaceId,
      userId: authz.token.userId,
      verb: "saved",
      autopsyId: row.id,
    });
  }

  return NextResponse.json({ id: row.id, health: brief.health, updated });
}
