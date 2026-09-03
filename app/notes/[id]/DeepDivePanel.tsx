/**
 * 노트 상세의 **AI 심화 분석 8축** 블록 (서버 컴포넌트).
 *
 * 축의 숫자·문장은 전부 `lib/inspection/deep-dive.ts` 가 조회한 데이터로
 * 미리 만들어 저장해 둔 것이고, 여기서는 저장된 것을 그리기만 한다. 화면을
 * 여는 시점에 LLM 을 부르지 않는다 — 볼 때마다 결과가 달라지면 그건 더 이상
 * "이 노트의 분석"이 아니다.
 *
 * 못 채운 축을 감추지 않는다. 확인하지 못한 축은 접힌 상태로라도 남겨 두고
 * "왜 못 봤는지"를 그대로 적는다. 감추면 읽는 사람에게는 그런 축이 애초에
 * 없었던 것처럼 보이고, 그건 조회 실패를 "해당 없음"으로 바꿔 말하는 것과
 * 같다.
 */
import type { StoredDeepDiveSection } from "@/lib/inspection/deep-dive-view";
import { filledStoredAxisCount, readStoredDeepDive } from "@/lib/inspection/deep-dive-view";

/** 축별 대표 색 — 순서대로 돌려 쓴다(의미가 아니라 구분용). */
const ACCENTS = [
  "bg-danger/10 text-danger",
  "bg-warning/10 text-warning",
  "bg-success/10 text-success",
  "bg-primary-soft text-primary",
];

function AxisBlock({
  index,
  open,
  section,
}: {
  index: number;
  open: boolean;
  section: StoredDeepDiveSection;
}) {
  const unavailable = section.status === "unavailable";
  const accent = unavailable
    ? "bg-text-3/10 text-text-3"
    : (ACCENTS[index % ACCENTS.length] ?? "bg-primary-soft text-primary");

  return (
    <details
      open={open && !unavailable}
      className="group rounded-[14px] border border-line bg-surface px-3.5 py-3"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <span
          className={`inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-bold ${accent}`}
        >
          {section.eyebrow}
        </span>
        <span className="flex-1 t-body font-extrabold text-ink">{section.label}</span>
        <span className="t-sub font-bold text-text-3">
          {unavailable ? "확인하지 못함" : section.status === "partial" ? "일부 확인" : "확인"}
        </span>
        <span className="t-body text-text-3 group-open:hidden">›</span>
      </summary>

      <div className="mt-2 flex flex-col gap-2">
        {section.headline && (
          <p className="t-body font-bold text-text-1">{section.headline}</p>
        )}

        {section.insight && (
          <p className="rounded-[10px] bg-primary-soft px-2.5 py-2 t-sub text-primary">
            <b className="mr-1">해석</b>
            {section.insight}
          </p>
        )}

        {section.facts.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {section.facts.map((fact) => (
              <li
                key={`${fact.label}-${fact.value}`}
                className="rounded-[8px] bg-bg chip-pad t-sub text-text-2"
              >
                <b className="mr-1 font-bold text-text-1">{fact.label}</b>
                {fact.value}
              </li>
            ))}
          </ul>
        )}

        {section.bullets.length > 0 && (
          <ul className="flex flex-col gap-1">
            {section.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-1.5 t-body text-text-1">
                <span className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-full bg-text-3/45" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 못 채운 사유 — 비어 있는 축을 "해당 없음"으로 바꿔 적지 않는다. */}
        {section.note && (
          <p className="t-sub text-text-3">{section.note}</p>
        )}

        {section.sources.length > 0 && (
          <p className="t-sub text-text-3">출처 · {section.sources.join(" · ")}</p>
        )}
      </div>
    </details>
  );
}

export default function DeepDivePanel({
  analysis,
}: {
  analysis: Record<string, unknown> | null;
}) {
  const deepDive = readStoredDeepDive(analysis);
  if (!deepDive) return null;

  const filled = filledStoredAxisCount(deepDive);
  const total = deepDive.sections.length;

  return (
    <section className="rise-in-1 card flex flex-col gap-3 rounded-[18px] p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[15px] font-extrabold text-ink">AI 심화 분석</div>
          <div className="mt-0.5 t-sub text-text-3">
            노트에 적힌 내용과 공개 데이터를 함께 읽어 {total}개 축으로 정리했어요 · {filled}개 축
            확인
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {deepDive.sections.map((section, i) => (
          <AxisBlock key={section.id} index={i} open={i < 2} section={section} />
        ))}
      </div>

      {/* 못 읽은 소스 — 어떤 축이 왜 비었는지 한 곳에 모아 둔다. */}
      {deepDive.gaps.length > 0 && (
        <div className="rounded-[10px] border border-line bg-bg px-3 py-2.5">
          <div className="t-sub font-bold text-text-2">이번에 확인하지 못한 자료</div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {deepDive.gaps.map((gap) => (
              <li key={gap} className="t-sub text-text-3">
                · {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {deepDive.disclaimer && (
        <p className="border-t border-line pt-2.5 t-sub text-text-3">
          {deepDive.disclaimer}
        </p>
      )}
    </section>
  );
}
