/**
 * GET /api/og/invite?by=
 * 친구 초대 공유용 동적 OG 카드 (1200×630, next/og ImageResponse).
 * - by: 추천인 마스킹 라벨(예: "ab***@gmail.com"). 없으면 "친구의 초대".
 * - 카카오/링크 공유 미리보기 CTR 향상 (A4). 쿼리는 절단 후 텍스트로만 렌더(XSS 안전).
 * - 폰트/사이즈는 공용 og 테마 재사용. 커스텀 이미지·외부 폰트 로드 없음.
 */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { OG_SIZE } from "@/lib/og/theme";
import { OG_FONT_FAMILY, ogFonts } from "@/lib/og/font";

export const runtime = "nodejs";

function q(req: NextRequest, key: string, fallback: string): string {
  const raw = req.nextUrl.searchParams.get(key);
  const v = (raw ?? "").trim();
  return (v.length > 0 ? v : fallback).slice(0, 48);
}

export async function GET(req: NextRequest) {
  const by = q(req, "by", "친구의 초대");

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f9fc",
          fontFamily: OG_FONT_FAMILY,
          position: "relative",
          overflow: "hidden",
          padding: "56px 72px",
        }}
      >
        {/* 좌상단 파란 radial 블롭 */}
        <div
          style={{
            position: "absolute",
            top: "-220px",
            left: "-180px",
            width: "600px",
            height: "600px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle at center, rgba(29,79,216,0.18) 0%, rgba(29,79,216,0.06) 45%, rgba(29,79,216,0) 70%)",
            display: "flex",
          }}
        />
        {/* 우하단 블롭 */}
        <div
          style={{
            position: "absolute",
            bottom: "-240px",
            right: "-160px",
            width: "560px",
            height: "560px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle at center, rgba(29,79,216,0.14) 0%, rgba(29,79,216,0) 70%)",
            display: "flex",
          }}
        />

        <div
          style={{
            width: "100%",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            background: "#ffffff",
            borderRadius: "32px",
            border: "1px solid rgba(17,24,39,0.08)",
            boxShadow: "0 24px 60px rgba(17,24,39,0.10)",
            padding: "60px 64px",
          }}
        >
          {/* 추천인 칩 */}
          <div style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#eaf0ff",
                color: "#1d4fd8",
                fontSize: "28px",
                fontWeight: 800,
                padding: "10px 22px",
                borderRadius: "9999px",
              }}
            >
              {by} 님이 초대했어요
            </div>
          </div>

          {/* 헤드라인 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: "28px",
              fontSize: "76px",
              lineHeight: 1.15,
              fontWeight: 800,
              color: "#191f28",
            }}
          >
            <span style={{ display: "flex" }}>가입하면</span>
            <span style={{ display: "flex" }}>
              둘 다&nbsp;<span style={{ color: "#1d4fd8" }}>300P</span>
            </span>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "24px",
              fontSize: "30px",
              color: "#4a5262",
              fontWeight: 500,
            }}
          >
            실거래가·시세 열람 · AI 임장 분석 · 부동산 커뮤니티
          </div>

          {/* 하단 브랜드 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: "44px",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                background: "linear-gradient(135deg, #3182f6 0%, #1d4ed8 100%)",
                color: "#ffffff",
                fontSize: "30px",
                fontWeight: 800,
              }}
            >
              누
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "30px",
                fontWeight: 800,
                color: "#191f28",
              }}
            >
              누구집
            </div>
            <div style={{ display: "flex", fontSize: "24px", color: "#8a93a3" }}>
              임장 기록이 판단 근거가 됩니다 · nuguzip.com
            </div>
          </div>
        </div>
      </div>
    ),
    { width: OG_SIZE.width, height: OG_SIZE.height, ...ogFonts() },
  );
}
