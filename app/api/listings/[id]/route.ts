/**
 * 매물 수정/삭제 — /api/listings/[id]
 *   PATCH  : 소유자 본인 매물의 편집 가능 필드 갱신(승인·반려건은 재검수 pending 전환)
 *   DELETE : 소유자 본인 매물 소프트 삭제(deleted_at)
 * 로그인 필수 + 소유권은 store(updateListing/deleteListing)에서 강제.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  updateListing,
  deleteListing,
  isListingType,
  type ListingEditPatch,
} from "@/lib/listings/store-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** undefined=미지정(변경 안 함), null/빈문자=비움, 그 외=숫자(무효값은 null) */
function numOrNull(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function errorStatus(msg: string | undefined): number {
  if (!msg) return 500;
  if (msg.includes("본인")) return 403;
  if (msg.includes("찾을 수 없")) return 404;
  if (msg.includes("마감") || msg.includes("삭제")) return 409;
  return 400;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const listingId = String(id ?? "").trim();
  if (!listingId) {
    return NextResponse.json({ error: "매물 ID가 필요합니다." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const patch: ListingEditPatch = {};
  if (body.listingType !== undefined) {
    const t = String(body.listingType);
    if (!isListingType(t)) {
      return NextResponse.json({ error: "거래 유형이 올바르지 않아요." }, { status: 400 });
    }
    patch.listingType = t;
  }
  const price = numOrNull(body.priceKrw);
  if (price !== undefined) patch.priceKrw = price;
  const deposit = numOrNull(body.depositKrw);
  if (deposit !== undefined) patch.depositKrw = deposit;
  const monthly = numOrNull(body.monthlyKrw);
  if (monthly !== undefined) patch.monthlyKrw = monthly;
  const area = numOrNull(body.areaM2);
  if (area !== undefined) patch.areaM2 = area;
  const floor = numOrNull(body.floor);
  if (floor !== undefined) patch.floor = floor;
  if (body.description !== undefined) {
    patch.description =
      body.description === null ? null : String(body.description).slice(0, 2000);
  }
  if (body.contact !== undefined) {
    patch.contact = body.contact === null ? null : String(body.contact).slice(0, 100);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없어요." }, { status: 400 });
  }

  const res = await updateListing(listingId, email, patch);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: errorStatus(res.error) });
  }
  return NextResponse.json({ ok: true, status: res.status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const listingId = String(id ?? "").trim();
  if (!listingId) {
    return NextResponse.json({ error: "매물 ID가 필요합니다." }, { status: 400 });
  }

  const res = await deleteListing(listingId, email);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: errorStatus(res.error) });
  }
  return NextResponse.json({ ok: true });
}
