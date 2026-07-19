/**
 * /api/admin/business
 *  GET    : { partners, inquiries }
 *  POST   : { kind: "partner"|"inquiry", ...payload }
 *  PATCH  : { kind, id, ...patch }
 *  DELETE : ?kind=&id=
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createB2bInquiry,
  createBusinessPartner,
  deleteB2bInquiry,
  deleteBusinessPartner,
  listB2bInquiries,
  listBusinessPartners,
  updateB2bInquiry,
  updateBusinessPartner,
  type B2bInquiryStatus,
  type PartnerStatus,
  type PartnerType,
} from "@/lib/admin/business-dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertAdmin() {
  const s = await auth();
  if (!s?.user?.email || s.user.role !== "admin") return null;
  return s;
}

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const [partners, inquiries] = await Promise.all([listBusinessPartners(), listB2bInquiries()]);
  return NextResponse.json({ partners, inquiries });
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(body.kind ?? "partner");

  if (kind === "partner") {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name 필수" }, { status: 400 });
    const ok = await createBusinessPartner({
      name,
      partnerType: (body.partnerType as PartnerType) ?? "corporate",
      contact: body.contact ? String(body.contact) : null,
      contractStatus: (body.contractStatus as PartnerStatus) ?? "lead",
      dealSizeKrw: Number(body.dealSizeKrw ?? 0),
      ownerEmail: body.ownerEmail ? String(body.ownerEmail) : null,
      notesMd: body.notesMd ? String(body.notesMd) : "",
    });
    if (!ok) return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  if (kind === "inquiry") {
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "title 필수" }, { status: 400 });
    const ok = await createB2bInquiry({
      partnerId: body.partnerId ? String(body.partnerId) : null,
      title,
      bodyMd: body.bodyMd ? String(body.bodyMd) : "",
      status: (body.status as B2bInquiryStatus) ?? "open",
      dueAt: body.dueAt ? String(body.dueAt) : null,
    });
    if (!ok) return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  return NextResponse.json({ error: "알 수 없는 kind" }, { status: 400 });
}

export async function PATCH(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "");
  const kind = String(body.kind ?? "partner");
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  if (kind === "partner") {
    const ok = await updateBusinessPartner(id, {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.partnerType !== undefined ? { partnerType: body.partnerType as PartnerType } : {}),
      ...(body.contact !== undefined ? { contact: body.contact ? String(body.contact) : null } : {}),
      ...(body.contractStatus !== undefined ? { contractStatus: body.contractStatus as PartnerStatus } : {}),
      ...(body.dealSizeKrw !== undefined ? { dealSizeKrw: Number(body.dealSizeKrw) } : {}),
      ...(body.ownerEmail !== undefined ? { ownerEmail: body.ownerEmail ? String(body.ownerEmail) : null } : {}),
      ...(body.notesMd !== undefined ? { notesMd: String(body.notesMd) } : {}),
      ...(body.lastContactedAt !== undefined ? { lastContactedAt: body.lastContactedAt ? String(body.lastContactedAt) : null } : {}),
    });
    if (!ok) return NextResponse.json({ error: "수정 실패" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (kind === "inquiry") {
    const ok = await updateB2bInquiry(id, {
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.bodyMd !== undefined ? { bodyMd: String(body.bodyMd) } : {}),
      ...(body.status !== undefined ? { status: body.status as B2bInquiryStatus } : {}),
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? String(body.dueAt) : null } : {}),
      ...(body.partnerId !== undefined ? { partnerId: body.partnerId ? String(body.partnerId) : null } : {}),
    });
    if (!ok) return NextResponse.json({ error: "수정 실패" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 kind" }, { status: 400 });
}

export async function DELETE(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const kind = url.searchParams.get("kind") ?? "partner";
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  if (kind === "partner") {
    const ok = await deleteBusinessPartner(id);
    if (!ok) return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (kind === "inquiry") {
    const ok = await deleteB2bInquiry(id);
    if (!ok) return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 kind" }, { status: 400 });
}
