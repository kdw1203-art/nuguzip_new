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

const BRAND = "#1d4fd8";

async function loadKoreanFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl =
      "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800&text=" +
      encodeURIComponent(text + "누구집");
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
  const title = (sp.get("title") ?? "누구집").slice(0, 60);
  const sub = (sp.get("sub") ?? "").slice(0, 60);
  const badge = (sp.get("badge") ?? "").slice(0, 16);

  const font = await loadKoreanFont(title + sub + badge);

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
          background: "linear-gradient(135deg, #f6f8ff 0%, #eef2fb 55%, #e6ecfa 100%)",
          fontFamily: font ? "NotoKR" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: BRAND,
              color: "#fff",
              fontSize: 30,
            }}
          >
            🏠
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#17203a" }}>누구집</div>
          {badge ? (
            <div
              style={{
                marginLeft: 8,
                padding: "8px 20px",
                borderRadius: 999,
                background: "#e8eeff",
                color: BRAND,
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
              color: "#17203a",
              lineHeight: 1.25,
              letterSpacing: -1,
              wordBreak: "keep-all",
            }}
          >
            {title}
          </div>
          {sub ? (
            <div style={{ fontSize: 30, color: "#5c6579", lineHeight: 1.4 }}>{sub}</div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 24,
            color: "#8a93a8",
          }}
        >
          <div>발품 기록이 판단이 되는 곳 · nuguzip.com</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: 99, background: BRAND }} />
            <div style={{ width: 14, height: 14, borderRadius: 99, background: "#8fb0ff" }} />
            <div style={{ width: 14, height: 14, borderRadius: 99, background: "#d3defc" }} />
          </div>
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
