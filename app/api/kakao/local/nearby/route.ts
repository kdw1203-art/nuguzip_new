/**
 * GET /api/kakao/local/nearby
 * 카카오 로컬 키워드 검색 프록시 — 선택 지역 반경 전문가(공인중개사 등) 1차 연동
 *
 * ?lat=37.5&lng=127&preset=agent&radius=1000
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import {
  getKakaoRestApiKey,
  kakaoLocalKeywordSearch,
} from "@/lib/kakao/rest-client";
import {
  LOCAL_PROFESSION_PRESETS,
  type LocalProfessionPreset,
} from "@/lib/kakao/profession-presets";

export const runtime = "nodejs";

const PRESET_KEYS = new Set(Object.keys(LOCAL_PROFESSION_PRESETS));

/** Kakao REST 키 보호 — IP당 분당 20회 */
const KAKAO_PROXY_RATE_LIMIT = { max: 20, windowMs: 60_000 };

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, KAKAO_PROXY_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json(
      {
        configured: false,
        items: [],
        hint: "로그인 후 주변 업체 검색을 이용할 수 있습니다.",
        errorCode: "login_required",
      },
      { status: 401 },
    );
  }

  const { searchParams } = req.nextUrl;
  const lat = Number.parseFloat(searchParams.get("lat") ?? "");
  const lng = Number.parseFloat(searchParams.get("lng") ?? "");
  const preset = (searchParams.get("preset") ?? "agent") as LocalProfessionPreset;
  const radiusRaw = Number.parseInt(searchParams.get("radius") ?? "1000", 10);
  const radius = Number.isFinite(radiusRaw)
    ? Math.min(20_000, Math.max(500, radiusRaw))
    : 1000;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat, lng required" }, { status: 400 });
  }

  if (!PRESET_KEYS.has(preset)) {
    return NextResponse.json({ error: "unknown preset" }, { status: 400 });
  }

  if (!getKakaoRestApiKey()) {
    return NextResponse.json({
      configured: false,
      items: [],
      label: LOCAL_PROFESSION_PRESETS[preset].label,
      hint: "KAKAO_REST_API_KEY 미설정 — 데모 모드",
    });
  }

  const { query, label } = LOCAL_PROFESSION_PRESETS[preset];
  const result = await kakaoLocalKeywordSearch({
    query,
    lat,
    lng,
    radiusM: radius,
    size: 8,
  });

  const hint =
    result.items.length > 0
      ? undefined
      : result.errorCode === "invalid_key"
        ? "REST API 키가 유효하지 않습니다. Kakao Developers에서 Local API 활성화·키 종류를 확인하세요."
        : result.errorCode === "missing_key"
          ? "KAKAO_REST_API_KEY 미설정"
          : result.errorCode
            ? `Kakao API 오류 (${result.errorCode})`
            : "반경 내 검색 결과가 없습니다.";

  return NextResponse.json({
    configured: true,
    preset,
    label,
    items: result.items,
    hint,
    errorCode: result.errorCode ?? null,
  });
}
