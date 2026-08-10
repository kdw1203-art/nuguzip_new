import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { AdSlot } from "@/app/components/ads/AdSlot";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { listQuestions } from "@/lib/qna/store";
import { complexHrefKey, resolveComplexHrefs } from "@/lib/newui/complex-link";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";
import { QNA_TOPICS } from "@/lib/qna/topics";
import { AskForm } from "./AskForm";
import { QnaListClient, type QnaRow } from "./QnaListClient";

/* 비용 실측(2026-08-10): 서버는 원래도 100건을 한 번 받아 메모리에서 걸렀다 —
   ?status/sort/topic/q 를 읽는 것만이 이 라우트를 영구 동적으로 만들고 있었다.
   거르는 자리를 QnaListClient 로 옮기고 ISR(5분) 전환. 새 질문은 등록 API 의
   revalidatePath 가 즉시 목록을 재생성한다(캐시 때문에 방금 쓴 질문이 안 보이면
   안 된다). 시각 라벨·복잡한 개수 계산은 서버 판과 동일 코드를 클라이언트에서
   같은 순서로 돈다. */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "단지 Q&A | 누구집",
  description:
    "아파트 단지·동네에 대한 궁금증을 묻고 이웃·실거주자에게 답을 받아보세요. 재건축·학군·주차·교통까지 단지 Q&A에서 확인하세요.",
  robots: { index: true, follow: true },
  alternates: seoAlternates("/qna"),
};

/** 테마 구분: 단지 Q&A = 청록 (대화·질문). subtree 안에서 text-primary·
 *  bg-primary-soft·chip-active·btn-primary 가 청록으로 재테마됨. */
const QNA_THEME = {
  "--primary": "#0d9488",
  "--primary-soft": "#e3f5f2",
  "--primary-strong": "#0a7a70",
} as CSSProperties;


/* 연동(2): 임장노트·단지 허브에서 "이 단지 Q&A" 로 올 때 쓰는 축.
   단지명을 그대로 넘겨받아 제목·본문·단지명·지역에서 찾는다. 검색은 서버 쿼리
   대신 이미 불러온 100건 안에서 하므로, 결과가 0이어도 "그 단지 질문이 아직
   없다"가 아니라 "최근 100건 중에는 없다"로 문구를 적는다 — 없는 것을 단정하지
   않는다. */
/** 상대/짧은 날짜 — 하루 이내는 시간, 30일 이내는 N일 전, 이후는 YYYY.MM.DD. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) {
    const h = Math.floor(diff / (60 * 60 * 1000));
    return h < 1 ? "방금 전" : `${h}시간 전`;
  }
  if (diff < 30 * day) return `${Math.floor(diff / day)}일 전`;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/* ---------- 카드 ---------- */

/* ---------- 페이지 ---------- */

export default async function QnaListPage() {

  /* 2026-07-26: store 가 실패 때 `[]` 를 돌려주던 걸 던지도록 고쳤다. 질문 등록
     폼(AskForm)은 그대로 두고 — 목록이 안 보인다고 질문까지 못 하게 할 이유는
     없다 — 목록 자리에만 "지금 불러오지 못했다"고 쓴다.

     상태 필터를 쿼리로 내리지 않고 한 번에 받아서 메모리에서 가른다. 그래야
     탭·주제 옆 개수가 전부 같은 스냅샷에서 나온 실제 값이 된다(개수만 따로
     세는 쿼리를 붙이면 그 사이에 값이 어긋난다). limit 은 100 이 상한이다. */
  const loaded = await listQuestions({ limit: 100 }).then(
    (items) => ({ ok: true as const, items }),
    (err: unknown) => {
      logger.error("[qna] 질문 목록 조회 실패", err);
      return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
    },
  );
  /* 키워드를 먼저 적용한다 — 그래야 탭·주제 옆 개수가 "지금 화면에 걸린 조건
     안에서의 실제 건수" 가 된다(전체 개수를 보여주면 눌렀을 때 안 맞는다). */
  const items = loaded.ok ? loaded.items : [];

  /* 연동(1): 단지 허브 링크 — 필터와 무관하게 전량(≤100건)에 대해 한 번 해석.
     resolveComplexHrefs 는 중복 접기 + 동시 4개 + 3초 마감(기존 주석 참조). */
  const resolved = await resolveComplexHrefs(
    items
      .filter((q) => !q.complexId && q.complexName)
      .map((q) => ({ name: q.complexName, region: q.region })),
  );
  const rows: QnaRow[] = items.map((q) => {
    const complexHref = q.complexId
      ? `/complex/${encodeURIComponent(q.complexId)}`
      : q.complexName
        ? (resolved.get(complexHrefKey(q.complexName, q.region)) ?? null)
        : null;
    return { q, complexHref, timeLabel: shortDate(q.createdAt) };
  });


  return (
    <PageShell breadcrumb="홈 › 동네이야기 › 단지 Q&A" title="단지 Q&A" wide>
      <TownCategoryNav stick />

      <div style={QNA_THEME}>
        {!loaded.ok ? (
          /* 조회 실패 — 필터 UI 없이 실패만 정확히 말한다. 질문 등록은 그대로 가능. */
          <div className="mt-4 flex flex-col gap-4">
            <AskForm />
            <ErrorState
              title="질문 목록을 지금 불러오지 못했어요"
              desc="등록된 질문이 0개인 게 아니라 조회 자체가 실패했습니다. 잠시 후 새로고침해 주세요. 질문 등록은 위에서 그대로 하실 수 있어요."
              cause={loaded.cause}
            />
          </div>
        ) : (
          /* 필터·목록은 클라이언트(QnaListClient). SSR 은 전체 100건을 HTML 에
             그리고 필터는 마운트 후 적용. AskForm·사이드바는 서버 조각으로 끼운다. */
          <QnaListClient
            rows={rows}
            askForm={<AskForm />}
            sidebar={
              <>
                <section className="rise-in-2 card flex flex-col gap-2 rounded-[18px] p-[18px]">
                  <h2 className="text-[14px] font-bold text-ink">질문 전에 여기부터</h2>
                  <p className="text-[12px] leading-[1.6] text-text-3">
                    이미 남아 있는 기록에 답이 있을 수 있어요. 단지 허브에는 실거래·지도·
                    임장노트·이 단지 Q&amp;A 가 한 곳에 모여 있습니다.
                  </p>
                  <div className="mt-1 flex flex-col gap-2">
                    {[
                      {
                        href: "/map",
                        icon: "map",
                        label: "지도에서 단지 찾기",
                        desc: "지도를 눌러 단지 허브로 이동",
                      },
                      {
                        href: "/notes",
                        icon: "clipboard",
                        label: "공개 임장노트 보기",
                        desc: "다녀온 사람이 남긴 현장 기록",
                      },
                      {
                        href: "/notes/new",
                        icon: "notebook-pen",
                        label: "임장노트 쓰기",
                        desc: "본 것을 적어두면 질문이 구체해져요",
                      },
                    ].map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        className="press flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 no-underline"
                      >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <Icon name={l.icon} size={16} />
                        </span>
                        <span className="flex flex-col">
                          <span className="text-[13px] font-bold text-ink">{l.label}</span>
                          <span className="text-[11px] text-text-3">{l.desc}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>

                <section className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
                  <h2 className="text-[14px] font-bold text-ink">이런 걸 물어보세요</h2>
                  <ul className="flex flex-col gap-1.5">
                    {QNA_TOPICS.slice(0, 6).map((t) => (
                      <li key={t.key} className="flex items-start gap-2">
                        <span className="mt-[1px] shrink-0 text-[13px]">{t.icon}</span>
                        <span className="text-[12px] leading-[1.55] text-text-2">{t.hint}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] leading-[1.55] text-text-3">
                    단지명과 지역을 함께 적으면 그 단지를 아는 이웃에게 더 잘 닿아요.
                  </p>
                </section>

                <section className="rise-in-4 card flex flex-col gap-1.5 rounded-[18px] p-[18px]">
                  <h2 className="text-[14px] font-bold text-ink">답변은 이웃의 경험이에요</h2>
                  <p className="text-[12px] leading-[1.6] text-text-3">
                    Q&amp;A의 답변은 이용자 개개인의 의견으로 정확성이 보장되지 않습니다. 투자·매매·
                    임대차 등 계약 판단과 그 결과에 대한 책임은 본인에게 있으니, 참고 자료로만
                    활용해 주세요.
                  </p>
                </section>

                {/* 광고 — ISR 페이지: 세션을 읽지 않고 plan={null} 경로의
                    클라이언트 게이트(AdFreeGate)가 유료 플랜을 숨긴다 */}
                <AdSlot placement="community_feed" seed={0} plan={null} />
              </>
            }
          />
        )}
      </div>
    </PageShell>
  );
}