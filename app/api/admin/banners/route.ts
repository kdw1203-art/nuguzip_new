/**
 * GET    /api/admin/banners            — 전체 배너 목록 (관리자)
 * POST   /api/admin/banners            — 배너 생성 (관리자)
 * PATCH  /api/admin/banners            — 배너 수정 (관리자, body: { id, ...fields })
 * DELETE /api/admin/banners?id=...     — 배너 삭제 (관리자)
 *
 * 일반 사용자용: GET /api/banners?placement=home
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  type BannerPlacement,
} from "@/lib/admin/banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user?.email) return null;
  if (session.user.role !== "admin") return null;
  return session;
}

export async function GET(req: Request) {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const url = new URL(req.url);
  const placement = url.searchParams.get("placement") as BannerPlacement | null;
  const banners = await listBanners(placement ?? undefined);
  return NextResponse.json({ banners });
}

export async function POST(req: Request) {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "제목은 필수입니다." }, { status: 400 });
  }

  const banner = await createBanner({
    title,
    subtitle: body.subtitle ? String(body.subtitle) : null,
    ctaLabel: body.ctaLabel ? String(body.ctaLabel) : null,
    ctaUrl: body.ctaUrl ? String(body.ctaUrl) : null,
    imageUrl: body.imageUrl ? String(body.imageUrl) : null,
    bgFrom: body.bgFrom ? String(body.bgFrom) : "#3182f6",
    bgTo: body.bgTo ? String(body.bgTo) : "#1d4ed8",
    textColor: body.textColor ? String(body.textColor) : "white",
    placement: (body.placement as BannerPlacement) ?? "home",
    isActive: body.isActive !== false,
    priority: Number(body.priority ?? 0),
    startsAt: body.startsAt ? String(body.startsAt) : null,
    endsAt: body.endsAt ? String(body.endsAt) : null,
    targetPlan: body.targetPlan ? String(body.targetPlan) : null,
    createdBy: session.user.email ?? undefined,
  });

  if (!banner) return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });
  return NextResponse.json({ banner }, { status: 201 });
}

export async function PATCH(req: Request) {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

  const ok = await updateBanner(id, {
    ...(body.title !== undefined ? { title: String(body.title) } : {}),
    ...(body.subtitle !== undefined ? { subtitle: body.subtitle ? String(body.subtitle) : null } : {}),
    ...(body.ctaLabel !== undefined ? { ctaLabel: body.ctaLabel ? String(body.ctaLabel) : null } : {}),
    ...(body.ctaUrl !== undefined ? { ctaUrl: body.ctaUrl ? String(body.ctaUrl) : null } : {}),
    ...(body.bgFrom !== undefined ? { bgFrom: String(body.bgFrom) } : {}),
    ...(body.bgTo !== undefined ? { bgTo: String(body.bgTo) } : {}),
    ...(body.placement !== undefined ? { placement: body.placement as BannerPlacement } : {}),
    ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
    ...(body.priority !== undefined ? { priority: Number(body.priority) } : {}),
    ...(body.startsAt !== undefined ? { startsAt: body.startsAt ? String(body.startsAt) : null } : {}),
    ...(body.endsAt !== undefined ? { endsAt: body.endsAt ? String(body.endsAt) : null } : {}),
  });

  if (!ok) return NextResponse.json({ error: "수정 실패 또는 Supabase 미설정" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

  const ok = await deleteBanner(id);
  if (!ok) return NextResponse.json({ error: "삭제 실패 또는 Supabase 미설정" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
