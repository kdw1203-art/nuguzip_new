/**
 * GET /api/screenshot?page=home|community|expert|market
 * PWA 설치 화면에 표시되는 스크린샷 이미지를 동적으로 생성합니다.
 * (next/og ImageResponse 활용)
 */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { OG_FONT_FAMILY, ogFonts } from "@/lib/og/font";

const PAGE_CONFIG: Record<
  string,
  { title: string; subtitle: string; items: string[]; accent: string }
> = {
  home: {
    title: "우리동네이야기",
    subtitle: "부동산 커뮤니티 · 전문가 · AI 분석",
    items: ["📍 지역별 부동산 정보 한눈에", "🤝 전문가 상담 & 임장 모임", "🤖 AI 투자 분석 도구"],
    accent: "#3182f6",
  },
  community: {
    title: "커뮤니티",
    subtitle: "동네 이웃과 부동산 정보 공유",
    items: ["💬 지역별 실거래 정보", "📝 임장 후기 & 분석글", "🔔 실시간 알림"],
    accent: "#10b981",
  },
  expert: {
    title: "전문가 찾기",
    subtitle: "공인중개사 · 감정평가사 · 세무사",
    items: ["✅ 인증된 전문가 매칭", "📞 1:1 상담 연결", "⭐ 리뷰 & 평점 확인"],
    accent: "#f59e0b",
  },
  market: {
    title: "모임 & 마켓",
    subtitle: "임장 모임 · 리포트 거래",
    items: ["🏃 임장 모임 만들기", "📊 리포트 구매/판매", "🎯 맞춤 매물 요청"],
    accent: "#3182f6",
  },
};

export async function GET(req: NextRequest) {
  const page = req.nextUrl.searchParams.get("page") ?? "home";
  const cfg = PAGE_CONFIG[page] ?? PAGE_CONFIG.home;

  return new ImageResponse(
    (
      <div
        style={{
          width: "390px",
          height: "844px",
          background: "#f2f4f6",
          display: "flex",
          flexDirection: "column",
          fontFamily: OG_FONT_FAMILY,
        }}
      >
        {/* 상단 바 */}
        <div
          style={{
            background: cfg.accent,
            padding: "52px 20px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.2)",
              borderRadius: "12px",
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                background: "#fff",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 800,
                color: cfg.accent,
              }}
            >
              우동
            </div>
            <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "13px" }}>
              woodong.kr
            </div>
          </div>
        </div>

        {/* 콘텐츠 */}
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "#1e293b" }}>{cfg.title}</div>
            <div style={{ fontSize: "14px", color: "#64748b", marginTop: "4px" }}>{cfg.subtitle}</div>
          </div>

          {/* 카드 목록 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {cfg.items.map((item, i) => (
              <div
                key={i}
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  padding: "14px 16px",
                  fontSize: "14px",
                  color: "#334155",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                {item}
              </div>
            ))}
          </div>

          {/* 더미 카드 */}
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "16px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: `${cfg.accent}20`,
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    height: "12px",
                    background: "#e2e8f0",
                    borderRadius: "6px",
                    width: "60%",
                  }}
                />
                <div
                  style={{
                    height: "10px",
                    background: "#f1f5f9",
                    borderRadius: "5px",
                    width: "40%",
                    marginTop: "6px",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 하단 네비 바 */}
        <div
          style={{
            background: "#fff",
            borderTop: "1px solid #e2e8f0",
            padding: "10px 0 24px",
            display: "flex",
            justifyContent: "space-around",
          }}
        >
          {["🏠", "💬", "👤", "🔔", "⚙️"].map((icon, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
              }}
            >
              <div style={{ fontSize: "20px" }}>{icon}</div>
              <div
                style={{
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  background: i === 0 ? cfg.accent : "transparent",
                }}
              />
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 390, height: 844, ...ogFonts() },
  );
}
