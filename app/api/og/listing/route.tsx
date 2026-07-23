/**
 * GET /api/og/listing?title=&price=&region=&area=&type=
 * 매물 상세 공유용 동적 OG 카드 (1200×630, next/og ImageResponse).
 * app/api/og/complex/route.tsx 스타일 미러 — 리퀴드 글래스 무드 + 시스템 폰트.
 * - 좌: 누구집 로고 + 거래유형 칩 + 단지/제목 + 지역·전용면적
 * - 우: 가격 카드
 * - 쿼리 값은 60자 절단 후 JSX 텍스트로만 렌더 (XSS 안전)
 */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { OG_SIZE } from "@/lib/og/theme";
import { OG_FONT_FAMILY, ogFonts } from "@/lib/og/font";

/** 쿼리 값 정규화 — 60자 절단 + 공백 정리 */
function q(req: NextRequest, key: string, fallback: string): string {
  const raw = req.nextUrl.searchParams.get(key);
  const v = (raw ?? "").trim();
  return (v.length > 0 ? v : fallback).slice(0, 60);
}

export async function GET(req: NextRequest) {
  const title = q(req, "title", "누구집 매물");
  const price = q(req, "price", "");
  const region = q(req, "region", "");
  const area = q(req, "area", "");
  const type = q(req, "type", "매물");

  const subParts = [region, area].filter((s) => s.length > 0);
  const subline = subParts.join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: "#f7f9fc",
          fontFamily: OG_FONT_FAMILY,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* 좌상단 파란 radial 블롭 (리퀴드 글래스 무드) */}
        <div
          style={{
            position: "absolute",
            top: "-220px",
            left: "-180px",
            width: "620px",
            height: "620px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle at center, rgba(29,79,216,0.22) 0%, rgba(29,79,216,0.08) 45%, rgba(29,79,216,0) 70%)",
            display: "flex",
          }}
        />
        {/* 우하단 보조 블롭 */}
        <div
          style={{
            position: "absolute",
            bottom: "-260px",
            right: "-200px",
            width: "560px",
            height: "560px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle at center, rgba(29,79,216,0.10) 0%, rgba(29,79,216,0) 65%)",
            display: "flex",
          }}
        />

        {/* 본문 */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 84px",
            gap: "48px",
          }}
        >
          {/* 좌측: 로고 + 유형 칩 + 제목 + 지역·면적 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              maxWidth: "640px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "13px",
                  background: "#1d4fd8",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  fontWeight: 800,
                }}
              >
                집
              </div>
              <div
                style={{
                  fontSize: "30px",
                  fontWeight: 800,
                  color: "#1d4fd8",
                  display: "flex",
                }}
              >
                누구집
              </div>
              <div
                style={{
                  marginLeft: "6px",
                  padding: "6px 14px",
                  borderRadius: "9999px",
                  background: "rgba(29,79,216,0.10)",
                  color: "#1d4fd8",
                  fontSize: "20px",
                  fontWeight: 800,
                  display: "flex",
                }}
              >
                {type}
              </div>
            </div>
            <div
              style={{
                fontSize: "48px",
                fontWeight: 800,
                color: "#111827",
                lineHeight: 1.25,
                display: "flex",
                wordBreak: "break-all",
              }}
            >
              {title}
            </div>
            {subline && (
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 600,
                  color: "#5b6472",
                  display: "flex",
                }}
              >
                {subline}
              </div>
            )}
          </div>

          {/* 우측: 가격 카드 (글래스 카드) */}
          {price && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "10px",
                padding: "40px 48px",
                borderRadius: "28px",
                background: "rgba(255,255,255,0.72)",
                border: "1px solid rgba(29,79,216,0.12)",
                boxShadow: "0 24px 60px rgba(29,79,216,0.10)",
              }}
            >
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#7b8494",
                  display: "flex",
                }}
              >
                호가
              </div>
              <div
                style={{
                  fontSize: "68px",
                  fontWeight: 800,
                  color: "#111827",
                  lineHeight: 1.1,
                  display: "flex",
                }}
              >
                {price}
              </div>
            </div>
          )}
        </div>

        {/* 하단 캡션 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 84px 44px",
            fontSize: "22px",
            fontWeight: 600,
            color: "#7b8494",
          }}
        >
          실거래가와 비교하며 확인하세요 · nuguzip.com
        </div>
      </div>
    ),
    { width: OG_SIZE.width, height: OG_SIZE.height, ...ogFonts() },
  );
}
