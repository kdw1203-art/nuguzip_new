import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { readBoardPosts } from "@/lib/newui/board-posts";
import type { Post } from "@/lib/types/post";

/* ============================================================
   정비사업 추적 라이트 (재개발닷컴 벤치마크 D2 축소판)
   — 도시정비법 일반 절차 기준 8단계 진행 트래커(정보성 콘텐츠)
     · 각 단계 설명·유의점·"이 단계에서 확인할 것" 체크리스트
   — board_posts 자동 수집 뉴스에서 재건축·재개발·정비사업 키워드
     매칭 최신 기사 리스트 (실데이터, 없으면 빈 상태)
   — 관심 등록 CTA → /notifications
   개념 안내 전용 — 특정 구역/조합의 실제 단계 데이터는 담지 않는다.
   ============================================================ */

export const revalidate = 3600;

export const metadata = {
  title: "정비사업 진행단계 트래커 | 누구집",
  description:
    "재개발·재건축 8단계 진행 절차를 단계별 설명·유의점·확인 체크리스트로 정리하고 최신 정비사업 뉴스를 한곳에서 확인하세요.",
};

/** 도시 및 주거환경정비법 기준 일반 절차 8단계 — 개념 안내용.
 *  구역별 실제 단계·기간·요건은 지자체 고시·조합 자료 기준으로 확인. */
type Stage = {
  name: string;
  icon: string;
  period: string;
  desc: string;
  caution: string;
  checklist: string[];
};

const STAGES: Stage[] = [
  {
    name: "정비구역 지정",
    icon: "landmark",
    period: "사업의 출발점 · 지정까지 수년 소요되기도",
    desc: "지자체가 도시·주거환경정비 기본계획과 정비계획을 세우고 구역을 지정·고시하는 단계예요. 여기서부터 '정비사업'이 공식적으로 시작돼요.",
    caution:
      "구역 지정만으로 사업이 확정된 건 아니에요. 일몰제로 구역이 해제되거나 장기간 지연될 수 있어, 이 단계는 불확실성이 가장 큰 구간이에요.",
    checklist: [
      "정비계획 수립·고시 여부 (정비예정구역 vs 정비구역 구분)",
      "일몰제(정비구역 해제) 요건·기한에 걸려 있지 않은지",
      "재개발/재건축·존치 등 개발 방향과 용적률 계획",
    ],
  },
  {
    name: "조합설립추진위원회",
    icon: "users",
    period: "조합 설립 준비 단계",
    desc: "토지등소유자 과반수 동의로 추진위원회를 구성·승인받아, 정비업체·설계자 선정 등 조합 설립을 준비하는 단계예요.",
    caution:
      "추진위는 아직 정식 조합이 아니에요. 운영·회계 투명성, 동의율 확보 여부에 따라 사업 속도가 크게 갈려요.",
    checklist: [
      "추진위 구성 승인 여부와 대표성",
      "조합설립 동의율 진척 상황",
      "정비업체·설계자 계약 조건과 추진위 회계 공개 여부",
    ],
  },
  {
    name: "조합설립인가",
    icon: "gavel",
    period: "사업 주체(조합) 성립",
    desc: "법정 동의요건(재건축은 각 동별·전체 구분소유자 및 토지 면적 기준, 재개발은 토지등소유자 3/4 이상 등)을 충족해 조합 설립을 인가받아요. 사업을 이끌 주체인 조합이 만들어져요.",
    caution:
      "매수 시 가장 조심할 지점이에요. 투기과열지구에서는 조합설립인가 후 양수하면 조합원 지위 양도가 제한돼 조합원 자격이 승계되지 않고 현금청산 대상이 될 수 있어요. 매수 전 조합원 지위 승계 가능 여부를 반드시 확인하세요.",
    checklist: [
      "조합설립인가일과 조합 정관·조합원 명부",
      "투기과열지구 지정 여부 → 조합원 지위 양도 제한/예외 요건",
      "매수 시 조합원 자격 승계 가능한지, 현금청산 대상은 아닌지",
    ],
  },
  {
    name: "사업시행인가",
    icon: "clipboard",
    period: "사업 내용 확정 · 본궤도 진입",
    desc: "건축계획·세대수·평형 등 사업 내용을 확정해 인가받는 단계예요. 종전자산 감정평가 기준시점 등 권리 산정의 뼈대가 잡혀요.",
    caution:
      "인가 내용대로 세대수·평형이 확정되지만, 종전자산 평가와 비례율은 이후 변동될 수 있어요. 설계 변경·조합 내부 갈등이 일정 리스크로 작용해요.",
    checklist: [
      "사업시행인가일과 확정된 건축계획(세대수·평형)",
      "종전자산 감정평가 기준시점과 추정 비례율",
      "임대주택 비율·정비사업비 추정과 분담금 개략치",
    ],
  },
  {
    name: "관리처분계획인가",
    icon: "scale",
    period: "분담금·권리 배분 확정 → 이주 개시",
    desc: "누가 어떤 평형을 분양받고 분담금·비례율·권리가액이 얼마인지 확정하는 핵심 단계예요. 인가 이후 이주·철거가 시작돼요.",
    caution:
      "이주비·분담금의 실제 규모가 드러나는 시점이에요. 비례율이 낮아지면 추가분담금이 크게 늘 수 있고, 분양신청을 하지 않으면 현금청산 대상이 돼요. 이주비 대출 조건도 이때 확인해야 해요.",
    checklist: [
      "관리처분인가일·권리가액·비례율",
      "조합원 분담금/추가분담금 규모와 납부 일정",
      "이주비 대출 한도·이자 조건, 분양신청 완료 여부",
    ],
  },
  {
    name: "이주·철거",
    icon: "footprints",
    period: "이주·명도·철거 · 지연 잦은 구간",
    desc: "조합원과 세입자가 이주하고 기존 건축물을 철거해 착공을 준비하는 단계예요.",
    caution:
      "미이주·명도소송, 세입자 보상·상가 명도 분쟁으로 일정이 자주 늦어져요. 이주비 상환 시점과 조건도 함께 챙겨야 해요.",
    checklist: [
      "이주 개시·마감 일정과 미이주 세대·명도소송 진행",
      "세입자 보상 계획과 상가 명도 상황",
      "건축물 멸실 등기 시점, 이주비 상환 조건",
    ],
  },
  {
    name: "착공",
    icon: "construction",
    period: "공사 착수 · 일반분양 진행",
    desc: "철거를 마치고 공사를 시작하는 단계예요. 이 무렵 일반분양도 함께 진행돼요.",
    caution:
      "공사비 인상(도급계약 변경)으로 조합원 분담금이 추가될 수 있고, 일반분양 성적이 사업성에 직접 영향을 줘요. 착공·인허가 지연 리스크도 살펴야 해요.",
    checklist: [
      "착공 신고일과 도급공사비(물가·설계 변경 반영 여부)",
      "일반분양가·분양 일정과 미분양 리스크",
      "준공 예정 시기와 추가분담금 발생 가능성",
    ],
  },
  {
    name: "준공·입주",
    icon: "building2",
    period: "준공·입주 → 이전고시·청산으로 종료",
    desc: "준공인가·사용검사 후 입주하고, 이전고시와 조합 청산으로 사업이 마무리되는 단계예요.",
    caution:
      "입주 지정기간 내 잔금·분담금을 정산해야 하고, 이전고시 후 청산 과정에서 추가 정산금이 생길 수 있어요. 하자보수 이행도 확인 대상이에요.",
    checklist: [
      "준공인가·사용검사 완료와 입주 지정기간",
      "잔금·분담금 정산 내역",
      "이전고시·청산 일정과 하자보수 이행",
    ],
  },
];

/** 자주 등장하는 핵심 용어 — 단계 이해를 돕는 개념 설명 */
const GLOSSARY: { term: string; desc: string }[] = [
  {
    term: "조합원 자격 승계",
    desc: "조합원 지위가 매수인에게 넘어오는지 여부. 투기과열지구에서 조합설립·관리처분 인가 후 양수 시 제한될 수 있어요.",
  },
  {
    term: "비례율",
    desc: "종후자산 대비 종전자산 가치의 비율. 사업성을 나타내며 분담금 규모를 좌우해요.",
  },
  {
    term: "분담금",
    desc: "조합원이 새 주택을 받기 위해 추가로 내는 돈. 권리가액과 분양가 차이로 결정돼요.",
  },
  {
    term: "현금청산",
    desc: "분양신청을 안 했거나 자격을 못 갖춘 경우 조합원 지위 없이 감정가로 정산받고 나가는 것.",
  },
];

const NEWS_KEYWORD_RE = /재건축|재개발|정비사업/;
const NEWS_LIMIT = 10;

function displayTime(p: Post): number {
  const t = Date.parse(p.sourcePublishedAt || p.createdAt);
  return Number.isFinite(t) ? t : 0;
}

function shortDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/** board_posts에서 정비사업 키워드 매칭 최신 기사 — 실패·빈 데이터 시 빈 배열 */
async function loadRedevelopmentNews(): Promise<Post[]> {
  const posts = await readBoardPosts();
  return posts
    .filter((p) => NEWS_KEYWORD_RE.test(p.title) || NEWS_KEYWORD_RE.test(p.body))
    .sort((a, b) => displayTime(b) - displayTime(a))
    .slice(0, NEWS_LIMIT);
}

export default async function RedevelopmentPage() {
  const news = await loadRedevelopmentNews();

  return (
    <PageShell breadcrumb="동네 › 정비사업" title="정비사업 진행단계 트래커">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        {/* ===== 진행단계 개요 스트립 ===== */}
        <section className="rise-in card rounded-2xl px-5 py-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-extrabold text-ink">
              재개발·재건축은 이렇게 8단계로 진행돼요
            </h2>
            <span className="text-[10px] text-text-3">도시정비법 일반 절차 기준</span>
          </div>
          {/* 가로 스텝 오버뷰 — 좁은 화면은 가로 스크롤 */}
          <div className="mt-3 -mx-1 overflow-x-auto px-1 pb-1">
            <ol className="flex min-w-max items-center gap-1">
              {STAGES.map((s, i) => (
                <li key={s.name} className="flex items-center gap-1">
                  <span className="chip chip-soft flex items-center gap-1 px-2.5 py-1 text-[11px]">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-extrabold text-white">
                      {i + 1}
                    </span>
                    <Icon name={s.icon} size={13} />
                    {s.name}
                  </span>
                  {i < STAGES.length - 1 && (
                    <span className="shrink-0 text-text-3" aria-hidden="true">
                      ›
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-2 text-[11px] leading-[1.6] text-text-2">
            각 단계의 뜻과 유의점, 그 단계에서 확인할 것을 아래에서 단계별로 정리했어요.
            단계 오인은 투자 판단에 영향을 줄 수 있으니 실제 진행 여부는 반드시 확인하세요.
          </p>
        </section>

        {/* ===== 단계별 상세 트래커(세로 스테퍼) ===== */}
        <section className="rise-in-1 card rounded-2xl px-5 py-4">
          <h2 className="text-sm font-extrabold text-ink">단계별 상세 · 이 단계에서 확인할 것</h2>
          <ol className="mt-3 flex flex-col gap-0">
            {STAGES.map((s, i) => (
              <li key={s.name} className="flex gap-3">
                {/* 아이콘 번호 + 연결선 */}
                <div className="flex flex-col items-center">
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Icon name={s.icon} size={18} />
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-extrabold text-white">
                      {i + 1}
                    </span>
                  </span>
                  {i < STAGES.length - 1 && (
                    <span className="w-px flex-1 bg-[#dfe5ef]" aria-hidden="true" />
                  )}
                </div>

                {/* 본문 */}
                <div className={i < STAGES.length - 1 ? "min-w-0 pb-6" : "min-w-0"}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-extrabold text-ink">{s.name}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(29,79,216,.06)] px-2 py-0.5 text-[10px] font-semibold text-[#5b74b8]">
                      <Icon name="clock" size={11} />
                      {s.period}
                    </span>
                  </div>

                  <p className="mt-1 text-[12px] leading-[1.65] text-text-1">{s.desc}</p>

                  {/* 유의점 */}
                  <div className="mt-2 flex gap-1.5 rounded-[10px] bg-warning-soft px-2.5 py-2">
                    <Icon
                      name="warning"
                      size={13}
                      className="mt-px shrink-0 text-warning"
                    />
                    <p className="text-[11px] leading-[1.6] text-warning">
                      <span className="font-bold">유의점 </span>
                      {s.caution}
                    </p>
                  </div>

                  {/* 이 단계에서 확인할 것 */}
                  <div className="mt-2">
                    <div className="text-[11px] font-bold text-text-2">
                      이 단계에서 확인할 것
                    </div>
                    <ul className="mt-1 flex flex-col gap-1">
                      {s.checklist.map((c) => (
                        <li key={c} className="flex gap-1.5">
                          <Icon
                            name="check"
                            size={13}
                            className="mt-px shrink-0 text-primary"
                          />
                          <span className="text-[11px] leading-[1.55] text-text-2">{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {/* 면책 */}
          <p className="mt-3 flex gap-1.5 rounded-[10px] bg-[rgba(29,79,216,.06)] px-3 py-2 text-[10px] leading-[1.6] text-[#5b74b8]">
            <Icon name="shield" size={13} className="mt-px shrink-0" />
            <span>
              개념 안내용 일반 절차예요. 실제 사업 단계·조합원 자격·분담금은 구역·조합마다
              다르므로 조합·구청·전문가 확인이 필요해요. 구역별 실제 단계·일정은 지자체
              고시(정비사업 정보몽땅 등 공공 공개자료) 기준으로 확인하세요.
            </span>
          </p>
        </section>

        {/* ===== 자주 나오는 용어 ===== */}
        <section className="rise-in-2 card rounded-2xl px-5 py-4">
          <h2 className="text-sm font-extrabold text-ink">자주 나오는 용어</h2>
          <dl className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {GLOSSARY.map((g) => (
              <div
                key={g.term}
                className="rounded-[10px] border border-line bg-surface px-3 py-2"
              >
                <dt className="text-[12px] font-extrabold text-ink">{g.term}</dt>
                <dd className="mt-0.5 text-[11px] leading-[1.6] text-text-2">{g.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ===== 관심 등록 CTA ===== */}
        <Link
          href="/notifications"
          className="rise-in-3 card-hover flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 no-underline"
        >
          <div>
            <div className="text-[13px] font-extrabold text-ink">
              관심 지역 정비사업 소식 받아보기
            </div>
            <div className="mt-0.5 text-[11px] text-text-2">
              알림 설정에서 관심 지역을 등록하면 새 소식을 놓치지 않아요.
            </div>
          </div>
          <span className="shrink-0 rounded-[10px] bg-primary-soft px-3.5 py-2 text-xs font-bold text-primary">
            알림 설정 ›
          </span>
        </Link>

        {/* ===== 정비사업 뉴스 (board_posts 실데이터) ===== */}
        <section className="rise-in-4 card flex flex-col gap-2.5 rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-ink">정비사업 뉴스</h2>
            <Link href="/town/news" className="text-[11px] font-extrabold text-primary">
              전체 뉴스 ›
            </Link>
          </div>
          {news.length === 0 && (
            <div className="py-3 text-center text-[11px] text-text-3">
              최근 수집된 재건축·재개발 관련 기사가 아직 없어요.
            </div>
          )}
          {news.map((n) => (
            <Link key={n.id} href={`/town/news/${n.id}`} className="group no-underline">
              <div className="text-[12px] font-bold leading-[1.5] text-ink group-hover:text-primary">
                {n.title}
              </div>
              <div className="mt-[2px] text-[10px] text-text-3">
                {[n.sourceName || n.authorLabel, shortDate(n.sourcePublishedAt || n.createdAt), n.city]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </Link>
          ))}
          {news.length > 0 && (
            <p className="text-[10px] text-[#adb5bd]">
              재건축·재개발·정비사업 키워드 매칭 자동 수집 기사 — 원문·출처는 각 기사에서
              확인하세요.
            </p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
