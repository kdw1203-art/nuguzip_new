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
import { logger } from "@/lib/log";
import { isInternalPath } from "@/lib/safe-path";
import {
  listAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  type BannerPlacement,
} from "@/lib/admin/banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CTA 링크 형식 검사.
 * 실제로 있던 사고: 홈 배너 3건이 `/ai-analysis` `/groups` `/pricing` 로 걸려 있었는데
 * 셋 다 없는 경로라 누르면 404 였다. 경로 존재 여부까지는 서버가 알 수 없으므로
 * (라우트 목록이 런타임에 없다) 형식만 막고, 실제 도달 여부는 어드민 화면의
 * "링크 확인" 버튼이 같은 오리진으로 직접 호출해서 상태코드로 보여준다.
 */
function invalidCtaUrl(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (s.startsWith("/")) {
    /* `//` 만 막으면 `/\evil.com` 이 통과한다. 배너 CTA 는 모든 방문자에게 노출되는
       링크라, 여기가 뚫리면 우리 도메인 배너가 외부로 보내는 발판이 된다.
       (lib/safe-path.ts — 브라우저가 경로의 역슬래시를 슬래시로 정규화한다) */
    if (!isInternalPath(s)) {
      return "CTA 링크가 올바르지 않습니다. (// 또는 /\\ 로 시작할 수 없습니다)";
    }
    return null;
  }
  if (/^https:\/\//i.test(s)) return null;
  return "CTA 링크는 내부 경로(/로 시작) 또는 https:// 주소여야 합니다.";
}

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

  // 어드민은 꺼둔 배너·기간 지난 배너까지 봐야 되살리거나 기간을 늘릴 수 있다.
  const url = new URL(req.url);
  const placement = url.searchParams.get("placement") as BannerPlacement | null;
  /* 2026-07-26: listAllBanners 가 실패를 삼키고 [] 를 주던 걸 던지도록 고쳤다.
     여기서 다시 삼켜 200 { banners: [] } 를 주면 클라이언트는 "등록 0건"으로
     그린다 — 조회 실패는 빈 목록이 아니라 503 이다. */
  try {
    const all = await listAllBanners();
    const banners = placement ? all.filter((b) => b.placement === placement) : all;
    return NextResponse.json({ banners });
  } catch (e) {
    logger.error("[api/admin/banners] 배너 목록 조회 실패", e);
    return NextResponse.json(
      { error: "배너 목록을 지금 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
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
  const ctaErr = invalidCtaUrl(body.ctaUrl);
  if (ctaErr) return NextResponse.json({ error: ctaErr }, { status: 400 });

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
  const ctaErr = invalidCtaUrl(body.ctaUrl);
  if (ctaErr) return NextResponse.json({ error: ctaErr }, { status: 400 });

  const ok = await updateBanner(id, {
    ...(body.title !== undefined ? { title: String(body.title) } : {}),
    ...(body.subtitle !== undefined ? { subtitle: body.subtitle ? String(body.subtitle) : null } : {}),
    ...(body.ctaLabel !== undefined ? { ctaLabel: body.ctaLabel ? String(body.ctaLabel) : null } : {}),
    ...(body.ctaUrl !== undefined ? { ctaUrl: body.ctaUrl ? String(body.ctaUrl) : null } : {}),
    ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl ? String(body.imageUrl) : null } : {}),
    ...(body.textColor !== undefined ? { textColor: String(body.textColor) } : {}),
    ...(body.targetPlan !== undefined
      ? { targetPlan: body.targetPlan ? String(body.targetPlan) : null }
      : {}),
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
