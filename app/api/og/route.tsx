import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

/* [개선 #4, 2026-08-22] 공유 미리보기(OG) 이미지 동적 생성.
 *
 * 한국에서 공유 = 카카오톡이고, 미리보기 카드 품질이 클릭률을 가른다.
 * 지금까지 노트·지역·계산기 공유는 밋밋한 기본 카드로 나갔다 — 제목·배지·
 * 브랜드가 박힌 1200×630 카드를 라우트 하나로 만들어 전 표면이 나눠 쓴다.
 *
 * 한글 폰트: 엣지/노드 어디서든 시스템 한글 폰트가 없다. Google Fonts 의
 * text= 서브셋 요청(제목에 쓰인 글자만, 보통 1~4KB)으로 TTF 를 받아 쓴다 —
 * 요청마다 새로 받지만 응답을 CDN 이 하루 캐시하므로 실호출은 드물다.
 * 폰트 확보 실패 시에는 이미지 생성 자체를 포기하지 않고 시스템 폴백(영문
 * 위주)으로라도 그린다 — 미리보기 없는 공유보다 낫다.
 */

export const runtime = "nodejs";

/* 브랜드 마스터 v2.1 고정값 */
const NAVY = "#0B2545";
const HANJI = "#F6F1E7";
const RED_DARK = "#E0563A";

async function loadKoreanFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl =
      "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800&text=" +
      /* [961] 슬로건·도메인 글자도 서브셋에 포함 — 빠지면 그 글자만 □ 로 깨진다 */
      encodeURIComponent(text + "내집나우오래 머물 집을, 지금.naezipnow.com");
    const css = await fetch(cssUrl, {
      // 구형 UA 로 요청하면 woff2 대신 ImageResponse 가 읽는 TTF 가 온다
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" },
      next: { revalidate: 86400 },
    }).then((r) => r.text());
    const m = css.match(/src:\s*url\((https:[^)]+)\)/);
    if (!m) return null;
    return await fetch(m[1], { next: { revalidate: 86400 } }).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const title = (sp.get("title") ?? "내집나우").slice(0, 60);
  const sub = (sp.get("sub") ?? "").slice(0, 60);
  const badge = (sp.get("badge") ?? "").slice(0, 16);

  const font = await loadKoreanFont(title + sub + badge);

  /* [961] 브랜드 마스터 v2.1 §07 "명함 뒷면" — 네이비 판면 위 반전형 심볼 + 한지 글자,
     슬로건 마침표는 주홍 온점(E0563A). 예전 카드는 옅은 파랑 그라데이션 + 🏠 이모지였다. */
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: NAVY,
          fontFamily: font ? "NotoKR" : "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* 우하단 워터마크 심볼(장식, 10%) */}
        <svg
          width="420"
          height="392"
          viewBox="0 0 120 120"
          style={{ position: "absolute", right: -60, bottom: -80, opacity: 0.08 }}
        >
          <path d="M14 46 C 38 64, 82 64, 106 46" fill="none" stroke={HANJI} strokeWidth="7" strokeLinecap="round" />
          <circle cx="60" cy="86" r="8.5" fill={HANJI} />
        </svg>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="56" height="52" viewBox="0 0 120 120">
            <path d="M52 28 L68 28" fill="none" stroke={HANJI} strokeWidth="7" strokeLinecap="round" />
            <path d="M14 46 C 38 64, 82 64, 106 46" fill="none" stroke={HANJI} strokeWidth="7" strokeLinecap="round" />
            <circle cx="60" cy="86" r="8.5" fill={RED_DARK} />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 800, color: HANJI, letterSpacing: 3 }}>내집나우</div>
          {badge ? (
            <div
              style={{
                marginLeft: 8,
                padding: "8px 20px",
                borderRadius: 999,
                background: HANJI,
                color: NAVY,
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: title.length > 24 ? 56 : 66,
              fontWeight: 800,
              color: HANJI,
              lineHeight: 1.25,
              letterSpacing: -1,
              wordBreak: "keep-all",
            }}
          >
            {title}
          </div>
          {sub ? (
            <div style={{ fontSize: 30, color: "rgba(246,241,231,.72)", lineHeight: 1.4 }}>{sub}</div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 24,
            color: "rgba(246,241,231,.72)",
          }}
        >
          <div style={{ display: "flex", letterSpacing: 4, fontWeight: 800, color: HANJI }}>
            <span>오래 머물 집을, 지금</span>
            <span style={{ color: RED_DARK }}>.</span>
          </div>
          <div>naezipnow.com</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: font
        ? [{ name: "NotoKR", data: font, style: "normal" as const, weight: 800 as const }]
        : undefined,
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
