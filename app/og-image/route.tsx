/**
 * GET /og-image — 사이트 기본 OG 카드 (S4, check:final-release "og-image route").
 *
 * 페이지 전용 카드(/api/og/complex·note·listing)가 없는 모든 공개 페이지의
 * 기본 공유 이미지. 정적 브랜드 카드라 쿼리를 받지 않는다 — 받는 순간
 * 임의 문자열이 이미지에 찍히는 통로가 된다.
 */
import { ImageResponse } from "next/og";
import { OG_SIZE } from "@/lib/og/theme";
import { OG_FONT_FAMILY, ogFonts } from "@/lib/og/font";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#f7f9fc",
          fontFamily: OG_FONT_FAMILY,
          position: "relative",
          overflow: "hidden",
          padding: "80px",
        }}
      >
        {/* 좌상단 파란 radial 블롭 (리퀴드 글래스 무드 — /api/og/* 와 동일) */}
        <div
          style={{
            position: "absolute",
            top: "-200px",
            left: "-160px",
            width: "640px",
            height: "640px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle, rgba(29,79,216,.16) 0%, rgba(29,79,216,0) 70%)",
            display: "flex",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <svg width="52" height="52" viewBox="0 0 24 24">
            <path
              d="M12 2.6 L22 10.4 V20 a1.4 1.4 0 0 1 -1.4 1.4 H14.8 V14.6 H9.2 V21.4 H3.4 A1.4 1.4 0 0 1 2 20 V10.4 Z"
              fill="#1d4fd8"
            />
          </svg>
          <div style={{ fontSize: "44px", fontWeight: 800, color: "#1d4fd8", display: "flex" }}>
            누구집
          </div>
        </div>
        <div
          style={{
            marginTop: "36px",
            fontSize: "64px",
            fontWeight: 800,
            color: "#191f28",
            lineHeight: 1.25,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>시세는 누구나 봅니다,</span>
          <span>현장은 가 본 사람만 압니다</span>
        </div>
        <div style={{ marginTop: "28px", fontSize: "26px", color: "#7b8494", display: "flex" }}>
          국토교통부 실거래 기반 시세 · 임장노트 · AI 분석 — nuguzip.com
        </div>
      </div>
    ),
    { width: OG_SIZE.width, height: OG_SIZE.height, ...ogFonts() },
  );
}
