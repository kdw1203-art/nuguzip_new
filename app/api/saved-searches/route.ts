/**
 * /api/saved-searches
 *  - GET  : 현재 로그인 사용자의 저장 검색 목록 { items: SavedSearch[] } (비로그인 → [])
 *  - POST : 저장 검색 생성 (body { label, query?, scope?, filters? }) — 사용자당 30회/시간
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSavedSearch, listSavedSearches } from "@/lib/saved-search/store";
import { isScope, type SavedSearchScope } from "@/lib/saved-search/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ items: [] });

  const items = await listSavedSearches(email);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rl = rateLimit(`saved-search:create:${email}`, {
    limit: 30,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const label = String(b.label ?? "").trim();
  if (label.length < 1) {
    return NextResponse.json({ error: "검색 이름을 입력해 주세요." }, { status: 400 });
  }
  const query = String(b.query ?? "").trim();
  const scopeRaw = String(b.scope ?? "map").trim();
  const scope: SavedSearchScope = isScope(scopeRaw) ? scopeRaw : "map";
  const filters =
    b.filters && typeof b.filters === "object" && !Array.isArray(b.filters)
      ? (b.filters as Record<string, unknown>)
      : {};

  const result = await createSavedSearch({ email, label, query, scope, filters });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "저장에 실패했습니다." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
