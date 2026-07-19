/**
 * 통합 개인화 인사이트 — 내 임장노트 + 내 AI 실행 + 페르소나를 한 곳에서 정규화.
 * 홈 "내 인사이트", 탐색/지역 "이 지역의 내 기록", /me 활동에서 공통 소비.
 */

import { listNotes, inspectionAverageScore, type InspectionNote } from "@/lib/inspection/store-db";
import { listRuns, type AiAnalysisRunRow } from "@/lib/ai/presets-store";
import { getPreferences, type ServerPreferences } from "@/lib/me/preferences-store";
import { workbenchDistrictIdFromLabel, workbenchLabelFromId } from "@/lib/ai/region-map";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";

export type MyNoteInsight = {
  id: string;
  title: string;
  region: string;
  districtId: string | null;
  avgScore: number;
  createdAt: string;
  href: string;
};

export type MyRunInsight = {
  id: string;
  tool: string;
  toolLabel: string;
  headline: string;
  score: number | null;
  districtId: string | null;
  createdAt: string;
  href: string;
};

export type DistrictInsight = {
  districtId: string;
  label: string;
  noteCount: number;
  avgScore: number | null;
  lastActivityAt: string | null;
  notes: MyNoteInsight[];
  runs: MyRunInsight[];
};

export type MyInsights = {
  preferences: ServerPreferences;
  recentNotes: MyNoteInsight[];
  recentRuns: MyRunInsight[];
  byDistrict: DistrictInsight[];
  /** districtFilter 지정 시 해당 구만 */
  district: DistrictInsight | null;
};

function toolLabelFor(tool: string): string {
  return TOOL_IDENTITIES[tool as AiAnalysisToolId]?.title ?? tool;
}

function noteToInsight(n: InspectionNote): MyNoteInsight {
  return {
    id: n.id,
    title: n.title,
    region: n.region,
    districtId: workbenchDistrictIdFromLabel(n.region),
    avgScore: Number(inspectionAverageScore(n.scores).toFixed(1)),
    createdAt: n.createdAt,
    href: `/inspection/${n.id}`,
  };
}

function runToInsight(r: AiAnalysisRunRow): MyRunInsight {
  return {
    id: r.id,
    tool: r.tool,
    toolLabel: toolLabelFor(r.tool),
    headline: r.structuredSummary?.headline ?? r.markdown.replace(/\s+/g, " ").slice(0, 80),
    score: r.structuredSummary?.score ?? null,
    districtId: r.districtId,
    createdAt: r.createdAt,
    href: r.districtId
      ? `/ai-analysis/${r.tool}?district=${encodeURIComponent(r.districtId)}`
      : `/ai-analysis/${r.tool}`,
  };
}

export async function buildMyInsights(
  authorEmail: string,
  districtFilter?: string | null,
): Promise<MyInsights> {
  const [notesRaw, runsRaw, preferences] = await Promise.all([
    listNotes(authorEmail).catch(() => [] as InspectionNote[]),
    listRuns(authorEmail, 60).catch(() => [] as AiAnalysisRunRow[]),
    getPreferences(authorEmail).catch(() => null),
  ]);

  const notes = notesRaw.map(noteToInsight);
  const runs = runsRaw.map(runToInsight);

  const districtMap = new Map<string, DistrictInsight>();
  const ensure = (districtId: string): DistrictInsight => {
    let d = districtMap.get(districtId);
    if (!d) {
      d = {
        districtId,
        label: workbenchLabelFromId(districtId) ?? districtId,
        noteCount: 0,
        avgScore: null,
        lastActivityAt: null,
        notes: [],
        runs: [],
      };
      districtMap.set(districtId, d);
    }
    return d;
  };

  for (const n of notes) {
    if (!n.districtId) continue;
    const d = ensure(n.districtId);
    d.notes.push(n);
    if (!d.lastActivityAt || n.createdAt > d.lastActivityAt) d.lastActivityAt = n.createdAt;
  }
  for (const r of runs) {
    if (!r.districtId) continue;
    const d = ensure(r.districtId);
    d.runs.push(r);
    if (!d.lastActivityAt || r.createdAt > d.lastActivityAt) d.lastActivityAt = r.createdAt;
  }

  for (const d of districtMap.values()) {
    d.noteCount = d.notes.length;
    if (d.notes.length) {
      d.avgScore = Number(
        (d.notes.reduce((acc, n) => acc + n.avgScore, 0) / d.notes.length).toFixed(1),
      );
    }
  }

  const byDistrict = [...districtMap.values()].sort((a, b) =>
    (b.lastActivityAt ?? "") < (a.lastActivityAt ?? "") ? -1 : 1,
  );

  const filterKey = districtFilter?.trim() || null;
  const district = filterKey ? districtMap.get(filterKey) ?? null : null;

  return {
    preferences: preferences ?? {
      persona: null,
      priorities: { school: 50, transport: 50, price: 50, future: 50 },
      holdingYears: null,
      riskTolerance: null,
      updatedAt: null,
    },
    recentNotes: notes.slice(0, 5),
    recentRuns: runs.slice(0, 5),
    byDistrict,
    district,
  };
}
