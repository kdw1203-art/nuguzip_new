/**
 * GET /og-image — 사이트 기본 OG 카드 (S4, check:final-release "og-image route").
 *
 * 페이지 전용 카드(/api/og/complex·note·listing)가 없는 모든 공개 페이지의
 * 기본 공유 이미지. 정적 브랜드 카드라 쿼리를 받지 않는다 — 받는 순간
 * 임의 문자열이 이미지에 찍히는 통로가 된다.
 *
 * [961] 브랜드 마스터 v2.1 §07 "명함 앞면" 그대로 — 한지 판면, 좌상단 온점 심볼,
 * 워드마크(자간 10%) + NAEJIP NOW(자간 44%·모래색), 네이비 헤드라인, 슬로건의 마침표는
 * 주홍 온점. 예전 카드는 구 하우스마크(파랑 집 모양)를 그리고 있었다 — 리브랜딩 누락.
 */
import { ImageResponse } from "next/og";
import { OG_SIZE } from "@/lib/og/theme";
import { OG_FONT_FAMILY, ogFonts } from "@/lib/og/font";

export const runtime = "nodejs";
export const dynamic = "force-static";

const NAVY = "#0B2545";
const RED = "#C8442B";
const HANJI = "#F6F1E7";
const SAND = "#8A7F6E";

function Mark({ style }: { style: React.CSSProperties }) {
  return (
    <div style={{ position: "absolute", width: 18, height: 18, display: "flex", ...style }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 18, height: 1, background: SAND, opacity: 0.55, display: "flex" }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1, height: 18, background: SAND, opacity: 0.55, display: "flex" }} />
    </div>
  );
}

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: HANJI,
          fontFamily: OG_FONT_FAMILY,
          position: "relative",
          overflow: "hidden",
          padding: "64px 72px",
        }}
      >
        {/* 모서리 표식 — 마스터 가이드 시그니처 무대의 크롭 마크 */}
        <Mark style={{ left: 28, top: 28 }} />
        <Mark style={{ right: 28, top: 28, transform: "scaleX(-1)" }} />
        <Mark style={{ left: 28, bottom: 28, transform: "scaleY(-1)" }} />
        <Mark style={{ right: 28, bottom: 28, transform: "scale(-1)" }} />

        {/* 잠금: 심볼 + 워드마크 + 영문 */}
        <div style={{ display: "flex", alignItems: "center", gap: "26px" }}>
          <svg width="112" height="103" viewBox="0 0 120 120">
            <path d="M52 28 L68 28" fill="none" stroke={NAVY} strokeWidth="7" strokeLinecap="round" />
            <path d="M14 46 C 38 64, 82 64, 106 46" fill="none" stroke={NAVY} strokeWidth="7" strokeLinecap="round" />
            <circle cx="60" cy="86" r="8.5" fill={RED} />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "50px", fontWeight: 700, letterSpacing: "5px", color: NAVY, display: "flex" }}>
              내집나우
            </div>
            <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "8px", color: SAND, display: "flex" }}>
              NAEJIP NOW
            </div>
          </div>
        </div>

        {/* 헤드라인 — 브랜드 포지션 */}
        <div
          style={{
            fontSize: "60px",
            fontWeight: 800,
            color: NAVY,
            lineHeight: 1.25,
            letterSpacing: "-1px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>시세는 누구나 봅니다,</span>
          <span>현장은 가 본 사람만 압니다</span>
        </div>

        {/* 슬로건 · 도메인 */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            fontSize: "26px",
            color: NAVY,
          }}
        >
          <div style={{ display: "flex", letterSpacing: "5px", fontWeight: 700 }}>
            <span>오래 머물 집을, 지금</span>
            <span style={{ color: RED }}>.</span>
          </div>
          <div style={{ display: "flex", fontSize: "22px", color: SAND, letterSpacing: "1px" }}>
            국토교통부 실거래 · 임장노트 · AI 분석 — naezipnow.com
          </div>
        </div>
      </div>
    ),
    { width: OG_SIZE.width, height: OG_SIZE.height, ...ogFonts() },
  );
}
