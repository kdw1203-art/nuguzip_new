/**
 * GET /api/og/note?title=&score=&badges=
 * 임장노트 공유용 동적 OG 카드 (1200×630, next/og ImageResponse).
 * - badges: 쉼표 구분 4축 평가 (예: "채광 상,소음 중,주차 하,교통 상")
 * - 흰 카드 + ✓ 직접 방문 배지 + 제목 + 평가 뱃지 + 점수 링
 * - 폰트: 시스템 기본만 사용 (커스텀 폰트 로드 금지)
 * - 쿼리 값은 60자 절단 후 JSX 텍스트로만 렌더 (XSS 안전)
 */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { OG_SIZE } from "@/lib/og/theme";

/** 쿼리 값 정규화 — 60자 절단 + 공백 정리 */
function q(req: NextRequest, key: string, fallback: string): string {
  const raw = req.nextUrl.searchParams.get(key);
  const v = (raw ?? "").trim();
  return (v.length > 0 ? v : fallback).slice(0, 60);
}

/** 뱃지 톤 — 상=green, 하=red, 그 외=ink (노트 상세 axisToneClass 관례) */
function badgeColor(label: string): { fg: string; bg: string } {
  if (label.endsWith("상")) return { fg: "#1a7f4e", bg: "#e7f5ee" };
  if (label.endsWith("하")) return { fg: "#d64545", bg: "#fbecec" };
  return { fg: "#3a4150", bg: "#f2f4f8" };
}

export async function GET(req: NextRequest) {
  const title = q(req, "title", "공작 302동 3차 임장 — 채광은 확실, 주차가 관건");
  const scoreRaw = q(req, "score", "81");
  const badgesRaw = q(req, "badges", "채광 상,소음 중,주차 하,교통 상");

  const scoreNum = Number.parseInt(scoreRaw, 10);
  const score = Number.isFinite(scoreNum)
    ? String(Math.min(Math.max(scoreNum, 0), 100))
    : "—";
  const badges = badgesRaw
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 4);

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
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
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

        {/* 흰 노트 카드 */}
        <div
          style={{
            width: "100%",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "#ffffff",
            borderRadius: "32px",
            border: "1px solid rgba(17,24,39,0.06)",
            boxShadow: "0 28px 70px rgba(29,79,216,0.10)",
            padding: "48px 56px",
          }}
        >
          {/* 상단: 로고 + 직접 방문 배지 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "11px",
                  background: "#1d4fd8",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "19px",
                  fontWeight: 800,
                }}
              >
                집
              </div>
              <div
                style={{
                  fontSize: "26px",
                  fontWeight: 800,
                  color: "#1d4fd8",
                  display: "flex",
                }}
              >
                누구집 임장노트
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 20px",
                borderRadius: "12px",
                background: "#e7f5ee",
                color: "#1a7f4e",
                fontSize: "22px",
                fontWeight: 800,
              }}
            >
              ✓ 직접 방문
            </div>
          </div>

          {/* 중단: 제목 + 점수 링 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "48px",
            }}
          >
            <div
              style={{
                fontSize: "44px",
                fontWeight: 800,
                color: "#111827",
                lineHeight: 1.35,
                maxWidth: "760px",
                display: "flex",
                wordBreak: "break-all",
              }}
            >
              {title}
            </div>
            <div
              style={{
                width: "170px",
                height: "170px",
                borderRadius: "9999px",
                border: "10px solid rgba(29,79,216,0.14)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "#ffffff",
                boxShadow: "0 12px 30px rgba(29,79,216,0.12)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: "58px",
                  fontWeight: 800,
                  color: "#1d4fd8",
                  lineHeight: 1,
                  display: "flex",
                }}
              >
                {score}
              </div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#7b8494",
                  display: "flex",
                  marginTop: "6px",
                }}
              >
                / 100
              </div>
            </div>
          </div>

          {/* 하단: 4축 평가 뱃지 + 캡션 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
              {badges.map((b, i) => {
                const c = badgeColor(b);
                return (
                  <div
                    key={`${b}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "12px 24px",
                      borderRadius: "9999px",
                      background: c.bg,
                      color: c.fg,
                      fontSize: "24px",
                      fontWeight: 800,
                    }}
                  >
                    {b}
                  </div>
                );
              })}
            </div>
            <div
              style={{
                fontSize: "20px",
                fontWeight: 600,
                color: "#7b8494",
                display: "flex",
              }}
            >
              임장 기록이 판단 근거가 됩니다 · nuguzip.com
            </div>
          </div>
        </div>
      </div>
    ),
    { width: OG_SIZE.width, height: OG_SIZE.height },
  );
}
