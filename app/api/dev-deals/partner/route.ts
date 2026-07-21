/**
 * 협력업체 등록 API.
 * POST /api/dev-deals/partner — authed(safeAuth) · 속도 제한 · {ok,id} 반환.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { createPartner } from "@/lib/dev-deals/write";
import { isPartnerType, isPartnerField, maskContact } from "@/lib/dev-deals/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** http(s) URL만 허용 */
function toUrl(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || !/^https?:\/\//i.test(s)) return null;
  return s.slice(0, 500);
}

export async function POST(req: NextRequest) {
  const rlIp = rateLimit(`dev-partner-create:${getClientIp(req)}`, {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfterSec);

  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rlUser = rateLimit(`dev-partner-create:user:${email}`, {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rlUser.ok) return tooManyRequests(rlUser.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const companyName = String(body.companyName ?? "").trim().slice(0, 120);
  if (companyName.length < 2) {
    return NextResponse.json(
      { error: "회사명을 2자 이상 입력해 주세요." },
      { status: 400 },
    );
  }

  const partnerType = String(body.partnerType ?? "").trim();
  if (!isPartnerType(partnerType)) {
    return NextResponse.json(
      { error: "협력업체 유형을 선택해 주세요." },
      { status: 400 },
    );
  }

  const specialties = Array.isArray(body.specialties)
    ? Array.from(
        new Set(
          body.specialties
            .map((x) => String(x).trim())
            .filter((x) => isPartnerField(x)),
        ),
      )
    : [];

  const region = String(body.region ?? "").trim().slice(0, 60) || null;
  const intro = String(body.intro ?? "").trim().slice(0, 2000) || null;
  const portfolioUrl = toUrl(body.portfolioUrl);
  const contactPhone = String(body.contactPhone ?? "").trim().slice(0, 40) || null;
  const contactMasked = maskContact(contactPhone);

  const result = await createPartner({
    ownerEmail: email,
    companyName,
    partnerType,
    specialties,
    region,
    intro,
    portfolioUrl,
    contactMasked,
    contactEmail: email,
    contactPhone,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "등록에 실패했어요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
