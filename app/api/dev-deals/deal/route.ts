/**
 * 개발물건 등록 API.
 * POST /api/dev-deals/deal — authed(safeAuth) · IP/계정당 속도 제한 · {ok,id} 반환.
 * 누구집은 소개·매칭 플랫폼으로 계약·정산에 관여하지 않는다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { createDeal } from "@/lib/dev-deals/write";
import { isDealType, isPartnerField, maskContact } from "@/lib/dev-deals/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 양수 파싱 — 범위 밖·비유한값이면 null */
function toPositiveNumber(v: unknown, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > max) return null;
  return n;
}

function toPositiveInt(v: unknown, max: number): number | null {
  const n = toPositiveNumber(v, max);
  return n != null ? Math.round(n) : null;
}

export async function POST(req: NextRequest) {
  const rlIp = rateLimit(`dev-deal-create:${getClientIp(req)}`, {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfterSec);

  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rlUser = rateLimit(`dev-deal-create:user:${email}`, {
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

  const title = String(body.title ?? "").trim().slice(0, 120);
  if (title.length < 2) {
    return NextResponse.json(
      { error: "제목을 2자 이상 입력해 주세요." },
      { status: 400 },
    );
  }

  const dealType = String(body.dealType ?? "").trim();
  if (!isDealType(dealType)) {
    return NextResponse.json(
      { error: "개발물건 유형을 선택해 주세요." },
      { status: 400 },
    );
  }

  const region = String(body.region ?? "").trim().slice(0, 60) || null;
  const address = String(body.address ?? "").trim().slice(0, 200) || null;

  const landAreaM2 = toPositiveNumber(body.landAreaM2, 1e7);
  const grossFloorAreaM2 = toPositiveNumber(body.grossFloorAreaM2, 1e7);
  const units = toPositiveInt(body.units, 100000);

  // 총사업비: 억 단위 입력 → 원 단위 저장 (상한 100조)
  const totalCostEok = toPositiveNumber(body.totalCostEok, 1_000_000);
  const totalCostKrw = totalCostEok != null ? Math.round(totalCostEok * 1e8) : null;

  const neededPartners = Array.isArray(body.neededPartners)
    ? Array.from(
        new Set(
          body.neededPartners
            .map((x) => String(x).trim())
            .filter((x) => isPartnerField(x)),
        ),
      )
    : [];

  const budgetText = String(body.budgetText ?? "").trim().slice(0, 200) || null;
  const summary = String(body.summary ?? "").trim().slice(0, 300) || null;
  const description = String(body.description ?? "").trim().slice(0, 4000) || null;
  const contactName = String(body.contactName ?? "").trim().slice(0, 60) || null;
  const contactPhone = String(body.contactPhone ?? "").trim().slice(0, 40) || null;
  const contactMasked = maskContact(contactPhone);

  const result = await createDeal({
    ownerEmail: email,
    title,
    dealType,
    region,
    address,
    landAreaM2,
    grossFloorAreaM2,
    units,
    totalCostKrw,
    neededPartners,
    budgetText,
    summary,
    description,
    contactName,
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
