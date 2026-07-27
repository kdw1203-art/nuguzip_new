"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NaverMap, type MapMarkerData } from "@/components/map/NaverMap";
import {
  STAGES,
  colorForType,
  labelForType,
  locationLabel,
  stageLabel,
  type ProjectTypeKey,
  type RedevelopmentProject,
  type StageKey,
} from "@/lib/redevelopment/types";
import { Icon } from "@/app/components/Icon";
import { TypeFilterPanel } from "./TypeFilterPanel";
import { DataSourceCard } from "./DataSourceCard";
import { NearbyPanel } from "./NearbyPanel";
import { ProjectDetailPanel } from "./ProjectDetailPanel";

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const MARKER_PREFIX = "redev:";

/** 같은 데이터를 보는 세 가지 방식 — 지도 / 목록 / 내용(집계). */
type ViewKey = "map" | "list" | "content";

const VIEWS: { key: ViewKey; label: string; icon: string }[] = [
  { key: "map", label: "지도", icon: "map" },
  { key: "list", label: "목록", icon: "clipboard" },
  { key: "content", label: "내용", icon: "file-text" },
];

function esc(s: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  };
  return s.replace(/[&<>"]/g, (c) => map[c] ?? c);
}

function householdsLabel(n: number | null): string {
  return n != null ? `${n.toLocaleString("ko-KR")}세대` : "";
}

/** 마커 클릭 시 뜨는 인포윈도우 카드(HTML) — 우리 데이터라 인라인 스타일. */
function buildInfoHtml(p: RedevelopmentProject): string {
  const color = colorForType(p.typeKey);
  const typeLabel = labelForType(p.typeKey);
  const stage = stageLabel(p.stageKey);
  const loc = locationLabel({ sigungu: p.sigungu, address: p.address });
  const households = householdsLabel(p.households);
  const asOfLine = p.asOf
    ? `<div style="font-size:10px;color:#9ca3af;margin-top:4px">${esc(p.asOf)} 공개자료 기준 · 최신 단계와 다를 수 있음</div>`
    : "";
  const source =
    p.sourceUrl != null
      ? `<a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:2px;font-size:11px;font-weight:700;color:#1d4fd8;text-decoration:none">출처 ›</a>`
      : "";
  return `
  <div style="padding:10px 12px;min-width:184px;max-width:220px;font-family:sans-serif;line-height:1.5">
    <div style="font-weight:800;font-size:13px;color:#111827;margin:0 0 6px">${esc(p.name)}</div>
    <div style="display:flex;align-items:center;gap:5px;margin:0 0 3px">
      <span style="display:inline-block;width:9px;height:9px;border-radius:9999px;background:${color}"></span>
      <span style="font-size:12px;font-weight:700;color:${color}">${esc(typeLabel)}</span>
      <span style="font-size:11px;color:#9ca3af">·</span>
      <span style="font-size:11px;font-weight:600;color:#4b5563">${esc(stage)}</span>
    </div>
    ${loc ? `<div style="font-size:11px;color:#6b7280;margin:0 0 2px">${esc(loc)}</div>` : ""}
    ${households ? `<div style="font-size:11px;color:#374151">예정 ${esc(households)}</div>` : ""}
    ${asOfLine}
    ${source}
  </div>`;
}

export function RedevelopmentMap({
  initialProjects,
  sigunguCounts,
  sources,
}: {
  initialProjects: RedevelopmentProject[];
  sigunguCounts: { sigungu: string; count: number }[];
  sources: { kind: string; source: string; cycle: string }[];
}) {
  const [types, setTypes] = useState<Set<ProjectTypeKey>>(new Set());
  const [stages, setStages] = useState<Set<StageKey>>(new Set());
  const [typePanelOpen, setTypePanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sigungu, setSigungu] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("map");

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const toggleType = (key: ProjectTypeKey) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleStage = (key: StageKey) =>
    setStages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleReset = () => {
    setTypes(new Set());
    setStages(new Set());
    setSigungu(null);
    setSelectedId(null);
  };

  /* 지역 칩을 누르기 전 단계 — 사업종류·진행단계까지만 건 결과.
     지역별 개수를 이 집합에서 세야 "칩에 적힌 수 = 눌렀을 때 보이는 수" 가 된다.
     전체 기준 개수를 적어 두고 필터가 걸린 결과를 보여 주면 숫자가 거짓말이 된다. */
  const byTypeStage = useMemo(
    () =>
      initialProjects.filter(
        (p) =>
          (types.size === 0 || types.has(p.typeKey)) &&
          (stages.size === 0 || stages.has(p.stageKey)),
      ),
    [initialProjects, types, stages],
  );

  const filtered = useMemo(
    () => (sigungu ? byTypeStage.filter((p) => p.sigungu === sigungu) : byTypeStage),
    [byTypeStage, sigungu],
  );

  /** 현재 사업종류·진행단계 조건에서의 시군구별 구역 수(많은 순). */
  const regionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of byTypeStage) {
      if (!p.sigungu) continue;
      m.set(p.sigungu, (m.get(p.sigungu) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko-KR"));
  }, [byTypeStage]);

  /* "내용" 뷰 집계 — 전부 지금 화면에 올라온 행에서만 센다. 세대수는 공개된
     건에서만 더하고, 빠진 건수를 함께 적는다. 모르는 값을 0 으로 채워 합치면
     합계가 실제보다 작아진 채로 사실처럼 보인다. */
  const summary = useMemo(() => {
    const byType = new Map<ProjectTypeKey, number>();
    const byStage = new Map<StageKey, number>();
    let householdsSum = 0;
    let householdsKnown = 0;
    for (const p of filtered) {
      byType.set(p.typeKey, (byType.get(p.typeKey) ?? 0) + 1);
      byStage.set(p.stageKey, (byStage.get(p.stageKey) ?? 0) + 1);
      if (p.households != null) {
        householdsSum += p.households;
        householdsKnown += 1;
      }
    }
    return {
      types: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      stages: STAGES.map((s) => ({ stage: s, count: byStage.get(s.key) ?? 0 })),
      householdsSum,
      householdsKnown,
      householdsMissing: filtered.length - householdsKnown,
    };
  }, [filtered]);

  const selectedProject = useMemo(
    () => (selectedId ? initialProjects.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, initialProjects],
  );

  const markers = useMemo<MapMarkerData[]>(
    () =>
      filtered.map((p) => ({
        id: `${MARKER_PREFIX}${p.id}`,
        lat: p.lat,
        lng: p.lng,
        label: p.name,
        pinColor: colorForType(p.typeKey),
        infoHtml: buildInfoHtml(p),
        selected: p.id === selectedId,
      })),
    [filtered, selectedId],
  );

  const center = selectedProject
    ? { lat: selectedProject.lat, lng: selectedProject.lng }
    : SEOUL_CENTER;
  const level = selectedProject ? 6 : 9;

  const handleMarkerClick = (m: MapMarkerData) => {
    const id = m.id.startsWith(MARKER_PREFIX) ? m.id.slice(MARKER_PREFIX.length) : m.id;
    setSelectedId(id);
  };

  const handleCardClick = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  /* 지역을 바꾸면 이전 선택은 화면에서 사라진 구역일 수 있다 —
     보이지도 않는 구역의 상세가 남아 있으면 지금 보는 지역의 자료로 오해된다. */
  const handleSigunguClick = (name: string | null) => {
    setSigungu((prev) => (prev === name ? null : name));
    setSelectedId(null);
  };

  // 선택 변경 시 해당 목록 카드로 스크롤(마커 클릭 → 목록 하이라이트).
  // 목록 뷰가 아닐 때는 카드가 DOM 에 없으므로 아무 일도 하지 않는다.
  useEffect(() => {
    if (!selectedId || view !== "list") return;
    const el = cardRefs.current.get(selectedId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId, view]);

  const total = initialProjects.length;
  const topSigungu = regionCounts.slice(0, 12);
  /** 서버가 전체 데이터로 센 시군구 수 — 지금 필터 결과와 구분해 적는다. */
  const totalSigunguCount = sigunguCounts.length;

  // 전체가 같은 취합 시점(시드)일 때만 면책에 시점을 못 박는다 — 혼합 데이터면 개별 표기.
  const asOfLabel = useMemo(() => {
    const set = new Set(
      initialProjects.map((p) => p.asOf).filter((v): v is string => Boolean(v)),
    );
    return set.size === 1 ? [...set][0] : null;
  }, [initialProjects]);

  return (
    <div className="flex flex-col gap-4">
      {/* ===== 필터 툴바 ===== */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTypePanelOpen((v) => !v)}
            aria-expanded={typePanelOpen}
            className={`press inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-bold ${
              typePanelOpen || types.size > 0
                ? "border-primary bg-primary-soft text-primary"
                : "border-line bg-surface text-text-1"
            }`}
          >
            <Icon name="landmark" size={15} />
            사업종류
            {types.size > 0 ? (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-white">
                {types.size}
              </span>
            ) : null}
            <span className="text-[10px] leading-none text-text-3">
              {typePanelOpen ? "▴" : "▾"}
            </span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="press ml-auto inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-text-2"
          >
            <Icon name="x" size={13} />
            초기화
          </button>
        </div>

        {/* 사업종류 그룹 필터 패널(접이식) */}
        {typePanelOpen ? (
          <TypeFilterPanel
            selected={types}
            onToggle={toggleType}
            onSelectAll={() => setTypes(new Set())}
          />
        ) : null}

        {/* 진행단계 다중선택 칩 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-bold text-text-2">진행단계</span>
          {STAGES.map((s) => {
            const active = stages.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleStage(s.key)}
                aria-pressed={active}
                className={`chip press border px-2.5 py-1 text-[12px] ${
                  active
                    ? "chip-active border-transparent"
                    : "border-line bg-surface text-text-2"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== 지역 선택 ===== */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-extrabold text-ink">
            표시 중 {filtered.length.toLocaleString("ko-KR")}곳
          </span>
          <span className="text-text-3">/ 전체 {total.toLocaleString("ko-KR")}곳</span>
          {sigungu ? (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
              {sigungu}
            </span>
          ) : null}
        </div>
        {topSigungu.length > 0 ? (
          <>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => handleSigunguClick(null)}
                aria-pressed={sigungu === null}
                className={`chip press shrink-0 border px-2.5 py-1 text-[11px] ${
                  sigungu === null
                    ? "chip-active border-transparent"
                    : "border-line bg-surface text-text-2"
                }`}
              >
                전체
              </button>
              {topSigungu.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => handleSigunguClick(s.name)}
                  aria-pressed={sigungu === s.name}
                  className={`chip press shrink-0 border px-2.5 py-1 text-[11px] ${
                    sigungu === s.name
                      ? "chip-active border-transparent"
                      : "border-line bg-surface text-text-2"
                  }`}
                >
                  {s.name} {s.count}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-[1.6] text-text-3">
              지역 칩의 숫자는 지금 걸린 사업종류·진행단계 조건에서 센 구역 수예요
              {regionCounts.length > topSigungu.length
                ? ` (구역이 많은 순 12개 · 조건에 맞는 시군구 ${regionCounts.length}곳 중)`
                : ""}
              . 전체 데이터에는 시군구 {totalSigunguCount.toLocaleString("ko-KR")}곳이 있어요.
            </p>
          </>
        ) : null}
      </div>

      {/* ===== 보기 방식 — 같은 데이터를 지도/목록/내용으로 ===== */}
      <div
        role="tablist"
        aria-label="보기 방식"
        className="flex gap-1 rounded-full border border-line bg-surface p-1"
      >
        {VIEWS.map((v) => {
          const active = view === v.key;
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(v.key)}
              className={`press flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-bold ${
                active ? "bg-primary text-white" : "text-text-2"
              }`}
              style={active ? { color: "#fff" } : undefined}
            >
              <Icon name={v.icon} size={14} />
              {v.label}
            </button>
          );
        })}
      </div>

      {/* ===== 지도 뷰 ===== */}
      {view === "map" ? (
        <div className="card overflow-hidden rounded-2xl p-1.5">
          <NaverMap
            markers={markers}
            center={center}
            level={level}
            fitToMarkers
            className="h-[440px] md:h-[560px]"
            onMarkerClick={handleMarkerClick}
          />
        </div>
      ) : null}

      {/* ===== 선택 구역: 진행 상황 + 현황 자료 ===== */}
      {selectedProject ? (
        <>
          <ProjectDetailPanel project={selectedProject} onClose={() => setSelectedId(null)} />
          <NearbyPanel projectId={selectedProject.id} projectName={selectedProject.name} />
        </>
      ) : null}

      {/* ===== 목록 뷰 ===== */}
      {view === "list" ? (
        filtered.length === 0 ? (
          <div className="card rounded-2xl px-5 py-8 text-center text-[12px] text-text-3">
            선택한 조건에 해당하는 정비사업장이 없어요. 필터를 조정해 보세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filtered.map((p) => {
              const color = colorForType(p.typeKey);
              const active = selectedId === p.id;
              const households = householdsLabel(p.households);
              const loc = locationLabel({ sigungu: p.sigungu, address: p.address });
              return (
                <div
                  key={p.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(p.id, el);
                    else cardRefs.current.delete(p.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleCardClick(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleCardClick(p.id);
                    }
                  }}
                  className={`card-hover press cursor-pointer rounded-xl border p-3 text-left ${
                    active ? "border-primary ring-1 ring-primary" : "border-line"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <span className="truncate text-[13px] font-extrabold text-ink">{p.name}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: `${color}1a`, color }}
                    >
                      {labelForType(p.typeKey)}
                    </span>
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {stageLabel(p.stageKey)}
                    </span>
                  </div>
                  {loc ? <div className="mt-1.5 text-[11px] text-text-2">{loc}</div> : null}
                  {households ? (
                    <div className="mt-0.5 text-[11px] text-text-3">예정 {households}</div>
                  ) : null}
                  {p.asOf ? (
                    <div className="mt-0.5 text-[10px] text-text-3">
                      {p.asOf} 공개자료 기준 · 최신 단계와 다를 수 있음
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {/* ===== 내용 뷰 — 지금 조건에 맞는 구역들의 집계 =====
           집계는 전부 화면에 올라온 행에서만 낸다. 표본 밖 값을 추정해 채우지 않는다. */}
      {view === "content" ? (
        <div className="flex flex-col gap-3">
          <section className="card rounded-2xl px-5 py-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[13px] font-extrabold text-ink">
                {sigungu ?? "선택한 조건"} 요약
              </h3>
              <span className="text-[10px] text-text-3">화면에 표시 중인 구역 기준</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-[10px] border border-line bg-surface px-3 py-2">
                <dt className="text-[10px] font-bold text-text-3">구역 수</dt>
                <dd className="mt-0.5 text-[15px] font-extrabold text-ink">
                  {filtered.length.toLocaleString("ko-KR")}곳
                </dd>
              </div>
              <div className="rounded-[10px] border border-line bg-surface px-3 py-2">
                <dt className="text-[10px] font-bold text-text-3">사업종류</dt>
                <dd className="mt-0.5 text-[15px] font-extrabold text-ink">
                  {summary.types.length}종
                </dd>
              </div>
              <div className="rounded-[10px] border border-line bg-surface px-3 py-2">
                <dt className="text-[10px] font-bold text-text-3">
                  예정 세대 합계 (공개된 {summary.householdsKnown}곳)
                </dt>
                <dd className="mt-0.5 text-[15px] font-extrabold text-ink">
                  {summary.householdsKnown > 0
                    ? `${summary.householdsSum.toLocaleString("ko-KR")}세대`
                    : "공개 자료에 없음"}
                </dd>
              </div>
            </dl>
            {summary.householdsMissing > 0 ? (
              <p className="mt-2 text-[10px] leading-[1.6] text-text-3">
                {summary.householdsMissing.toLocaleString("ko-KR")}곳은 공개 자료에 세대수가
                없어 합계에서 빠졌어요 — 0세대라는 뜻이 아니라 값을 확보하지 못했다는 뜻이에요.
              </p>
            ) : null}
          </section>

          {summary.types.length > 0 ? (
            <section className="card rounded-2xl px-5 py-4">
              <h3 className="text-[13px] font-extrabold text-ink">사업종류 분포</h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {summary.types.map(([key, count]) => {
                  const color = colorForType(key);
                  const pct = filtered.length > 0 ? (count / filtered.length) * 100 : 0;
                  return (
                    <li key={key} className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="w-[104px] shrink-0 truncate text-[11.5px] font-semibold text-text-1">
                        {labelForType(key)}
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </span>
                      <span className="w-[54px] shrink-0 text-right text-[11px] text-text-2">
                        {count.toLocaleString("ko-KR")}곳
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="card rounded-2xl px-5 py-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[13px] font-extrabold text-ink">진행단계 분포</h3>
              <span className="text-[10px] text-text-3">도시정비법 일반 절차 기준 7단계</span>
            </div>
            <ol className="mt-2 flex flex-col gap-1.5">
              {summary.stages.map(({ stage, count }) => {
                const pct = filtered.length > 0 ? (count / filtered.length) * 100 : 0;
                return (
                  <li key={stage.key} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-[10px] font-bold text-text-3">
                      {stage.order}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleStage(stage.key)}
                      aria-pressed={stages.has(stage.key)}
                      className={`w-[92px] shrink-0 truncate text-left text-[11.5px] font-semibold ${
                        stages.has(stage.key) ? "text-primary" : "text-text-1"
                      }`}
                    >
                      {stage.label}
                    </button>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-[54px] shrink-0 text-right text-[11px] text-text-2">
                      {count.toLocaleString("ko-KR")}곳
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 text-[10px] leading-[1.6] text-text-3">
              단계 이름을 누르면 그 단계만 걸러서 볼 수 있어요. 각 구역이 단계를 언제
              통과했는지(인가일)는 확보한 자료에 없어 표시하지 않아요.
            </p>
          </section>

          {regionCounts.length > 0 ? (
            <section className="card rounded-2xl px-5 py-4">
              <h3 className="text-[13px] font-extrabold text-ink">지역별 구역 수</h3>
              <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {regionCounts.map((r) => (
                  <li key={r.name}>
                    <button
                      type="button"
                      onClick={() => handleSigunguClick(r.name)}
                      aria-pressed={sigungu === r.name}
                      className={`press flex w-full items-center justify-between rounded-[10px] border px-3 py-2 text-left ${
                        sigungu === r.name
                          ? "border-primary bg-primary-soft"
                          : "border-line bg-surface"
                      }`}
                    >
                      <span className="truncate text-[12px] font-semibold text-ink">
                        {r.name}
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-text-2">
                        {r.count.toLocaleString("ko-KR")}곳
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* ===== 데이터 출처 ===== */}
      <DataSourceCard sources={sources} />

      {/* ===== 면책 ===== */}
      <p className="flex gap-1.5 rounded-[10px] bg-primary-soft px-3 py-2 text-[10px] leading-[1.6] text-primary">
        <Icon name="landmark" size={13} className="mt-px shrink-0" />
        <span>
          구역·진행단계는 {asOfLabel ? `${asOfLabel} ` : ""}공개자료 기준 참고값이며 좌표는 구역
          대표점 근사값 — 최신 고시·단계와 다를 수 있어요.
        </span>
      </p>
    </div>
  );
}
