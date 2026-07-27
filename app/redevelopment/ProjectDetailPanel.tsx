"use client";

import { Icon } from "@/app/components/Icon";
import {
  STAGES,
  colorForType,
  labelForType,
  locationLabel,
  stageLabel,
  stageOrder,
  type RedevelopmentProject,
} from "@/lib/redevelopment/types";
import { STAGE_GUIDE_BY_KEY } from "@/lib/redevelopment/stage-guide";

/**
 * 선택한 구역의 "진행 상황 + 현황 자료" 패널 (#226).
 *
 * 사실 경계 — 여기서 지어내지 않는 것:
 *   · 우리 데이터에는 **현재 단계(stage_key)** 만 있고 단계별 통과 일자가 없다.
 *     그래서 지나온 칸은 "지나온 것으로 표시"라고만 적고 날짜를 붙이지 않는다.
 *   · 세대수·주소·요약이 없으면 0 이나 "-" 로 채우지 않고 "공개 자료에 없음"이라 적는다.
 *     비어 있는 것과 0 은 다른 사실이다.
 *   · 체크리스트·유의점은 법정 일반 절차 설명이지 이 구역에 대한 확인 결과가 아니다.
 */

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface px-3 py-2">
      <dt className="text-[10px] font-bold text-text-3">{label}</dt>
      <dd className={`mt-0.5 text-[12px] leading-[1.5] ${muted ? "text-text-3" : "text-ink"}`}>
        {value}
      </dd>
    </div>
  );
}

export function ProjectDetailPanel({
  project,
  onClose,
}: {
  project: RedevelopmentProject;
  onClose?: () => void;
}) {
  const color = colorForType(project.typeKey);
  const guide = STAGE_GUIDE_BY_KEY[project.stageKey];
  const current = stageOrder(project.stageKey);
  const asOfLabel = project.asOf ?? formatDate(project.updatedAt);

  return (
    <section className="card flex flex-col gap-3 rounded-2xl px-5 py-4">
      {/* 헤더 */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <h3 className="text-[15px] font-extrabold text-ink">{project.name}</h3>
            {project.isSample ? (
              <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold text-warning">
                예시 데이터
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: `${color}1a`, color }}
            >
              {labelForType(project.typeKey)}
            </span>
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
              현재 {stageLabel(project.stageKey)}
            </span>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="구역 상세 닫기"
            className="press shrink-0 rounded-full border border-line bg-surface p-1.5 text-text-2"
          >
            <Icon name="x" size={14} />
          </button>
        ) : null}
      </div>

      {/* ===== 진행 상황 ===== */}
      <div>
        <div className="flex items-baseline justify-between">
          <h4 className="text-[13px] font-extrabold text-ink">진행 상황</h4>
          <span className="text-[10px] text-text-3">도시정비법 일반 절차 기준 7단계</span>
        </div>
        <ol className="mt-2 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {STAGES.map((s) => {
            const state = s.order < current ? "past" : s.order === current ? "now" : "future";
            return (
              <li
                key={s.key}
                aria-current={state === "now" ? "step" : undefined}
                className={`flex min-w-[84px] shrink-0 flex-col gap-1 rounded-[10px] border px-2 py-1.5 ${
                  state === "now"
                    ? "border-primary bg-primary-soft"
                    : state === "past"
                      ? "border-line bg-surface"
                      : "border-dashed border-line bg-surface"
                }`}
              >
                <span
                  className={`text-[10px] font-bold ${
                    state === "future" ? "text-text-3" : "text-text-2"
                  }`}
                >
                  {s.order}단계
                </span>
                <span
                  className={`text-[11.5px] font-extrabold leading-[1.35] ${
                    state === "now"
                      ? "text-primary"
                      : state === "past"
                        ? "text-ink"
                        : "text-text-3"
                  }`}
                >
                  {s.label}
                </span>
                <span className="text-[10px] text-text-3">
                  {state === "now" ? "현재" : state === "past" ? "지나온 단계" : "남은 단계"}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-1.5 text-[10.5px] leading-[1.6] text-text-3">
          공개 자료에서 확인한 건 <b className="text-text-2">현재 단계</b> 하나예요. 각 단계를 언제
          통과했는지(인가일 등)는 확보하지 못해 표시하지 않아요 — 날짜가 필요하면 지자체 고시·조합
          공고를 확인하세요.
        </p>
      </div>

      {/* ===== 현황 자료 ===== */}
      <div>
        <h4 className="text-[13px] font-extrabold text-ink">현황 자료</h4>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Fact
            label="소재지"
            value={locationLabel(project)}
          />
          <Fact
            label="예정 세대수"
            value={
              project.households != null
                ? `${project.households.toLocaleString("ko-KR")}세대`
                : "공개 자료에 없음"
            }
            muted={project.households == null}
          />
          <Fact
            label="자료 기준 시점"
            value={asOfLabel ? `${asOfLabel} 기준` : "기준 시점 미상"}
            muted={!asOfLabel}
          />
          <Fact label="출처" value={project.source ?? "출처 표기 없음"} muted={!project.source} />
        </dl>
        {project.summary ? (
          <p className="mt-2 rounded-[10px] bg-surface px-3 py-2 text-[12px] leading-[1.65] text-text-1">
            {project.summary}
          </p>
        ) : null}
        {project.sourceUrl ? (
          <a
            href={project.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="press mt-2 inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1.5 text-[11.5px] font-bold text-primary no-underline"
          >
            출처 원문 보기 ↗
          </a>
        ) : null}
      </div>

      {/* ===== 이 단계에서 확인할 것 ===== */}
      {guide ? (
        <div>
          <h4 className="text-[13px] font-extrabold text-ink">
            {guide.longLabel} 단계에서 확인할 것
          </h4>
          <p className="mt-1 text-[11.5px] leading-[1.65] text-text-2">{guide.desc}</p>
          <div className="mt-2 flex gap-1.5 rounded-[10px] bg-warning-soft px-2.5 py-2">
            <Icon name="warning" size={13} className="mt-px shrink-0 text-warning" />
            <p className="text-[11px] leading-[1.6] text-warning">
              <span className="font-bold">유의점 </span>
              {guide.caution}
            </p>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {guide.checklist.map((c) => (
              <li key={c} className="flex gap-1.5">
                <Icon name="check" size={13} className="mt-px shrink-0 text-primary" />
                <span className="text-[11px] leading-[1.55] text-text-2">{c}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-[1.6] text-text-3">
            위 항목은 법정 일반 절차에 대한 설명이에요. 이 구역에 대해 저희가 확인한 결과가 아니라,
            직접 확인하실 목록이에요.
          </p>
        </div>
      ) : null}
    </section>
  );
}
