import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/service";
import { readRelatedTownPosts } from "@/lib/newui/board-posts";
import { logger } from "@/lib/log";

/* ============================================================================
   단지 홈 하단 — 이 단지 임장노트 · 관련 기사 · AI 분석 진입
   ----------------------------------------------------------------------------
   단지 홈에는 시세·면적대·지역대비·정비사업·입주물량이 있었지만, 정작 "이 단지를
   직접 보고 온 사람이 뭘 적었나"와 "이 동네에 무슨 일이 있었나"는 없었다. 지도
   팝업에서 넘어온 사람이 더 알고 싶은 건 대체로 그 둘이다.

   세 블록 모두 **실제로 있는 것만** 그린다.
     · 임장노트  inspection_notes 공개 노트. 없으면 "아직 없다"고 적고 쓰기로 안내.
     · 관련 기사 뉴스 피드에서 단지명 또는 지역명이 걸리는 글. 없으면 섹션 생략.
     · AI 분석   여기서 분석을 지어내지 않는다. 무엇을 재료로 쓰는지 밝히고
                 분석 화면으로 넘긴다 — 요약을 미리 적어 두면 그건 데이터가
                 아니라 문구가 된다.

   조회가 실패하면 섹션을 생략한다. "노트 0건"과 "조회 실패"는 다른 말이라,
   실패를 0건처럼 그리지 않는다.
   ========================================================================== */

interface NoteRow {
  id: string;
  title: string;
  region: string | null;
  visitDate: string | null;
}

/** 단지명 정규화 — /api/map/complex-notes 와 같은 기준 */
function normalizeName(s: string): string {
  return s.replace(/\s+/g, "").replace(/아파트$/, "");
}

async function loadNotes(
  complexId: string,
  name: string,
): Promise<{ notes: NoteRow[]; failed: boolean }> {
  const sb = getServiceSupabase();
  if (!sb) return { notes: [], failed: true };
  const core = normalizeName(name).replace(/[%_]/g, "");
  try {
    // complexId 가 정규 키다. 표기가 달라도 같은 단지로 묶인다.
    const byId = complexId
      ? await sb
          .from("inspection_notes")
          .select("id, title, region, visit_date")
          .filter("metadata->>complexId", "eq", complexId)
          .eq("is_public", true)
          .order("created_at", { ascending: false })
          .limit(6)
      : null;
    let rows = (byId?.data ?? []) as Array<Record<string, unknown>>;

    // 옛 노트에는 metadata.complexId 가 없다 — 이름으로 한 번 더 찾는다.
    if (rows.length === 0 && core.length >= 2) {
      const byName = await sb
        .from("inspection_notes")
        .select("id, title, region, visit_date, apt_name")
        .ilike("apt_name", `%${core}%`)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(20);
      if (byName.error) throw byName.error;
      rows = ((byName.data ?? []) as Array<Record<string, unknown>>).filter(
        (r) => normalizeName(String(r.apt_name ?? "")) === core,
      );
    }

    return {
      notes: rows.slice(0, 6).map((r) => ({
        id: String(r.id),
        title: String(r.title ?? "임장노트"),
        region: r.region ? String(r.region) : null,
        visitDate: r.visit_date ? String(r.visit_date).slice(0, 10) : null,
      })),
      failed: false,
    };
  } catch (err) {
    logger.error("[complex] 임장노트 조회 실패", err);
    return { notes: [], failed: true };
  }
}

interface NewsRow {
  id: string;
  title: string;
  href: string;
  source: string | null;
  when: string | null;
}

async function loadNews(name: string, region: string): Promise<NewsRow[]> {
  try {
    const posts = await readRelatedTownPosts();
    const core = normalizeName(name);
    // 지역명은 "서울 노원구" 처럼 붙어 오므로 토막으로 쪼개 각각 본다.
    const regionTokens = region
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    const scored = posts
      .map((p) => {
        const hay = `${p.title ?? ""} ${(p.tags ?? []).join(" ")}`.replace(/\s+/g, "");
        if (core.length >= 2 && hay.includes(core)) return { p, score: 2 };
        if (regionTokens.some((t) => hay.includes(t))) return { p, score: 1 };
        return null;
      })
      .filter((v): v is { p: (typeof posts)[number]; score: number } => v !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return scored.map(({ p }) => ({
      id: String(p.id),
      title: String(p.title ?? ""),
      href: `/town/news/${encodeURIComponent(String(p.id))}`,
      source: p.sourceName ? String(p.sourceName) : null,
      when: p.createdAt ? String(p.createdAt).slice(0, 10) : null,
    }));
  } catch (err) {
    logger.error("[complex] 관련 기사 조회 실패", err);
    return [];
  }
}

export async function ComplexNotesNewsAi({
  complexId,
  name,
  region,
  hasPrice,
  tradeCount,
}: {
  complexId: string;
  name: string;
  region: string;
  /** 실거래 시세를 아는가 — AI 분석이 무엇을 재료로 쓸 수 있는지 정직하게 적는다 */
  hasPrice: boolean;
  tradeCount: number;
}) {
  const [{ notes, failed: notesFailed }, news] = await Promise.all([
    loadNotes(complexId, name),
    loadNews(name, region),
  ]);

  const noteHref = `/notes/new?${new URLSearchParams({
    apt: name,
    region,
    complexId,
  }).toString()}`;
  const analysisHref = `/analysis?complexId=${encodeURIComponent(complexId)}`;

  return (
    <section className="mt-6 grid gap-4 lg:grid-cols-3">
      {/* ── 이 단지 임장노트 ─────────────────────────────────────────────── */}
      <div className="card rounded-2xl p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-extrabold text-ink">이 단지 임장노트</h2>
          {notes.length > 0 && (
            <span className="text-[11px] text-text-3">{notes.length}건</span>
          )}
        </div>

        {notesFailed ? (
          <p className="mt-3 text-[12px] leading-[1.7] text-text-3">
            노트를 지금 불러오지 못했어요. 노트가 없는 게 아니라 조회가 실패했습니다 —
            잠시 후 새로고침해 주세요.
          </p>
        ) : notes.length === 0 ? (
          <p className="mt-3 text-[12px] leading-[1.7] text-text-3">
            아직 이 단지의 공개 임장노트가 없어요. 직접 다녀오셨다면 첫 기록을 남겨
            주세요 — 다음 사람이 그 기록을 보고 옵니다.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {notes.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/notes/${encodeURIComponent(n.id)}`}
                  className="block rounded-xl border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-primary"
                >
                  <span className="block truncate text-[13px] font-bold text-ink">
                    {n.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-text-3">
                    {[n.visitDate, n.region].filter(Boolean).join(" · ") || "방문일 미기재"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link
          href={noteHref}
          className="btn-secondary mt-3 block rounded-xl p-2.5 text-center text-[12px] font-extrabold"
        >
          이 단지 임장노트 쓰기
        </Link>
      </div>

      {/* ── AI 분석 ──────────────────────────────────────────────────────── */}
      <div className="card rounded-2xl p-5">
        <h2 className="text-[15px] font-extrabold text-ink">AI 분석</h2>
        {/* 여기에 분석 결과를 미리 적어 두지 않는다. 재료가 무엇인지만 밝힌다 —
            읽는 사람이 "이 분석이 무엇을 근거로 하는가"를 먼저 알아야 한다. */}
        <p className="mt-3 text-[12px] leading-[1.7] text-text-3">
          이 단지에 대해 AI가 읽는 재료는 아래와 같습니다. 분석은 요청하실 때 그
          시점의 데이터로 만들어집니다.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 text-[12px] text-text-2">
          <li className="flex items-center justify-between gap-2 border-b border-[rgba(16,28,54,.06)] pb-1.5">
            <span>국토교통부 실거래</span>
            <span className="font-bold text-ink">
              {tradeCount > 0 ? `${tradeCount.toLocaleString("ko-KR")}건` : "없음"}
            </span>
          </li>
          <li className="flex items-center justify-between gap-2 border-b border-[rgba(16,28,54,.06)] pb-1.5">
            <span>단지 시세 추이</span>
            <span className="font-bold text-ink">{hasPrice ? "있음" : "준비 중"}</span>
          </li>
          <li className="flex items-center justify-between gap-2 border-b border-[rgba(16,28,54,.06)] pb-1.5">
            <span>이웃 임장노트</span>
            <span className="font-bold text-ink">
              {notesFailed ? "확인 실패" : `${notes.length}건`}
            </span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>지역 뉴스</span>
            <span className="font-bold text-ink">{news.length}건</span>
          </li>
        </ul>
        <Link
          href={analysisHref}
          className="btn-primary btn-cta mt-3 block rounded-xl p-2.5 text-center text-[12px] font-extrabold text-white"
        >
          이 단지 AI 분석 받기
        </Link>
      </div>

      {/* ── 관련 기사 ────────────────────────────────────────────────────── */}
      <div className="card rounded-2xl p-5">
        <h2 className="text-[15px] font-extrabold text-ink">관련 기사</h2>
        {news.length === 0 ? (
          <p className="mt-3 text-[12px] leading-[1.7] text-text-3">
            이 단지·지역을 다룬 기사가 아직 모이지 않았어요.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {news.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  className="block rounded-xl border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-primary"
                >
                  <span className="line-clamp-2 block text-[13px] font-bold leading-[1.45] text-ink">
                    {n.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-text-3">
                    {[n.source, n.when].filter(Boolean).join(" · ") || "출처 미상"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/town/news?region=${encodeURIComponent(region)}`}
          className="btn-secondary mt-3 block rounded-xl p-2.5 text-center text-[12px] font-extrabold"
        >
          이 지역 뉴스 더 보기
        </Link>
      </div>
    </section>
  );
}
