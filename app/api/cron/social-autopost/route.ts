/**
 * GET/POST /api/cron/social-autopost — 소셜 소재 자동 생성 (하루 1건).
 *
 * 임장노트(공개·운영자 작성·미발행) 1건을 골라 1080×1920 슬라이드 영상으로
 * 렌더링(satori 프레임 + ffmpeg 인코딩)해 스토리지에 올리고 업로드 큐에 넣는다.
 * 노트가 소진되면 홍보 로테이션(수치는 DB 실측 + 기준시점 표기)으로 대체.
 * 실제 발행은 15분 드레인 크론이 맡는다 — 이 라우트는 "만들어서 줄 세우기"까지.
 *
 * 같은 소재의 중복 발행은 코드가 아니라 DB(부분 유니크 인덱스)가 막는다.
 * 이미 오늘 만든 홍보/이미 발행된 노트면 unique 충돌 → duplicated: true 로 보고.
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET Bearer/헤더 · 관리자 세션)
 * 호출원: pg_cron `social-autopost` (매일 02:00 UTC = 11:00 KST, vault 시크릿)
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { generateAndEnqueue } from "@/lib/social/autopost";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  try {
    const result = await generateAndEnqueue();
    return NextResponse.json({ ok: true, ...result, finishedAt: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    /* 유니크 충돌 = 오늘치 소재가 이미 큐에 있다 — 오류가 아니라 멱등 성공이다.
       그 외 실패는 500 으로 드러낸다(조용한 200 은 "만들어졌겠지"를 낳는다). */
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json({ ok: true, duplicated: true, note: "오늘치 소재가 이미 큐에 있음" });
    }
    logger.warn("[social:autopost]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
