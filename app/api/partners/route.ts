/**
 * 중개사 제휴 신청 — POST /api/partners
 * partnership_inquiries(inquiry_type/company/name/email/phone/message) 재사용 저장.
 * 공개 폼(로그인 불필요) — IP당 3회/시간 제한.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(`partner-inquiry:${getClientIp(req)}`, {
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const company = String(body.company ?? "").trim().slice(0, 80);
  const name = String(body.name ?? "").trim().slice(0, 40);
  const email = String(body.email ?? "").trim().slice(0, 120);
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const licenseNo = String(body.licenseNo ?? "").trim().slice(0, 60);
  const region = String(body.region ?? "").trim().slice(0, 60);
  const message = String(body.message ?? "").trim().slice(0, 1000);

  if (company.length < 2) {
    return NextResponse.json({ error: "상호를 입력해 주세요." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "대표자명을 입력해 주세요." }, { status: 400 });
  }
  if (!licenseNo) {
    return NextResponse.json(
      { error: "중개사무소 등록번호를 입력해 주세요." },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "회신받을 이메일을 정확히 입력해 주세요." },
      { status: 400 },
    );
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }

  const composed = [
    `중개사무소 등록번호: ${licenseNo}`,
    region ? `활동 지역: ${region}` : null,
    message ? `문의 내용: ${message}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // inquiry_type check 제약: 'invest' | 'partner' | 'ad' — 중개사 제휴는 'partner'
  const { error } = await sb.from("partnership_inquiries").insert({
    inquiry_type: "partner",
    company,
    name,
    email,
    phone,
    message: `[중개사 제휴]\n${composed}`,
  });
  if (error) {
    return NextResponse.json(
      { error: "접수에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
