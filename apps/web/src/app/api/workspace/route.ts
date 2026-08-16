import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activity, autopsies, users } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { getUserWorkspace } from "@/lib/auth";
import { and, desc, eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ws = await getUserWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ error: "no workspace" }, { status: 400 });

  const origin = req.nextUrl.searchParams.get("origin");
  if (origin) {
    const rows = await db
      .select({
        id: autopsies.id,
        title: autopsies.title,
        pageUrl: autopsies.pageUrl,
        savedAt: autopsies.savedAt,
        summary: autopsies.summary,
      })
      .from(autopsies)
      .where(and(eq(autopsies.workspaceId, ws.workspace.id), eq(autopsies.origin, origin)))
      .orderBy(desc(autopsies.savedAt))
      .limit(50);
    return NextResponse.json({ origin, captures: rows });
  }

  const feed = await db
    .select({
      id: activity.id,
      verb: activity.verb,
      createdAt: activity.createdAt,
      autopsyId: activity.autopsyId,
      userName: users.name,
      title: autopsies.title,
      summary: autopsies.summary,
    })
    .from(activity)
    .leftJoin(users, eq(activity.userId, users.id))
    .leftJoin(autopsies, eq(activity.autopsyId, autopsies.id))
    .where(eq(activity.workspaceId, ws.workspace.id))
    .orderBy(desc(activity.createdAt))
    .limit(40);

  const origins = await db
    .select({
      origin: autopsies.origin,
      count: sql<number>`count(*)::int`,
      lastSaved: sql<string>`max(${autopsies.savedAt})`,
    })
    .from(autopsies)
    .where(eq(autopsies.workspaceId, ws.workspace.id))
    .groupBy(autopsies.origin)
    .orderBy(sql`max(${autopsies.savedAt}) desc`)
    .limit(30);

  return NextResponse.json({ activity: feed, origins });
}
