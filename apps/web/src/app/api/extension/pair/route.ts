import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { getUserWorkspace } from "@/lib/auth";
import { generateApiToken, hashToken } from "@/lib/tokens";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Creates (or reuses) an extension API token for the signed-in user and returns
 * the raw token once so the website can push it into the extension automatically.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ws = await getUserWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ error: "no workspace" }, { status: 400 });
  if (ws.role === "viewer") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Revoke any previous auto-paired tokens named the same, then mint a fresh one.
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiTokens.userId, session.user.id),
        eq(apiTokens.workspaceId, ws.workspace.id),
        eq(apiTokens.name, "Chrome extension (auto)"),
        isNull(apiTokens.revokedAt),
      ),
    );

  const raw = generateApiToken();
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId: session.user.id,
      workspaceId: ws.workspace.id,
      tokenHash: hashToken(raw),
      name: "Chrome extension (auto)",
    })
    .returning();

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  return NextResponse.json({
    id: row?.id,
    token: raw,
    apiBaseUrl: origin.replace(/\/$/, ""),
    extensionId: process.env.NEXT_PUBLIC_EXTENSION_ID || "fbpilhkaigbhjhcccoonbkcgpgoegpda",
  });
}
