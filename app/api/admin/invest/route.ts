/**
 * /api/admin/invest
 *  - GET   : 문서 + 투자자 권한 + 다운로드 로그 한꺼번에
 *  - POST  : { kind: "document" | "access", ...payload } 로 분기 (생성)
 *  - PATCH : { kind: "document", id, ...patch }
 *  - DELETE: ?kind=document&id= / ?kind=access&email=
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createIrDocument,
  deleteIrDocument,
  grantIrInvestorAccess,
  listIrDocuments,
  listIrDownloadsLog,
  listIrInvestorAccess,
  revokeIrInvestorAccess,
  updateIrDocument,
} from "@/lib/admin/business-dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user?.email) return null;
  if (session.user.role !== "admin") return null;
  return session;
}

export async function GET() {
  const s = await assertAdmin();
  if (!s) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const [documents, access, downloads] = await Promise.all([
    listIrDocuments(),
    listIrInvestorAccess(),
    listIrDownloadsLog(50),
  ]);
  return NextResponse.json({ documents, access, downloads });
}

export async function POST(req: Request) {
  const s = await assertAdmin();
  if (!s) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(body.kind ?? "document");

  if (kind === "document") {
    const version = String(body.version ?? "").trim();
    const title = String(body.title ?? "").trim();
    if (!version || !title) {
      return NextResponse.json({ error: "version과 title은 필수입니다." }, { status: 400 });
    }
    const created = await createIrDocument({
      version,
      title,
      summaryMd: body.summaryMd ? String(body.summaryMd) : "",
      filePath: body.filePath ? String(body.filePath) : null,
      isPublished: Boolean(body.isPublished),
      createdBy: s.user.email ?? undefined,
    });
    if (!created) return NextResponse.json({ error: "Supabase 미설정 또는 생성 실패" }, { status: 503 });
    return NextResponse.json({ document: created }, { status: 201 });
  }

  if (kind === "access") {
    const email = String(body.email ?? "").trim();
    if (!email) return NextResponse.json({ error: "email 필수" }, { status: 400 });
    const ok = await grantIrInvestorAccess({
      email,
      role: body.role === "editor" ? "editor" : "viewer",
      grantedBy: s.user.email ?? undefined,
    });
    if (!ok) return NextResponse.json({ error: "Supabase 미설정 또는 실패" }, { status: 503 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  return NextResponse.json({ error: "알 수 없는 kind" }, { status: 400 });
}

export async function PATCH(req: Request) {
  const s = await assertAdmin();
  if (!s) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  const ok = await updateIrDocument(id, {
    ...(body.version !== undefined ? { version: String(body.version) } : {}),
    ...(body.title !== undefined ? { title: String(body.title) } : {}),
    ...(body.summaryMd !== undefined ? { summaryMd: String(body.summaryMd) } : {}),
    ...(body.filePath !== undefined ? { filePath: body.filePath ? String(body.filePath) : null } : {}),
    ...(body.isPublished !== undefined ? { isPublished: Boolean(body.isPublished) } : {}),
  });
  if (!ok) return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await assertAdmin();
  if (!s) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "document";
  if (kind === "document") {
    const id = url.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
    const ok = await deleteIrDocument(id);
    if (!ok) return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (kind === "access") {
    const email = url.searchParams.get("email") ?? "";
    if (!email) return NextResponse.json({ error: "email 필수" }, { status: 400 });
    const ok = await revokeIrInvestorAccess(email);
    if (!ok) return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "알 수 없는 kind" }, { status: 400 });
}
