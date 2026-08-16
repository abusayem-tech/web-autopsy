import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  activity,
  advice,
  autopsies,
  briefs,
  comments,
  findings,
  portableApis,
  users,
} from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { getUserWorkspace } from "@/lib/auth";
import { and, desc, eq } from "drizzle-orm";
import JSZip from "jszip";
import { toOpenApi, toPostmanCollection } from "@web-autopsy/core";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ws = await getUserWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ error: "no workspace" }, { status: 400 });
  const { id } = await params;

  const format = req.nextUrl.searchParams.get("format");

  const [row] = await db
    .select()
    .from(autopsies)
    .where(and(eq(autopsies.id, id), eq(autopsies.workspaceId, ws.workspace.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [brief] = await db.select().from(briefs).where(eq(briefs.autopsyId, id)).limit(1);
  const findingRows = await db.select().from(findings).where(eq(findings.autopsyId, id));
  const apiRows = await db.select().from(portableApis).where(eq(portableApis.autopsyId, id));
  const adviceRows = await db.select().from(advice).where(eq(advice.autopsyId, id));
  const commentRows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.autopsyId, id))
    .orderBy(desc(comments.createdAt));

  if (format === "postman") {
    return NextResponse.json(
      toPostmanCollection(
        apiRows.map((a) => ({
          method: a.method,
          url: a.url,
          humanName: a.humanName,
          headers: {},
        })),
        row.title,
      ),
    );
  }
  if (format === "openapi") {
    return NextResponse.json(
      toOpenApi(
        apiRows.map((a) => ({
          method: a.method,
          url: a.url,
          humanName: a.humanName,
          purpose: a.purpose,
        })),
        row.title,
      ),
    );
  }
  if (format === "zip") {
    const zip = new JSZip();
    const folder = zip.folder("rebuild-kit")!;
    folder.file(
      "meta.json",
      JSON.stringify(
        { url: row.pageUrl, title: row.title, capturedAt: row.savedAt, origin: row.origin },
        null,
        2,
      ),
    );
    if (row.htmlSnapshot) folder.file("page.html", row.htmlSnapshot);
    // Screenshots are not stored; image URLs live in payload.images.
    const payload = row.payload as {
      images?: unknown;
      performance?: unknown;
      scripts?: Array<{ src?: string }>;
    };
    folder.file("images.json", JSON.stringify(payload.images ?? [], null, 2));
    folder.file(
      "styles.json",
      JSON.stringify(
        (payload.scripts ?? []).filter((s) => s.src).map((s) => s.src),
        null,
        2,
      ),
    );
    folder.file("apis.json", JSON.stringify(apiRows, null, 2));
    folder.file("performance.json", JSON.stringify(payload.performance ?? row.summary, null, 2));
    folder.file("story.md", brief?.story ?? "");
    folder.file("advice.json", JSON.stringify(adviceRows, null, 2));
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="autopsy-${id}.zip"`,
      },
    });
  }

  const canSeeSecrets = ws.role !== "viewer" && row.includesSecrets;

  return NextResponse.json({
    autopsy: {
      ...row,
      screenshotPng: undefined,
      hasScreenshot: Boolean(row.screenshotPng),
      payload: canSeeSecrets ? row.payload : row.payload,
      includesSecrets: row.includesSecrets && canSeeSecrets,
    },
    brief,
    findings: findingRows,
    portableApis: apiRows,
    advice: adviceRows,
    comments: commentRows,
    role: ws.role,
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireSession(req);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ws = await getUserWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ error: "no workspace" }, { status: 400 });
  if (ws.role === "viewer") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json()) as { body?: string };
  if (!body.body?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

  const [row] = await db
    .select()
    .from(autopsies)
    .where(and(eq(autopsies.id, id), eq(autopsies.workspaceId, ws.workspace.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [c] = await db
    .insert(comments)
    .values({ autopsyId: id, userId: session.user.id, body: body.body.trim() })
    .returning();

  await db.insert(activity).values({
    workspaceId: ws.workspace.id,
    userId: session.user.id,
    verb: "commented",
    autopsyId: id,
  });

  return NextResponse.json({ comment: c });
}
