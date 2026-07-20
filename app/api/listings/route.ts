/**
 * 매물 API — 집주인 직접 등록 + 중개사 등록 (검수 후 노출).
 * GET  /api/listings — 공개, approved만 (author_email 비노출), 유형·구·단지 필터
 * POST /api/listings — authed, 3회/시간 → status=pending 저장 (어드민 검수 대기)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import {
  createListing,
  listApprovedListings,
  isListingType,
  isListingSource,
  type ListingType,
} from "@/lib/listings/store-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 등록자 라벨 — 닉네임 없으면 이메일 마스킹 (공개 목록에 원본 이메일 노출 금지) */
function authorLabel(name: string | null | undefined, email: string): string {
  const n = (name ?? "").trim();
  if (n) return n;
  const local = email.split("@")[0] ?? "";
  return `${local.slice(0, 2) || "등록"}** 님`;
}

/** "12.5" 같은 문자열/숫자 입력 → 유효한 양수 또는 null */
function toPositiveNumber(v: unknown, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > max) return null;
  return n;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const typeRaw = (sp.get("type") ?? "").trim();
  const items = await listApprovedListings({
    listingType: isListingType(typeRaw) ? typeRaw : undefined,
    regionName: (sp.get("gu") ?? "").trim() || undefined,
    complexName: (sp.get("complex") ?? "").trim() || undefined,
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  // IP당 1시간 3회 (인스턴스별 best-effort)
  const rlIp = rateLimit(`listing-create:${getClientIp(req)}`, {
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfterSec);

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 계정당 1시간 3회
  const rlUser = rateLimit(`listing-create:user:${session.user.email}`, {
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!rlUser.ok) return tooManyRequests(rlUser.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const listingType = String(body.listingType ?? "").trim();
  if (!isListingType(listingType)) {
    return NextResponse.json(
      { error: "유형은 매매·전세·월세 중 하나여야 합니다." },
      { status: 400 },
    );
  }

  const sourceRaw = String(body.source ?? "owner").trim();
  const source = isListingSource(sourceRaw) ? sourceRaw : "owner";

  const complexName = String(body.complexName ?? "").trim().slice(0, 80);
  if (complexName.length < 2) {
    return NextResponse.json(
      { error: "단지명(건물명)을 2자 이상 입력해 주세요." },
      { status: 400 },
    );
  }

  const regionName = String(body.regionName ?? "").trim().slice(0, 40) || null;

  // 유형별 가격 필드 (만원 단위 입력 → 원 단위 저장, 상한 1조)
  const MAX_KRW = 1e12;
  const priceKrw =
    listingType === "sale"
      ? toPositiveNumber(body.priceManwon, MAX_KRW / 1e4)
      : null;
  const depositKrw =
    listingType !== "sale" ? toPositiveNumber(body.depositManwon, MAX_KRW / 1e4) : null;
  const monthlyKrw =
    (listingType as ListingType) === "monthly"
      ? toPositiveNumber(body.monthlyManwon, 1e5)
      : null;

  if (listingType === "sale" && priceKrw === null) {
    return NextResponse.json({ error: "매매가(만원)를 입력해 주세요." }, { status: 400 });
  }
  if (listingType !== "sale" && depositKrw === null) {
    return NextResponse.json({ error: "보증금(만원)을 입력해 주세요." }, { status: 400 });
  }
  if (listingType === "monthly" && monthlyKrw === null) {
    return NextResponse.json({ error: "월세(만원)를 입력해 주세요." }, { status: 400 });
  }

  const areaM2 = toPositiveNumber(body.areaM2, 3000);
  const floorNum = body.floor === null || body.floor === undefined || body.floor === ""
    ? null
    : Number(body.floor);
  const floor =
    floorNum !== null && Number.isInteger(floorNum) && floorNum >= -5 && floorNum <= 200
      ? floorNum
      : null;

  const description = String(body.description ?? "").trim().slice(0, 2000) || null;
  const contact = String(body.contact ?? "").trim().slice(0, 120) || null;

  const agreed = body.agreeResponsibility === true;
  if (!agreed) {
    return NextResponse.json(
      { error: "허위매물 책임 고지에 동의해 주세요." },
      { status: 400 },
    );
  }

  try {
    const { id } = await createListing({
      authorEmail: session.user.email,
      authorLabel: authorLabel(session.user.name, session.user.email),
      source,
      listingType,
      complexName,
      regionName,
      priceKrw: priceKrw !== null ? Math.round(priceKrw * 1e4) : null,
      depositKrw: depositKrw !== null ? Math.round(depositKrw * 1e4) : null,
      monthlyKrw: monthlyKrw !== null ? Math.round(monthlyKrw * 1e4) : null,
      areaM2,
      floor,
      description,
      contact,
    });
    return NextResponse.json({ ok: true, id, status: "pending" }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "매물 등록 실패" },
      { status: 500 },
    );
  }
}
