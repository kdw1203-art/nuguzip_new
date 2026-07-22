"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NaverMap, type MapMarkerData } from "@/components/map/NaverMap";
import {
  STAGES,
  colorForType,
  labelForType,
  stageLabel,
  type ProjectTypeKey,
  type RedevelopmentProject,
  type StageKey,
} from "@/lib/redevelopment/types";
import { Icon } from "@/app/components/Icon";
import { TypeFilterPanel } from "./TypeFilterPanel";
import { DataSourceCard } from "./DataSourceCard";
import { NearbyPanel } from "./NearbyPanel";

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const MARKER_PREFIX = "redev:";

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
  const loc = [p.sigungu, p.address].filter(Boolean).join(" · ");
  const households = householdsLabel(p.households);
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
    setSelectedId(null);
  };

  const filtered = useMemo(
    () =>
      initialProjects.filter(
        (p) =>
          (types.size === 0 || types.has(p.typeKey)) &&
          (stages.size === 0 || stages.has(p.stageKey)),
      ),
    [initialProjects, types, stages],
  );

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

  // 선택 변경 시 해당 목록 카드로 스크롤(마커 클릭 → 목록 하이라이트)
  useEffect(() => {
    if (!selectedId) return;
    const el = cardRefs.current.get(selectedId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  const total = initialProjects.length;
  const topSigungu = sigunguCounts.slice(0, 12);

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

      {/* ===== 표시 개수 + 지역 분포 ===== */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-extrabold text-ink">
            표시 중 {filtered.length.toLocaleString("ko-KR")}곳
          </span>
          <span className="text-text-3">/ 전체 {total.toLocaleString("ko-KR")}곳</span>
        </div>
        {topSigungu.length > 0 ? (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {topSigungu.map((s) => (
              <span
                key={s.sigungu}
                className="chip chip-soft shrink-0 px-2.5 py-1 text-[11px]"
              >
                {s.sigungu} {s.count}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* ===== 지도 ===== */}
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

      {/* ===== 선택 구역 인근 매물·실거래 ===== */}
      {selectedProject ? (
        <NearbyPanel projectId={selectedProject.id} projectName={selectedProject.name} />
      ) : null}

      {/* ===== 목록 ===== */}
      {filtered.length === 0 ? (
        <div className="card rounded-2xl px-5 py-8 text-center text-[12px] text-text-3">
          선택한 조건에 해당하는 정비사업장이 없어요. 필터를 조정해 보세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {filtered.map((p) => {
            const color = colorForType(p.typeKey);
            const active = selectedId === p.id;
            const households = householdsLabel(p.households);
            const loc = [p.sigungu, p.address].filter(Boolean).join(" · ");
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
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 데이터 출처 ===== */}
      <DataSourceCard sources={sources} />

      {/* ===== 면책 ===== */}
      <p className="flex gap-1.5 rounded-[10px] bg-primary-soft px-3 py-2 text-[10px] leading-[1.6] text-primary">
        <Icon name="landmark" size={13} className="mt-px shrink-0" />
        <span>
          구역·진행단계는 공개 자료 기준 참고값이며 좌표는 구역 대표점 근사값 — 최신 고시와 다를 수
          있어요.
        </span>
      </p>
    </div>
  );
}
