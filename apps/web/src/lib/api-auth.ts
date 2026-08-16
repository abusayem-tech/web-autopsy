import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, workspaceMembers } from "@/db/schema";
import { hashToken } from "@/lib/tokens";
import { auth } from "@/lib/auth";

export async function requireSession(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  return session;
}

export async function requireApiToken(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  const tokenHash = hashToken(match[1]);
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)))
    .limit(1);
  const token = rows[0];
  if (!token) return null;
  const member = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, token.workspaceId),
        eq(workspaceMembers.userId, token.userId),
      ),
    )
    .limit(1);
  if (!member[0] || member[0].role === "viewer") return null;
  return { token, role: member[0].role };
}
