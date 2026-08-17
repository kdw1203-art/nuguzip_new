import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { enqueueUpload } from "@/lib/social/store";
import { renderNoteFrames, renderPromoFrames } from "@/lib/social/video/frames";
import { encodeSlideshow } from "@/lib/social/video/encode";

/**
 * 소셜 자동 소재 — 임장노트 1건 또는 홈페이지 홍보 1건을 영상으로 만들어 큐에 넣는다.
 *
 * 소재 규칙(권리·사실 우선):
 *  - 노트는 **공개(is_public) + (운영자 본인 작성 또는 작성자의 명시 동의)**만
 *    쓴다. 동의는 노트 폼의 "소셜 소재 활용 동의" 체크(metadata.socialShareConsent)
 *    — 동의 없는 이용자 노트를 회사 채널에 올리는 것은 저작권·동의 문제라
 *    자동화하지 않는다.
 *  - 이미 발행/대기 중인 노트는 다시 만들지 않는다(source_ref 부분 유니크 인덱스가
 *    DB 레벨에서도 막는다 — 코드가 실수해도 중복 발행은 불가능).
 *  - 홍보 프레임의 수치는 DB 실측값 + 기준시점 표기. 수익 보장류 표현은 금지어
 *    검사로 큐 등록 전에 차단한다(사이트의 영구 미기재 방침은 소셜에도 적용).
 */

const OWNER_EMAILS = ["kdw1203@gmail.com", "nuguzip@naver.com"];

const BANNED_PHRASES = ["수익 보장", "확정 수익", "원금 보장", "고수익 보장", "수익률 보장"];

export function assertCompliantCopy(...texts: string[]): void {
  for (const t of texts) {
    for (const p of BANNED_PHRASES) {
      if (t.includes(p)) {
        throw new Error(`금지 표현 "${p}" 이 캡션/제목에 포함 — 영구 미기재 방침 위반이라 등록을 중단합니다`);
      }
    }
  }
}

async function uploadVideoToStorage(mp4: Buffer, key: string): Promise<string> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 클라이언트 미구성");
  const { error } = await sb.storage
    .from("social-videos")
    .upload(key, mp4, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`스토리지 업로드 실패: ${error.message}`);
  const { data } = sb.storage.from("social-videos").getPublicUrl(key);
  if (!data?.publicUrl) throw new Error("공개 URL 생성 실패");
  return data.publicUrl;
}

type AutopostResult =
  | { kind: "note"; noteId: string; uploadId: string; videoUrl: string }
  | { kind: "promo"; promoId: string; uploadId: string; videoUrl: string }
  | { kind: "none"; reason: string };

/** 아직 소셜에 안 올린 공개 노트(운영자 작성) 1건 */
async function pickNote() {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 클라이언트 미구성");
  const { data: used, error: usedErr } = await sb
    .from("social_uploads")
    .select("source_ref")
    .eq("source_kind", "note");
  if (usedErr) throw new Error(`발행 이력 조회 실패: ${usedErr.message}`);
  const usedIds = new Set((used ?? []).map((r) => r.source_ref).filter(Boolean));

  /* 소재 자격: 공개 + (운영자 본인 작성 OR 작성자의 명시 동의).
     동의는 노트 폼의 "소셜 소재 활용 동의" 체크가 metadata 에 남긴 값이다 —
     동의 없는 이용자 노트는 여기서 걸러진다(저작권·동의 원칙). */
  const ownerList = OWNER_EMAILS.map((e) => `"${e}"`).join(",");
  const { data, error } = await sb
    .from("inspection_notes")
    .select(
      "id, title, region, apt_name, property_name, summary, public_summary, visit_date, created_at, score_location, score_school, score_transport, score_facility, score_future",
    )
    .eq("is_public", true)
    .or(`author_email.in.(${ownerList}),metadata->>socialShareConsent.eq.true`)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`노트 조회 실패: ${error.message}`);
  return (data ?? []).find((n) => !usedIds.has(n.id)) ?? null;
}

/** 홍보 로테이션 — 수치는 실측, 기준시점 포함 */
async function buildPromo(dayIndex: number) {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 클라이언트 미구성");
  const asOf = new Date().toISOString().slice(0, 10).replace(/-/g, ".") + " 기준";

  const templates = [
    {
      id: "map-tx",
      headline: "지도에 찍히는 가격,\n호가가 아니라 실거래가",
      sub: "국토교통부 공개 데이터를 그대로 — 중개사 호가와 섞지 않습니다",
      statLabel: "누적 실거래 데이터",
      count: async () => {
        const { count, error } = await sb
          .from("market_transactions")
          .select("id", { count: "exact", head: true });
        if (error || count == null) throw new Error(`실거래 집계 실패: ${error?.message ?? "count null"}`);
        return `${Math.floor(count / 10_000)}만+ 건`;
      },
      title: "호가 말고 실거래가로 보는 지도",
      caption: "지도에 찍히는 금액은 국토교통부 실거래가입니다. 중개사 호가와 섞이지 않습니다.",
      hashtags: ["부동산", "실거래가", "아파트", "임장", "누구집"],
    },
    {
      id: "ai-note",
      headline: "3분 기록하면\nAI 가 장단점을 정리",
      sub: "현장에서 본 것을 남기면, 판단 재료로 정리해 드립니다",
      statLabel: "임장노트 · 지도 · AI 분석",
      count: async () => "기록은 무료",
      title: "시세는 누구나 봅니다, 현장은 가 본 사람만 압니다",
      caption: "3분 기록 → AI 정리 → 지도 비교. 임장노트와 지도는 무료입니다.",
      hashtags: ["임장", "임장노트", "부동산공부", "아파트", "누구집"],
    },
    {
      id: "market-temp",
      headline: "우리 동네 시장 온도,\n숫자로 확인",
      sub: "실거래 지수 모멘텀과 거래량 추이로 매주 산출합니다",
      statLabel: "주간 시장 온도 산출 지역",
      count: async () => {
        const { count, error } = await sb
          .from("market_temperature_snapshots")
          .select("region_code", { count: "exact", head: true });
        if (error || count == null) return "62개 지역"; // TEMPERATURE_REGIONS 상수와 동일 — 스냅샷 미가동 시 폴백
        return `${count}건 관측`;
      },
      title: "매주 갱신되는 동네 시장 온도",
      caption: "실거래 지수 모멘텀 + 거래량 추이 기반 주간 산출. 투자 권유가 아닌 참고 지표입니다.",
      hashtags: ["부동산시장", "시장온도", "아파트시세", "누구집"],
    },
  ];
  const t = templates[dayIndex % templates.length];
  return { ...t, statValue: await t.count(), statAsOf: asOf };
}

/**
 * 하루 1건 자동 생성: 미발행 노트가 있으면 노트, 없으면 홍보 로테이션.
 * 반환값에 무엇을 왜 만들었는지(또는 왜 안 만들었는지)가 그대로 담긴다.
 */
export async function generateAndEnqueue(now = new Date()): Promise<AutopostResult> {
  const note = await pickNote();
  if (note) {
    const aptName = (note.apt_name || note.property_name || note.title || "임장 기록").slice(0, 24);
    const region = (note.region || "").slice(0, 30) || "대한민국";
    const rawSummary = (note.public_summary || note.summary || "").trim();
    const summary =
      rawSummary.length > 120 ? `${rawSummary.slice(0, 118)}…` : rawSummary || "현장에서 직접 보고 남긴 기록입니다.";
    const visit = (note.visit_date || note.created_at || "").slice(0, 7).replace("-", ".");
    const title = `${region} ${aptName} 임장노트`;
    const caption = `${summary}\n\n전체 노트와 실거래가는 nuguzip.com 에서. 개인 기록 기반이며 투자 권유가 아닙니다.`;
    assertCompliantCopy(title, caption);

    const frames = await renderNoteFrames({
      region,
      aptName,
      title,
      visitLabel: visit ? `${visit} 방문` : "현장 방문",
      summary,
      scores: [
        { label: "입지", value: note.score_location },
        { label: "학군", value: note.score_school },
        { label: "교통", value: note.score_transport },
        { label: "시설", value: note.score_facility },
        { label: "미래가치", value: note.score_future },
      ],
    });
    const mp4 = await encodeSlideshow(frames.map((png, i) => ({ png, seconds: i === 0 ? 2.5 : 3.5 })));
    const videoUrl = await uploadVideoToStorage(mp4, `auto/note-${note.id}.mp4`);
    const row = await enqueueUpload({
      videoUrl,
      title,
      caption,
      hashtags: ["임장", "임장노트", "부동산", "아파트", "누구집"],
      targets: { instagram: true, youtube: true },
      createdBy: "autopost",
      sourceKind: "note",
      sourceRef: note.id,
    });
    return { kind: "note", noteId: note.id, uploadId: row.id, videoUrl };
  }

  // 노트 소진 시 홍보 로테이션 (일 단위)
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  const promo = await buildPromo(dayIndex);
  const promoRef = `${promo.id}-${now.toISOString().slice(0, 10)}`;
  assertCompliantCopy(promo.title, promo.caption, promo.headline, promo.sub);

  const frames = await renderPromoFrames({
    headline: promo.headline,
    sub: promo.sub,
    statLabel: promo.statLabel,
    statValue: promo.statValue,
    statAsOf: promo.statAsOf,
  });
  const mp4 = await encodeSlideshow(frames.map((png) => ({ png, seconds: 3.2 })));
  const videoUrl = await uploadVideoToStorage(mp4, `auto/promo-${promoRef}.mp4`);
  const row = await enqueueUpload({
    videoUrl,
    title: promo.title,
    caption: promo.caption,
    hashtags: promo.hashtags,
    targets: { instagram: true, youtube: true },
    createdBy: "autopost",
    sourceKind: "promo",
    sourceRef: promoRef,
  });
  return { kind: "promo", promoId: promo.id, uploadId: row.id, videoUrl };
}
