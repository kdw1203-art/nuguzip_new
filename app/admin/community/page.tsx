import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/service";
import { SeedReplyForm } from "./SeedReplyForm";

/* [#121·#123] 커뮤니티 운영 — 참여 지표 + 미답변 글 시드 답글 도구.
   0→1 구간의 계기판: 이번 주 글·댓글·채택률·미답변, 그리고 빈 스레드 처방. */

export const metadata = { title: "커뮤니티 운영 · 누구집 Admin" };

type Metric = { label: string; value: string; sub?: string };

export default async function AdminCommunityPage() {
  const sb = getServiceSupabase();
  let metrics: Metric[] = [];
  let unanswered: Array<{ id: string; title: string; createdAt: string; comments: number }> = [];
  let zeroQueries: Array<{ query: string; n: number }> = [];
  let failed = false;

  if (!sb) {
    failed = true;
  } else {
    try {
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const dayAgo = new Date(Date.now() - 86400_000).toISOString();
      const [posts7, comments7, adopted7, unansweredR, zeroR] = await Promise.all([
        sb
          .from("posts")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo),
        sb.from("posts").select("comments").gte("updated_at", weekAgo).limit(500),
        sb
          .from("posts")
          .select("comments")
          .gte("updated_at", weekAgo)
          .limit(500),
        sb
          .from("posts")
          .select("id, title, created_at, comment_count")
          .eq("comment_count", 0)
          .lte("created_at", dayAgo)
          .order("created_at", { ascending: false })
          .limit(10),
        sb
          .from("search_zero_results")
          .select("query")
          .gte("searched_at", weekAgo)
          .limit(500),
      ]);

      let commentCount = 0;
      let adoptedCount = 0;
      for (const row of (comments7.data ?? []) as Array<{ comments: unknown }>) {
        const cs = Array.isArray(row.comments) ? row.comments : [];
        commentCount += cs.length;
        adoptedCount += cs.filter(
          (c) => c && typeof c === "object" && (c as { adopted?: boolean }).adopted,
        ).length;
      }
      void adopted7;

      metrics = [
        { label: "이번 주 새 글", value: String(posts7.count ?? 0) },
        { label: "이번 주 댓글", value: String(commentCount) },
        {
          label: "채택된 답변",
          value: String(adoptedCount),
          sub: commentCount > 0 ? `채택률 ${Math.round((adoptedCount / commentCount) * 100)}%` : undefined,
        },
        { label: "24h+ 미답변 글", value: String(unansweredR.data?.length ?? 0) },
      ];
      unanswered = ((unansweredR.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id),
        title: String(p.title ?? ""),
        createdAt: String(p.created_at ?? "").slice(0, 10),
        comments: Number(p.comment_count) || 0,
      }));

      const freq = new Map<string, number>();
      for (const r of (zeroR.data ?? []) as Array<{ query: string }>) {
        const k = r.query.trim();
        if (k) freq.set(k, (freq.get(k) ?? 0) + 1);
      }
      zeroQueries = [...freq.entries()]
        .map(([query, n]) => ({ query, n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 12);
    } catch {
      failed = true;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold text-white">커뮤니티 운영</h1>
        <p className="mt-1 text-[12.5px] leading-[1.7] text-[#9aa6b8]">
          0→1 구간 계기판 — 이번 주 참여, 미답변 글 시드 답글, 검색 제로결과(콘텐츠
          주문서). 시드 답글은 &lsquo;누구집&rsquo; 공식 라벨로 게시되고 포인트는 적립되지
          않습니다.
        </p>
      </div>

      {failed ? (
        <div className="rounded-2xl border border-[rgba(255,255,255,.12)] bg-[#1a2130] p-5 text-[13px] text-[#c9d2e0]">
          지표를 불러오지 못했어요 — 잠시 후 새로고침해 주세요.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-2xl border border-[rgba(255,255,255,.08)] bg-[#171e2b] px-5 py-4">
                <div className="text-[11px] text-[#8b94a6]">{m.label}</div>
                <div className="mt-1 text-[24px] font-extrabold text-white tabular-nums">{m.value}</div>
                {m.sub && <div className="mt-0.5 text-[11px] text-[#8b94a6]">{m.sub}</div>}
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-[rgba(255,255,255,.08)] bg-[#171e2b] p-5">
            <h2 className="text-[15px] font-extrabold text-white">
              미답변 글 <span className="text-[11px] font-medium text-[#8b94a6]">24시간 경과 · 최근 10</span>
            </h2>
            {unanswered.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#9aa6b8]">
                미답변 글이 없어요 — 글 자체가 없다면 그것이 다음 과제입니다(미션·글감 참고).
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-4">
                {unanswered.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 border-b border-[rgba(255,255,255,.06)] pb-4 last:border-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link
                        href={`/town/news/${p.id}`}
                        className="min-w-0 truncate text-[13.5px] font-bold text-[#e7ecf5] hover:underline"
                      >
                        {p.title}
                      </Link>
                      <span className="shrink-0 text-[11px] text-[#8b94a6]">{p.createdAt}</span>
                    </div>
                    <SeedReplyForm postId={p.id} postTitle={p.title} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[rgba(255,255,255,.08)] bg-[#171e2b] p-5">
            <h2 className="text-[15px] font-extrabold text-white">
              검색 제로결과 <span className="text-[11px] font-medium text-[#8b94a6]">최근 7일 · 콘텐츠 주문서</span>
            </h2>
            {zeroQueries.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#9aa6b8]">
                아직 기록이 없어요 — 검색에서 0건이 나오는 순간부터 여기 쌓입니다.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {zeroQueries.map((z) => (
                  <span
                    key={z.query}
                    className="rounded-full bg-[#0d1119] px-3 py-1.5 text-[12px] font-bold text-[#c9d2e0]"
                  >
                    {z.query} <span className="text-[#8b94a6]">×{z.n}</span>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11.5px] leading-[1.7] text-[#8b94a6]">
              반복되는 질의는 만들 가치가 있는 표면입니다 — 단지 데이터 요청이면 수집
              범위를, 정보성 질의면 용어사전·가이드 추가를 검토하세요.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
