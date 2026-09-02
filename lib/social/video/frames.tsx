import "server-only";
import { ImageResponse } from "next/og";
import { OG_FONT_FAMILY, ogFonts } from "@/lib/og/font";

/**
 * 쇼츠/릴스용 1080×1920 스틸 프레임 렌더 — next/og(satori) 재사용.
 *
 * 규칙(사실 우선): 프레임에 들어가는 모든 숫자·문장은 호출부가 DB 에서 읽어
 * 넘긴 값이다. 이 파일은 숫자를 만들지 않고, 수치 프레임에는 기준시점을
 * 반드시 받아 표기한다.
 */

const W = 1080;
const H = 1920;
const INK = "#191f28";
const BLUE = "#1d4fd8";
const GRAY = "#6b7684";

async function toPng(el: React.ReactElement): Promise<Buffer> {
  const res = new ImageResponse(el, { width: W, height: H, ...ogFonts() });
  return Buffer.from(await res.arrayBuffer());
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: `${W}px`,
        height: `${H}px`,
        display: "flex",
        flexDirection: "column",
        background: "#f7f9fc",
        fontFamily: OG_FONT_FAMILY,
        padding: "96px 72px",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-260px",
          right: "-220px",
          width: "720px",
          height: "720px",
          borderRadius: "9999px",
          background:
            "radial-gradient(circle at center, rgba(29,79,216,0.20) 0%, rgba(29,79,216,0.06) 45%, rgba(29,79,216,0) 70%)",
          display: "flex",
        }}
      />
      {children}
      <div
        style={{
          position: "absolute",
          bottom: "88px",
          left: "72px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
        }}
      >
        <div
          style={{
            width: "18px",
            height: "18px",
            borderRadius: "6px",
            background: BLUE,
            display: "flex",
          }}
        />
        <div style={{ fontSize: "34px", fontWeight: 800, color: INK, display: "flex" }}>
          내집나우 · naezipnow.com
        </div>
      </div>
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        background: "rgba(29,79,216,0.10)",
        color: BLUE,
        fontSize: "34px",
        fontWeight: 800,
        padding: "14px 30px",
        borderRadius: "9999px",
      }}
    >
      {text}
    </div>
  );
}

/* ── 임장노트 프레임 4장 ────────────────────────────────── */

export type NoteFrameInput = {
  region: string;
  aptName: string;
  title: string;
  visitLabel: string; // 예: "2026.08 방문"
  summary: string;
  scores: { label: string; value: number | null }[]; // 5점 만점
};

export async function renderNoteFrames(n: NoteFrameInput): Promise<Buffer[]> {
  const cover = await toPng(
    <Shell>
      <Badge text="임장노트" />
      <div style={{ marginTop: "72px", fontSize: "46px", color: GRAY, display: "flex" }}>
        {n.region}
      </div>
      <div
        style={{
          marginTop: "18px",
          fontSize: "96px",
          fontWeight: 800,
          color: INK,
          lineHeight: 1.15,
          display: "flex",
        }}
      >
        {n.aptName}
      </div>
      <div style={{ marginTop: "40px", fontSize: "44px", color: GRAY, display: "flex" }}>
        {n.visitLabel} · 직접 걸어 보고 남긴 기록
      </div>
    </Shell>,
  );

  const summary = await toPng(
    <Shell>
      <Badge text="현장에서 본 것" />
      <div
        style={{
          marginTop: "64px",
          fontSize: "58px",
          fontWeight: 800,
          color: INK,
          lineHeight: 1.5,
          display: "flex",
        }}
      >
        {n.summary}
      </div>
    </Shell>,
  );

  const scored = n.scores.filter((s) => typeof s.value === "number");
  const scores = await toPng(
    <Shell>
      <Badge text="작성자 체감 점수 (5점 만점)" />
      <div style={{ marginTop: "64px", display: "flex", flexDirection: "column", gap: "44px" }}>
        {scored.map((s) => (
          <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontSize: "44px", fontWeight: 800, color: INK, display: "flex" }}>
                {s.label}
              </div>
              <div style={{ fontSize: "44px", fontWeight: 800, color: BLUE, display: "flex" }}>
                {s.value}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "22px",
                borderRadius: "9999px",
                background: "rgba(25,31,40,0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: `${Math.max(4, Math.min(100, ((s.value as number) / 5) * 100))}%`,
                  height: "22px",
                  borderRadius: "9999px",
                  background: BLUE,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "56px", fontSize: "32px", color: GRAY, display: "flex" }}>
        개인 기록 기반 주관 점수 — 투자 판단의 근거가 아닙니다
      </div>
    </Shell>,
  );

  const outro = await toPng(
    <Shell>
      <div
        style={{
          marginTop: "320px",
          fontSize: "84px",
          fontWeight: 800,
          color: INK,
          lineHeight: 1.3,
          display: "flex",
        }}
      >
        전체 노트와 실거래가는
      </div>
      <div
        style={{
          fontSize: "84px",
          fontWeight: 800,
          color: BLUE,
          lineHeight: 1.3,
          display: "flex",
        }}
      >
        naezipnow.com 에서
      </div>
      <div style={{ marginTop: "48px", fontSize: "40px", color: GRAY, display: "flex" }}>
        기록은 무료 · 시세는 국토교통부 공개 데이터 기준
      </div>
    </Shell>,
  );

  return scored.length > 0 ? [cover, summary, scores, outro] : [cover, summary, outro];
}

/* ── 홍보 프레임 3장 ────────────────────────────────────── */

export type PromoFrameInput = {
  headline: string;
  sub: string;
  statLabel: string;
  statValue: string;
  statAsOf: string; // 기준시점 — 수치 프레임 필수
};

export async function renderPromoFrames(p: PromoFrameInput): Promise<Buffer[]> {
  const cover = await toPng(
    <Shell>
      <Badge text="내집나우" />
      <div
        style={{
          marginTop: "96px",
          fontSize: "92px",
          fontWeight: 800,
          color: INK,
          lineHeight: 1.25,
          display: "flex",
        }}
      >
        {p.headline}
      </div>
      <div
        style={{ marginTop: "44px", fontSize: "48px", color: GRAY, lineHeight: 1.5, display: "flex" }}
      >
        {p.sub}
      </div>
    </Shell>,
  );

  const stat = await toPng(
    <Shell>
      <Badge text={p.statLabel} />
      <div
        style={{
          marginTop: "140px",
          fontSize: "150px",
          fontWeight: 800,
          color: BLUE,
          display: "flex",
        }}
      >
        {p.statValue}
      </div>
      <div style={{ marginTop: "40px", fontSize: "38px", color: GRAY, display: "flex" }}>
        {p.statAsOf} · 국토교통부 공개 데이터 기준
      </div>
    </Shell>,
  );

  const outro = await toPng(
    <Shell>
      <div
        style={{
          marginTop: "320px",
          fontSize: "84px",
          fontWeight: 800,
          color: INK,
          lineHeight: 1.3,
          display: "flex",
        }}
      >
        기록은 무료,
      </div>
      <div
        style={{
          fontSize: "84px",
          fontWeight: 800,
          color: BLUE,
          lineHeight: 1.3,
          display: "flex",
        }}
      >
        판단은 더 깊게
      </div>
      <div style={{ marginTop: "48px", fontSize: "40px", color: GRAY, display: "flex" }}>
        naezipnow.com — 임장노트 · 지도 · AI 분석
      </div>
    </Shell>,
  );

  return [cover, stat, outro];
}
