import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invites, users, workspaceMembers, workspaces } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { getUserWorkspace } from "@/lib/auth";
import { generateInviteToken, hashToken } from "@/lib/tokens";
import { and, eq, isNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ws = await getUserWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ error: "no workspace" }, { status: 400 });

  const members = await db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, ws.workspace.id));

  const pending = await db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(and(eq(invites.workspaceId, ws.workspace.id), isNull(invites.acceptedAt)));

  return NextResponse.json({
    workspace: ws.workspace,
    role: ws.role,
    members,
    invites: pending,
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ws = await getUserWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ error: "no workspace" }, { status: 400 });
  if (ws.role !== "owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as { email?: string; role?: string };
  if (!body.email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const role = body.role === "viewer" || body.role === "member" ? body.role : "member";
  const raw = generateInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [inv] = await db
    .insert(invites)
    .values({
      workspaceId: ws.workspace.id,
      email: body.email.toLowerCase(),
      role,
      tokenHash: hashToken(raw),
      expiresAt,
    })
    .returning();

  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "";
  return NextResponse.json({
    id: inv?.id,
    inviteUrl: `${base}/invite?token=${raw}`,
    email: body.email,
  });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession(req);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { token?: string };
  if (!body.token) return NextResponse.json({ error: "token required" }, { status: 400 });
  const tokenHash = hashToken(body.token);
  const [inv] = await db.select().from(invites).where(eq(invites.tokenHash, tokenHash)).limit(1);
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
    return NextResponse.json({ error: "invalid invite" }, { status: 400 });
  }
  if (inv.email.toLowerCase() !== session.user.email?.toLowerCase()) {
    return NextResponse.json({ error: "email mismatch" }, { status: 403 });
  }

  await db
    .insert(workspaceMembers)
    .values({ workspaceId: inv.workspaceId, userId: session.user.id, role: inv.role })
    .onConflictDoNothing();
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inv.id));
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, inv.workspaceId)).limit(1);
  return NextResponse.json({ ok: true, workspace: ws });
}
