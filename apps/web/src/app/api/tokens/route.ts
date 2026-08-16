import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { getUserWorkspace } from "@/lib/auth";
import { generateApiToken, hashToken } from "@/lib/tokens";
import { and, desc, eq, isNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ws = await getUserWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ error: "no workspace" }, { status: 400 });

  const tokens = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      createdAt: apiTokens.createdAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, session.user.id), eq(apiTokens.workspaceId, ws.workspace.id)))
    .orderBy(desc(apiTokens.createdAt));

  return NextResponse.json({ tokens, workspaceId: ws.workspace.id, role: ws.role });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ws = await getUserWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ error: "no workspace" }, { status: 400 });
  if (ws.role === "viewer") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const raw = generateApiToken();
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId: session.user.id,
      workspaceId: ws.workspace.id,
      tokenHash: hashToken(raw),
      name: body.name || "Extension",
    })
    .returning();

  return NextResponse.json({
    id: row?.id,
    token: raw,
    warning: "Copy this token now. It will not be shown again.",
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession(req);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, session.user.id), isNull(apiTokens.revokedAt)));

  return NextResponse.json({ ok: true });
}
