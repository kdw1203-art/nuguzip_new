/**
 * 크리에이터 유료 리포트 판매 API
 *
 * POST /api/creator/reports — 내 노트/분석을 유료 리포트로 판매 등록 (인증 크리에이터 전용)
 *   · 제목·설명·가격(포인트)을 받아 reports 테이블에 저장 (author_id=이메일, is_premium=true).
 *   · 기존 컬럼만 사용 — 스키마 변경 없음.
 * GET  /api/creator/reports — 내 리포트 판매 실적 + 정산 예정 집계 (대시보드 새로고침용)
 */
import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isCreator } from "@/lib/creator/gate";
import { getCreatorSales } from "@/lib/creator/sales";
import { createReport } from "@/lib/reports/store-db";
import { applyRateLimit, WRITE_RATE_LIMIT, READ_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PRICE = 100;
const MAX_PRICE = 100_000;

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const sales = await getCreatorSales(email);
  return NextResponse.json({ sales });
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 크리에이터 게이트 (인증 전문가 OR 공개 노트 보유)
  if (!(await isCreator(email))) {
    return NextResponse.json(
      { error: "유료 리포트 판매는 전문가 인증 또는 공개 노트 보유 후 가능합니다." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: unknown;
    description?: unknown;
    price?: unknown;
    category?: unknown;
    region?: unknown;
    sourceNoteId?: unknown;
  };

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const price = Math.floor(Number(body.price));

  if (title.length < 2) {
    return NextResponse.json({ error: "제목을 2자 이상 입력해 주세요." }, { status: 400 });
  }
  if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) {
    return NextResponse.json(
      { error: `가격은 ${MIN_PRICE}P 이상 ${MAX_PRICE.toLocaleString("ko-KR")}P 이하로 설정해 주세요.` },
      { status: 400 },
    );
  }

  try {
    const report = await createReport({
      title,
      subtitle: description || undefined,
      previewContent: description || undefined,
      category: (body.category ? String(body.category).trim() : "") || "유료 리포트",
      region: body.region ? String(body.region).trim() : undefined,
      price,
      isPremium: true,
      authorEmail: email,
      authorLabel: session?.user?.name ?? email,
    });
    return NextResponse.json({ ok: true, report }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "리포트 등록에 실패했습니다." },
      { status: 500 },
    );
  }
}
