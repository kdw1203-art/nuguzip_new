"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { NoteLocationSearch, type NoteLocation } from "./NoteLocationSearch";
import { FieldCaptureConsentNotice } from "@/components/inspection/field-capture-consent";
import { useMoment } from "@/app/components/motion/MomentProvider";
import {
  allKnownChecklistItems,
  getChecklistForIntent,
  type InspectionChecklistIntent,
} from "@/lib/inspection/checklist";

/* 임장노트 작성/수정 공용 폼 (시안 6b·6r)
   - 작성: POST /api/inspection/notes → /api/inspection/ai(AI 정리) → 상세 이동
   - 수정: PATCH /api/inspection/notes/[id] (소유자 전용 — /notes/[id]/edit)
   - 템플릿: /notes/new?tpl={id} → 서버에서 읽어 props 로 전달, 고려사항 체크리스트 프리셋 주입
   - #45 임시저장: 작성 모드에서만 localStorage(nz_note_draft) 1초 디바운스 자동 저장 */

const LEVELS = ["좋음", "보통", "아쉬움"] as const;
type Level = (typeof LEVELS)[number];

/** 현장 감각 평가 — 5축(scores)로 매핑되는 항목 */
const CHECK_DEFAULTS: Record<string, Level> = {
  채광: "좋음",
  소음: "보통",
  주차: "아쉬움",
  교통: "좋음",
  경사: "보통",
  보안: "보통",
  학군: "보통",
  관리: "보통",
  호재: "보통",
};

const VISIT_GROUPS: { label: string; options: string[] }[] = [
  { label: "유형", options: ["아파트", "빌라", "오피스텔"] },
  { label: "시간대", options: ["오전", "오후", "저녁", "주말"] },
  { label: "목적", options: ["실거주", "투자", "전월세", "갈아타기"] },
];

/* 방문 정보 3칩 ↔ metadata 키.
   예전엔 시간대만 transportation 으로 서버에 갔고, 유형·목적은 payload 의 어디에도
   (scores·sections·metadata 어디에도) 없었다. 탭하면 강조까지 되는데 저장하는 순간
   사라져 localStorage 초안에만 남았다 — 눌러도 아무 일이 없는 컨트롤이었던 셈이다.
   metadata 는 jsonb 라 임의 키가 그대로 보존되고 POST/PATCH 라우트도 통과시키므로
   satisfaction 과 같은 자리에 세 값을 모두 적고, 수정 모드에서 되읽는다. */
const VISIT_META_KEYS: Record<string, string> = {
  유형: "propertyType",
  시간대: "visitTimeSlot",
  목적: "visitPurpose",
};

const VISIT_DEFAULTS: Record<string, string> = {
  유형: "아파트",
  시간대: "오후",
  목적: "실거주",
};

type TagTone = "pos" | "neg";
type TagDef = { label: string; tone: TagTone };

/* 자주 쓰는 태그 후보 — 기본은 아무것도 선택하지 않는다(남의 기록처럼 보이지 않게) */
const TAG_CANDIDATES: TagDef[] = [
  { label: "초품아", tone: "pos" },
  { label: "남향 위주", tone: "pos" },
  { label: "역세권", tone: "pos" },
  { label: "커뮤니티 시설", tone: "pos" },
  { label: "대단지", tone: "pos" },
  { label: "공원 인접", tone: "pos" },
  { label: "학원가", tone: "pos" },
  { label: "관리 잘됨", tone: "pos" },
  { label: "이중주차", tone: "neg" },
  { label: "노후 배관", tone: "neg" },
  { label: "층간소음", tone: "neg" },
  { label: "엘리베이터 대기", tone: "neg" },
  { label: "관리비 부담", tone: "neg" },
  { label: "일조권 우려", tone: "neg" },
  { label: "도로 소음", tone: "neg" },
  { label: "냄새·환기", tone: "neg" },
];

type TodoItem = { text: string; level: "중요" | "보통" };

const TODO_DEFAULTS: TodoItem[] = [
  { text: "겨울철 저층 채광 재확인", level: "중요" },
  { text: "관리비 내역·배관 교체 이력 문의", level: "보통" },
  { text: "주차 만차 시간대 재확인", level: "중요" },
  { text: "엘리베이터·택배 동선 확인", level: "보통" },
  { text: "단지 내 소음원(놀이터·도로) 체감", level: "보통" },
];

function intentFromVisitPurpose(purpose: string | undefined): InspectionChecklistIntent {
  if (purpose === "투자") return "투자";
  if (purpose === "전월세") return "전월세";
  return "실거주";
}

const LEVEL_SCORE: Record<Level, number> = { 좋음: 5, 보통: 3, 아쉬움: 1 };

const MAX_PHOTOS = 10;

export type NoteFormTemplate = {
  id: string;
  title: string;
  sections: { title: string; items: string[] }[];
};

export type NoteFormInitialNote = {
  id: string;
  title: string;
  region: string;
  aptName: string | null;
  visitDate: string;
  summary: string | null;
  scores: {
    location: number;
    school: number;
    transport: number;
    facility: number;
    future: number;
  };
  checklist: { label: string; done: boolean }[];
  sections: { pros?: string; cons?: string; memo?: string };
  photos: string[];
  isPublic: boolean;
  metadata?: Record<string, unknown> | null;
};

/* ===== #45 임시저장 (localStorage — 작성 모드 전용) ===== */

const DRAFT_KEY = "nz_note_draft";

type NoteDraft = {
  v: 1;
  savedAt: string;
  checks: Record<string, Level>;
  visit: Record<string, string>;
  tags: string[];
  doneTodos: string[];
  satisfaction: number;
  memo: string;
  /* 선택 필드(구버전 드래프트 호환) */
  loc?: NoteLocation;
  photos?: string[];
  isPublic?: boolean;
  /** 카테고리 체크리스트 항목 id → 체크 여부 */
  groupChecked?: Record<string, boolean>;
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parseDraft(raw: string | null): NoteDraft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || o.v !== 1) return null;
    if (
      typeof o.savedAt !== "string" ||
      typeof o.memo !== "string" ||
      typeof o.satisfaction !== "number" ||
      !o.checks ||
      typeof o.checks !== "object" ||
      !o.visit ||
      typeof o.visit !== "object" ||
      !isStringArray(o.tags) ||
      !isStringArray(o.doneTodos)
    ) {
      return null;
    }
    const checks: Record<string, Level> = {};
    for (const [k, val] of Object.entries(o.checks as Record<string, unknown>)) {
      if (typeof val === "string" && (LEVELS as readonly string[]).includes(val)) {
        checks[k] = val as Level;
      }
    }
    const visit: Record<string, string> = {};
    for (const [k, val] of Object.entries(o.visit as Record<string, unknown>)) {
      if (typeof val === "string") visit[k] = val;
    }
    let loc: NoteLocation | undefined;
    if (o.loc && typeof o.loc === "object") {
      const l = o.loc as Record<string, unknown>;
      if (typeof l.aptName === "string" && typeof l.region === "string") {
        loc = {
          aptName: l.aptName,
          region: l.region,
          complexId: typeof l.complexId === "string" ? l.complexId : null,
          lat: typeof l.lat === "number" ? l.lat : null,
          lng: typeof l.lng === "number" ? l.lng : null,
        };
      }
    }
    const groupChecked: Record<string, boolean> = {};
    if (o.groupChecked && typeof o.groupChecked === "object") {
      for (const [k, val] of Object.entries(o.groupChecked as Record<string, unknown>)) {
        if (typeof val === "boolean") groupChecked[k] = val;
      }
    }
    return {
      v: 1,
      savedAt: o.savedAt,
      checks,
      visit,
      tags: o.tags,
      doneTodos: o.doneTodos,
      satisfaction: o.satisfaction,
      memo: o.memo,
      loc,
      photos: isStringArray(o.photos) ? o.photos : undefined,
      isPublic: typeof o.isPublic === "boolean" ? o.isPublic : undefined,
      groupChecked: Object.keys(groupChecked).length ? groupChecked : undefined,
    };
  } catch {
    return null;
  }
}

/* ===== 수정 모드 초기값 매핑 ===== */

function levelFromScore(v: number): Level {
  if (v >= 4) return "좋음";
  if (v > 0 && v <= 2) return "아쉬움";
  return "보통";
}

/* 저장 시 점수 매핑의 근사 역변환 — 세분 항목은 같은 축 점수로 복원 */
function checksFromNote(n: NoteFormInitialNote): Record<string, Level> {
  const fromMeta = n.metadata?.fieldRatings;
  if (fromMeta && typeof fromMeta === "object") {
    const out = { ...CHECK_DEFAULTS };
    for (const [k, val] of Object.entries(fromMeta as Record<string, unknown>)) {
      if (typeof val === "string" && (LEVELS as readonly string[]).includes(val)) {
        out[k] = val as Level;
      }
    }
    return out;
  }
  const facility = levelFromScore(n.scores.facility);
  return {
    채광: facility,
    소음: facility,
    주차: facility,
    보안: facility,
    관리: facility,
    교통: levelFromScore(n.scores.transport),
    경사: levelFromScore(n.scores.location),
    학군: levelFromScore(n.scores.school),
    호재: levelFromScore(n.scores.future),
  };
}

function groupCheckedFromNote(n: NoteFormInitialNote | null | undefined): Record<string, boolean> {
  if (!n?.checklist?.length) return {};
  const known = allKnownChecklistItems();
  const byLabel = new Map(known.map((it) => [it.label, it.id]));
  const out: Record<string, boolean> = {};
  for (const c of n.checklist) {
    if (!c.done) continue;
    const id = byLabel.get(c.label);
    if (id) out[id] = true;
  }
  return out;
}

function splitTagText(s?: string): string[] {
  return (s ?? "")
    .split("·")
    .map((t) => t.trim())
    .filter(Boolean);
}

function tagDefsFromNote(n?: NoteFormInitialNote | null): TagDef[] {
  const defs = [...TAG_CANDIDATES];
  if (!n) return defs;
  for (const label of splitTagText(n.sections.pros)) {
    if (!defs.some((d) => d.label === label)) defs.push({ label, tone: "pos" });
  }
  for (const label of splitTagText(n.sections.cons)) {
    if (!defs.some((d) => d.label === label)) defs.push({ label, tone: "neg" });
  }
  return defs;
}

function todosFromTemplate(t: NoteFormTemplate): TodoItem[] {
  const out: TodoItem[] = [];
  for (const section of t.sections) {
    for (const item of section.items) {
      out.push({
        text: section.title ? `[${section.title}] ${item}` : item,
        level: "보통",
      });
      if (out.length >= 40) return out;
    }
  }
  return out;
}

function metaNumber(meta: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = meta?.[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/* 저장된 metadata 에서 방문 정보 3칩을 복원한다.
   되읽지 않으면 수정 모드가 항상 아파트/오후/실거주로 시작해, 사용자가 예전에 고른
   값을 화면에 보여주지도 않은 채 저장 때 기본값으로 덮어써 버린다. */
function visitFromNote(n?: NoteFormInitialNote | null): Record<string, string> {
  const out = { ...VISIT_DEFAULTS };
  if (!n) return out;
  for (const g of VISIT_GROUPS) {
    const saved = n.metadata?.[VISIT_META_KEYS[g.label]];
    if (typeof saved === "string" && g.options.includes(saved)) out[g.label] = saved;
  }
  return out;
}

export function NoteForm({
  template,
  initialNote,
  presetMemo,
}: {
  template?: NoteFormTemplate | null;
  initialNote?: NoteFormInitialNote | null;
  /** 작성 모드 메모 초안 프리필 (?memo= — /calculator 조건 전달용) */
  presetMemo?: string | null;
}) {
  const router = useRouter();
  const { showMoment } = useMoment();
  const isEdit = Boolean(initialNote);
  const editId = initialNote?.id ?? null;

  /* 위치(단지·주소) — 기본은 빈 값(placeholder). 프리필: ?apt=&region=&complexId=&lat=&lng= */
  const [loc, setLoc] = useState<NoteLocation>(() =>
    initialNote
      ? {
          aptName: initialNote.aptName ?? "",
          region: initialNote.region,
          complexId:
            typeof initialNote.metadata?.complexId === "string"
              ? (initialNote.metadata.complexId as string)
              : null,
          lat: metaNumber(initialNote.metadata, "lat"),
          lng: metaNumber(initialNote.metadata, "lng"),
        }
      : { aptName: "", region: "", complexId: null, lat: null, lng: null },
  );
  useEffect(() => {
    if (isEdit) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const apt = sp.get("apt")?.trim();
      const region = sp.get("region")?.trim();
      const complexId = sp.get("complexId")?.trim() || null;
      const latRaw = Number(sp.get("lat"));
      const lngRaw = Number(sp.get("lng"));
      if (apt || region || complexId) {
        setLoc((prev) => ({
          aptName: apt ? apt.slice(0, 60) : prev.aptName,
          region: region ? region.slice(0, 60) : prev.region,
          complexId,
          lat: Number.isFinite(latRaw) && latRaw !== 0 ? latRaw : null,
          lng: Number.isFinite(lngRaw) && lngRaw !== 0 ? lngRaw : null,
        }));
      }
    } catch {
      /* URL 파싱 실패 — 빈 위치 유지 */
    }
  }, [isEdit]);

  const [checks, setChecks] = useState<Record<string, Level>>(() =>
    initialNote ? checksFromNote(initialNote) : CHECK_DEFAULTS,
  );
  const [visit, setVisit] = useState<Record<string, string>>(() =>
    visitFromNote(initialNote),
  );
  const [tagDefs, setTagDefs] = useState<TagDef[]>(() => tagDefsFromNote(initialNote));
  const [tags, setTags] = useState<string[]>(() =>
    initialNote
      ? [...splitTagText(initialNote.sections.pros), ...splitTagText(initialNote.sections.cons)]
      : [],
  );
  const [todoItems, setTodoItems] = useState<TodoItem[]>(() => {
    if (initialNote && initialNote.checklist.length > 0) {
      /* 카테고리 체크리스트 라벨은 그룹 UI로 복원 — 커스텀/기본 고려사항만 남긴다 */
      const knownLabels = new Set(allKnownChecklistItems().map((it) => it.label));
      const levels =
        initialNote.metadata?.todoLevels &&
        typeof initialNote.metadata.todoLevels === "object"
          ? (initialNote.metadata.todoLevels as Record<string, unknown>)
          : {};
      const custom = initialNote.checklist
        .filter((c) => !knownLabels.has(c.label))
        .map((c) => ({
          text: c.label,
          level: levels[c.label] === "중요" ? ("중요" as const) : ("보통" as const),
        }));
      return custom.length ? custom : TODO_DEFAULTS;
    }
    if (template && template.sections.length > 0) return todosFromTemplate(template);
    return TODO_DEFAULTS;
  });
  const [doneTodos, setDoneTodos] = useState<string[]>(() => {
    if (!initialNote) return [];
    const knownLabels = new Set(allKnownChecklistItems().map((it) => it.label));
    return initialNote.checklist
      .filter((c) => c.done && !knownLabels.has(c.label))
      .map((c) => c.label);
  });
  const [groupChecked, setGroupChecked] = useState<Record<string, boolean>>(() =>
    groupCheckedFromNote(initialNote),
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    location: true,
    complex: true,
    interior: false,
    school: false,
    facility: false,
    future: false,
  });

  const checklistGroups = useMemo(
    () => getChecklistForIntent(intentFromVisitPurpose(visit["목적"])),
    [visit],
  );
  const [satisfaction, setSatisfaction] = useState(() => {
    const v = metaNumber(initialNote?.metadata, "satisfaction");
    return v == null ? 7.5 : Math.max(0, Math.min(10, v));
  });
  /* 메모·태그는 기본 빈 값 — 예시 문구는 placeholder 로만 노출.
     작성 모드에서 ?memo= 프리셋이 오면 초안으로 채운다. */
  const [memo, setMemo] = useState(() =>
    initialNote ? (initialNote.sections.memo ?? initialNote.summary ?? "") : (presetMemo ?? ""),
  );
  /* 공개 여부 — 기본 비공개, 저장 직전 명시적으로 선택 */
  const [isPublic, setIsPublic] = useState(initialNote?.isPublic ?? false);
  const [photos, setPhotos] = useState<string[]>(initialNote?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [savedDraft, setSavedDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loginHref = `/login?callbackUrl=${encodeURIComponent(
    editId ? `/notes/${editId}/edit` : "/notes/new",
  )}`;

  /* #45 복구 배너용 드래프트 스냅샷 — 작성 모드에서만 */
  const [pendingDraft, setPendingDraft] = useState<NoteDraft | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (isEdit) return;
    try {
      setPendingDraft(parseDraft(window.localStorage.getItem(DRAFT_KEY)));
    } catch {
      /* 프라이빗 모드 등 접근 불가 — 배너 없이 진행 */
    }
  }, [isEdit]);

  const buildDraft = (): NoteDraft => ({
    v: 1,
    savedAt: new Date().toISOString(),
    checks,
    visit,
    tags,
    doneTodos,
    satisfaction,
    memo,
    loc,
    photos,
    isPublic,
    groupChecked,
  });

  const writeDraft = () => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraft()));
      setSavedDraft(true);
    } catch {
      /* 저장 불가 환경 — 조용히 무시 */
    }
  };

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* no-op */
    }
  };

  /* 입력 변경 시 1초 디바운스 자동 저장 (첫 렌더·수정 모드 제외) */
  useEffect(() => {
    if (isEdit) return;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            v: 1,
            savedAt: new Date().toISOString(),
            checks,
            visit,
            tags,
            doneTodos,
            satisfaction,
            memo,
            loc,
            photos,
            isPublic,
            groupChecked,
          } satisfies NoteDraft),
        );
        setSavedDraft(true);
      } catch {
        /* no-op */
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [isEdit, checks, visit, tags, doneTodos, satisfaction, memo, loc, photos, isPublic, groupChecked]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setChecks({ ...CHECK_DEFAULTS, ...pendingDraft.checks });
    setVisit((prev) => ({ ...prev, ...pendingDraft.visit }));
    setTags(pendingDraft.tags);
    setTagDefs((prev) => {
      const next = [...prev];
      for (const label of pendingDraft.tags) {
        if (!next.some((d) => d.label === label)) next.push({ label, tone: "pos" });
      }
      return next;
    });
    setDoneTodos(pendingDraft.doneTodos);
    setSatisfaction(pendingDraft.satisfaction);
    setMemo(pendingDraft.memo);
    if (pendingDraft.loc) setLoc(pendingDraft.loc);
    if (pendingDraft.photos) setPhotos(pendingDraft.photos.slice(0, MAX_PHOTOS));
    if (typeof pendingDraft.isPublic === "boolean") setIsPublic(pendingDraft.isPublic);
    if (pendingDraft.groupChecked) setGroupChecked(pendingDraft.groupChecked);
    setPendingDraft(null);
  };

  const discardDraft = () => {
    clearDraft();
    setPendingDraft(null);
  };

  const draftSavedLabel = (() => {
    if (!pendingDraft) return null;
    const t = Date.parse(pendingDraft.savedAt);
    if (!Number.isFinite(t)) return null;
    const d = new Date(t);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} 저장됨`;
  })();

  const toggleTag = (label: string) =>
    setTags((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label],
    );
  const toggleTodo = (text: string) =>
    setDoneTodos((prev) =>
      prev.includes(text) ? prev.filter((t) => t !== text) : [...prev, text],
    );

  const addCustomTag = () => {
    const raw = window.prompt("추가할 태그를 입력하세요 (예: 조용한 단지)");
    const label = raw?.trim().slice(0, 20);
    if (!label) return;
    setTagDefs((prev) =>
      prev.some((d) => d.label === label) ? prev : [...prev, { label, tone: "pos" }],
    );
    setTags((prev) => (prev.includes(label) ? prev : [...prev, label]));
  };

  const addTodo = () => {
    const raw = window.prompt("추가할 고려사항을 입력하세요");
    const text = raw?.trim().slice(0, 80);
    if (!text) return;
    setTodoItems((prev) =>
      prev.some((t) => t.text === text) ? prev : [...prev, { text, level: "보통" }],
    );
  };

  /* 사진 업로드 — 기존 업로드 인프라(/api/upload) 실연결, 최대 10장 */
  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remain = MAX_PHOTOS - photos.length;
    if (remain <= 0) {
      setSaveError(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있어요.`);
      return;
    }
    const list = Array.from(files).slice(0, remain);
    setUploading(true);
    setSaveError(null);
    setNeedLogin(false);
    try {
      const uploaded: string[] = [];
      for (const f of list) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("folder", "notes");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (res.status === 401) {
          setNeedLogin(true);
          return;
        }
        const json: { url?: string; error?: string } = await res.json().catch(() => ({}));
        if (!res.ok || !json.url) {
          setSaveError(json.error ?? "사진 업로드에 실패했어요.");
          return;
        }
        uploaded.push(String(json.url));
      }
      setPhotos((prev) => [...prev, ...uploaded].slice(0, MAX_PHOTOS));
    } catch {
      setSaveError("네트워크 오류로 사진을 올리지 못했어요.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = (url: string) =>
    setPhotos((prev) => prev.filter((p) => p !== url));

  const handleSave = async () => {
    if (saving || uploading) return;
    const aptName = loc.aptName.trim();
    const region = loc.region.trim();
    if (!aptName || !region) {
      setSaveError("단지·주소를 먼저 검색해 위치를 선택해 주세요.");
      return;
    }
    setSaving(true);
    setNeedLogin(false);
    setSaveError(null);
    const lv = (k: string): number => LEVEL_SCORE[checks[k] ?? "보통"];
    const posTags = tagDefs.filter((t) => t.tone === "pos" && tags.includes(t.label));
    const negTags = tagDefs.filter((t) => t.tone === "neg" && tags.includes(t.label));
    const intent = intentFromVisitPurpose(visit["목적"]);
    const groups = getChecklistForIntent(intent);
    const categoryChecklist = groups.flatMap((g) =>
      g.items
        .filter((it) => groupChecked[it.id])
        .map((it) => ({
          label: it.label,
          done: true,
          groupId: g.id,
        })),
    );
    const todoChecklist = todoItems.map((t) => ({
      label: t.text,
      done: doneTodos.includes(t.text),
      level: t.level,
    }));
    try {
      const payload = {
        title: `${aptName} 임장 기록`,
        region,
        aptName,
        visitDate: initialNote?.visitDate ?? new Date().toISOString().slice(0, 10),
        transportation: visit["시간대"] ?? null,
        summary: memo.trim() || null,
        scores: {
          location: Math.round((lv("경사") + lv("교통")) / 2),
          school: lv("학군"),
          transport: lv("교통"),
          facility: Math.round(
            (lv("채광") + lv("소음") + lv("주차") + lv("보안") + lv("관리")) / 5,
          ),
          future: lv("호재"),
        },
        checklist: [...categoryChecklist, ...todoChecklist],
        sections: {
          memo: memo.trim() || undefined,
          pros: posTags.map((t) => t.label).join(" · ") || undefined,
          cons: negTags.map((t) => t.label).join(" · ") || undefined,
        },
        photos,
        metadata: {
          complexId: loc.complexId ?? undefined,
          lat: loc.lat ?? undefined,
          lng: loc.lng ?? undefined,
          satisfaction,
          templateId: template?.id ?? undefined,
          propertyType: visit["유형"] || undefined,
          visitTimeSlot: visit["시간대"] || undefined,
          visitPurpose: visit["목적"] || undefined,
          intent:
            visit["목적"] === "투자" ||
            visit["목적"] === "실거주" ||
            visit["목적"] === "전월세"
              ? visit["목적"]
              : undefined,
          fieldRatings: checks,
          todoLevels: Object.fromEntries(todoItems.map((t) => [t.text, t.level])),
          checklistGroupCounts: {
            checked: categoryChecklist.length,
            groups: groups.length,
          },
        },
        isPublic,
      };
      const res = await fetch(
        editId ? `/api/inspection/notes/${editId}` : "/api/inspection/notes",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      const json: { note?: { id: string }; error?: string } = await res
        .json()
        .catch(() => ({}));
      const noteId = editId ?? json.note?.id;
      if (!res.ok || !noteId) {
        setSaveError(json.error ?? "저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (!editId) clearDraft(); // 정식 저장 완료 — 임시저장본 제거
      /* 저장이 확정된 지점에서 부른다. 바로 아래 AI 호출은 실패해도 저장은
         성공이므로, 그 결과를 기다렸다가 부르면 "저장됐다"는 사실이 AI 성패에
         따라 달라진다 — 사실과 연출을 묶으면 안 된다. */
      // AI 정리 실호출 — HTTP 200 + rule 폴백 가능. mode 로만 LLM/규칙 구분.
      setAiRunning(true);
      let aiFlag: "ok" | "rule" | "fail" = "fail";
      try {
        const aiRes = await fetch("/api/inspection/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId }),
        });
        const aiJson = aiRes.ok
          ? ((await aiRes.json().catch(() => null)) as { mode?: string } | null)
          : null;
        if (aiRes.ok && aiJson) {
          aiFlag = aiJson.mode === "llm" ? "ok" : "rule";
        }
      } catch {
        /* AI 실패 무시 — 노트 저장은 완료됨 */
      }
      showMoment({
        title: isEdit ? "수정한 내용을 저장했어요" : "임장노트를 저장했어요",
        subtitle:
          aiFlag === "ok"
            ? "AI 정리가 반영됐어요"
            : aiFlag === "rule"
              ? "규칙 기반 요약으로 정리됐어요"
              : "노트는 저장됐어요 · AI는 아래에서 다시 시도할 수 있어요",
      });
      router.push(`/notes/${noteId}?ai=${aiFlag}`);
    } catch {
      setSaveError("네트워크 오류로 저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setAiRunning(false);
      setSaving(false);
    }
  };

  /* 입력 진행도 — 예전엔 "2/3 단계"와 w-[66%] 하드코딩이었다. 이 폼은 단계가 없는
     단일 화면이고 1·3 단계로 갈 곳도 없었으며, 아무리 채워 넣어도 바가 움직이지 않았다.
     이제 사용자가 실제로 넣은 것만 센다 — 현장 체크·만족도는 기본값이 미리 들어가 있어
     '입력했다'고 말할 수 없으므로 세지 않는다(안 건드려도 채워진 것처럼 보이면 또 거짓말). */
  const progressItems = [
    { label: "위치", done: Boolean(loc.aptName.trim() && loc.region.trim()) },
    { label: "메모", done: memo.trim().length > 0 },
    { label: "태그", done: tags.length > 0 },
    {
      label: "체크리스트",
      done:
        checklistGroups.some((g) => g.items.some((it) => groupChecked[it.id])) ||
        doneTodos.length > 0,
    },
    { label: "사진", done: photos.length > 0 },
  ];
  const progressDone = progressItems.filter((i) => i.done).length;
  const progressPct = Math.round((progressDone / progressItems.length) * 100);

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-5 pb-10">
      {/* 상단 바 */}
      <div className="glass sticky top-3.5 z-40 mt-3.5 flex items-center justify-between rounded-2xl px-4 py-3">
        <Link
          href={editId ? `/notes/${editId}` : "/notes"}
          aria-label="닫기"
          className="text-base text-text-1"
        >
          ✕
        </Link>
        <div className="flex flex-col items-center">
          <div className="text-[15px] font-extrabold text-ink">
            {isEdit ? "임장노트 수정" : "임장노트"}
          </div>
          <div className="text-[10px] text-text-3">
            {isEdit ? "내 기록 수정" : "현장 기록"} · {progressDone}/
            {progressItems.length} 항목 입력
          </div>
        </div>
        {isEdit ? (
          <span className="w-[52px]" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={writeDraft}
            className="text-[13px] font-bold text-primary"
          >
            {savedDraft ? "저장됨 ✓" : "임시저장"}
          </button>
        )}
      </div>

      {/* 입력 진행 바 — 위 progressItems 의 실제 충족 개수만 반영(하드코딩 66% 제거) */}
      <div
        className="relative mt-2.5 h-1 rounded-sm bg-[#e9edf3]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progressItems.length}
        aria-valuenow={progressDone}
        aria-label={`임장노트 입력 진행 — ${progressItems
          .filter((i) => i.done)
          .map((i) => i.label)
          .join(", ") || "아직 입력한 항목 없음"}`}
      >
        <div
          className="absolute left-0 top-0 h-1 rounded-sm bg-primary transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="mt-3.5 flex flex-col gap-3">
        {/* #45 임시저장 복구 배너 */}
        {pendingDraft && (
          <div className="rise-in flex items-center gap-2.5 rounded-[14px] border border-[rgba(29,79,216,.2)] bg-[rgba(29,79,216,.06)] px-4 py-3">
            <Icon name="📝" size={18} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-ink">
                작성 중이던 노트가 있어요
              </div>
              {draftSavedLabel && (
                <div className="text-[10px] text-text-3">{draftSavedLabel}</div>
              )}
            </div>
            <button
              type="button"
              onClick={restoreDraft}
              className="shrink-0 rounded-[9px] bg-primary px-3 py-2 text-[11px] font-bold text-white"
            >
              이어서 쓰기
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="shrink-0 rounded-[9px] border border-[#e2e7ee] bg-surface px-3 py-2 text-[11px] font-bold text-text-2"
            >
              삭제
            </button>
          </div>
        )}

        {/* 템플릿 적용 안내 */}
        {template && !isEdit && (
          <div className="rise-in flex items-center gap-2.5 rounded-[14px] border border-[rgba(29,79,216,.15)] bg-[rgba(29,79,216,.06)] px-4 py-3">
            <Icon name="notebook-pen" size={16} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1 text-xs text-text-2">
              <b className="text-primary">{template.title}</b> 템플릿 적용 — 점검
              항목 {todoItems.length}개가 고려사항 체크리스트에 채워졌어요.
            </div>
          </div>
        )}

        {/* 로그인 없이 작성 안내 */}
        {!isEdit && (
          <div className="rise-in rounded-[14px] border border-[rgba(29,79,216,.15)] bg-[rgba(29,79,216,.08)] px-4 py-3 text-center text-xs font-semibold text-primary">
            로그인 없이 작성할 수 있어요 — 저장할 때만 로그인이 필요해요
          </div>
        )}

        {/* 위치 카드 — 단지·주소 검색으로 연결 */}
        <NoteLocationSearch value={loc} onChange={setLoc} />

        {/* 방문 정보 */}
        <div className="rise-in-2 card flex flex-col gap-2.5 p-4">
          <div className="text-[13px] font-extrabold text-ink">방문 정보</div>
          {VISIT_GROUPS.map((g) => (
            <div key={g.label} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-text-2">{g.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {g.options.map((opt) => {
                  const active = visit[g.label] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setVisit((prev) => ({ ...prev, [g.label]: opt }))
                      }
                      className={`rounded-full px-3 py-1.5 text-xs ${
                        active
                          ? "border-[1.5px] border-primary bg-[rgba(29,79,216,.1)] font-bold text-primary"
                          : "border border-[#e2e7ee] bg-surface text-text-2"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 현장 체크 — 세그먼트 평가 (9항목 → 5축 점수) */}
        <div className="rise-in-3 card flex flex-col gap-2.5 p-4">
          <div className="text-sm font-extrabold text-ink">
            현장 체크{" "}
            <span className="text-xs font-medium text-text-3">
              좋음·보통·아쉬움으로 빠르게 기록
            </span>
          </div>
          {Object.keys(CHECK_DEFAULTS).map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <span className="w-12 shrink-0 text-[13px] font-semibold text-text-1">
                {item}
              </span>
              <div className="flex flex-1 gap-1.5">
                {LEVELS.map((lv) => {
                  const active = checks[item] === lv;
                  return (
                    <button
                      key={lv}
                      type="button"
                      onClick={() =>
                        setChecks((prev) => ({ ...prev, [item]: lv }))
                      }
                      className={`flex h-9 flex-1 items-center justify-center rounded-[10px] px-2 text-xs ${
                        active
                          ? "border-[1.5px] border-primary bg-[rgba(29,79,216,.1)] font-bold text-primary"
                          : "border border-[#e2e7ee] bg-surface font-semibold text-text-2"
                      }`}
                    >
                      {lv}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* 종합 만족도 */}
          <div className="mt-0.5 flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-text-2">종합 만족도</span>
              <span className="font-extrabold text-primary">
                {satisfaction.toFixed(1)} / 10
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={satisfaction}
              onChange={(e) => setSatisfaction(Number(e.target.value))}
              className="w-full accent-[#1d4fd8]"
              aria-label="종합 만족도"
            />
          </div>
        </div>

        {/* 카테고리별 현장 체크리스트 (입지·단지·내부·학군·생활·호재) */}
        <div className="rise-in-3 card flex flex-col gap-2 p-4">
          <div className="text-[13px] font-extrabold text-ink">
            체크리스트{" "}
            <span className="text-[11px] font-medium text-text-3">
              목적({visit["목적"] || "실거주"})에 맞춰 항목이 바뀝니다 ·{" "}
              {checklistGroups.reduce(
                (n, g) => n + g.items.filter((it) => groupChecked[it.id]).length,
                0,
              )}
              개 체크
            </span>
          </div>
          {checklistGroups.map((g) => {
            const open = openGroups[g.id] ?? false;
            const doneCount = g.items.filter((it) => groupChecked[it.id]).length;
            return (
              <div key={g.id} className="rounded-xl border border-[#e8edf5] bg-bg/60">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((prev) => ({ ...prev, [g.id]: !open }))
                  }
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <span className="text-[13px] font-bold text-ink">{g.title}</span>
                  <span className="text-[11px] font-semibold text-text-3">
                    {doneCount}/{g.items.length} {open ? "▴" : "▾"}
                  </span>
                </button>
                {open && (
                  <div className="flex flex-col gap-1 border-t border-[#e8edf5] px-2 py-2">
                    {g.items.map((it) => {
                      const checked = Boolean(groupChecked[it.id]);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() =>
                            setGroupChecked((prev) => ({
                              ...prev,
                              [it.id]: !prev[it.id],
                            }))
                          }
                          className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
                        >
                          <span
                            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px] ${
                              checked
                                ? "bg-primary text-white"
                                : "border-[1.5px] border-[#c9d4e5] bg-surface"
                            }`}
                          >
                            {checked ? "✓" : ""}
                          </span>
                          <span
                            className={`flex-1 text-[13px] ${
                              checked ? "font-semibold text-ink" : "text-text-1"
                            }`}
                          >
                            {it.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 눈에 띈 점 태그 */}
        <div className="rise-in-4 card flex flex-col gap-2.5 p-4">
          <div className="text-[13px] font-extrabold text-ink">
            눈에 띈 점{" "}
            <span className="text-[11px] font-medium text-text-3">
              탭해서 태그 추가 (예: 초품아 · 이중주차)
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tagDefs.map((t) => {
              const active = tags.includes(t.label);
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => toggleTag(t.label)}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    active
                      ? t.tone === "neg"
                        ? "bg-danger-soft font-bold text-danger"
                        : "bg-[rgba(29,79,216,.1)] font-bold text-primary"
                      : "border border-[#e2e7ee] bg-surface text-text-2"
                  }`}
                >
                  {active ? "✓ " : ""}
                  {t.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={addCustomTag}
              className="rounded-full bg-[#f2f4f8] px-3 py-1.5 text-xs text-text-3"
            >
              ＋ 직접 입력
            </button>
          </div>
        </div>

        {/* 고려사항 — 추가 확인 항목 (중요/보통) */}
        <div className="rise-in-5 card flex flex-col gap-2.5 p-4">
          <div className="text-[13px] font-extrabold text-ink">
            고려사항{" "}
            <span className="text-[11px] font-medium text-text-3">
              결정 전 꼭 확인할 것 · 중요도 표시
            </span>
          </div>
          {todoItems.map((todo) => {
            const done = doneTodos.includes(todo.text);
            return (
              <button
                key={todo.text}
                type="button"
                onClick={() => toggleTodo(todo.text)}
                className="flex items-center gap-2.5 rounded-xl bg-bg px-3 py-[11px] text-left"
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px] ${
                    done
                      ? "bg-primary text-white"
                      : "border-[1.5px] border-[#c9d4e5] bg-surface"
                  }`}
                >
                  {done ? "✓" : ""}
                </span>
                <span
                  className={`flex-1 text-[13px] ${
                    done ? "text-text-3 line-through" : "text-text-1"
                  }`}
                >
                  {todo.text}
                </span>
                <span
                  className={`rounded-full px-2 py-[3px] text-[10px] font-bold ${
                    todo.level === "중요"
                      ? "bg-danger-soft text-danger"
                      : "bg-[#f2f4f8] text-text-2"
                  }`}
                >
                  {todo.level}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={addTodo}
            className="flex items-center gap-2 rounded-xl border-[1.5px] border-dashed border-[#c9d4e5] px-3 py-[11px] text-[13px] text-text-3"
          >
            ＋ 고려사항 추가
          </button>
        </div>

        {/* 메모 + 사진 */}
        <div className="rise-in-6 card flex flex-col gap-2.5 p-4">
          <div className="text-sm font-extrabold text-ink">
            메모{" "}
            <span className="text-xs font-medium text-text-3">
              현장에서 본 그대로
            </span>
          </div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            className="min-h-16 w-full resize-none rounded-xl bg-bg p-3.5 text-sm leading-[1.55] text-text-1 outline-none placeholder:text-text-3"
            placeholder="예: 남향이라 오후 채광 좋음. 단지 뒤 도로 소음 약간 있음"
            aria-label="메모"
          />

          {/* 사진 업로드 — /api/upload 실연결 (최대 10장) */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="현장 사진 선택"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {photos.map((p) => (
                <div key={p} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p}
                    alt="현장 사진"
                    className="h-[62px] w-[84px] rounded-[10px] object-cover"
                  />
                  <button
                    type="button"
                    aria-label="사진 삭제"
                    onClick={() => removePhoto(p)}
                    className="absolute -right-1 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-ink text-[10px] text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || photos.length >= MAX_PHOTOS}
            className="flex items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-[#c9d4e5] p-[11px] text-center text-[13px] font-bold text-text-2 disabled:opacity-60"
          >
            <Icon name="📷" size={16} className="inline align-middle" />
            {uploading
              ? "업로드 중…"
              : `사진 추가 (${photos.length}/${MAX_PHOTOS})`}
          </button>
        </div>

        {/* 공개/비공개 선택 — 기본 비공개, 저장 직전 명시적 선택 */}
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          onClick={() => setIsPublic((v) => !v)}
          className="rise-in-6 card flex items-center justify-between gap-3 p-4 text-left"
        >
          <div className="min-w-0">
            <div className="text-[13px] font-extrabold text-ink">
              공개 노트로 저장
            </div>
            <div className="mt-0.5 text-[11px] text-text-3">
              {isPublic
                ? "공개 피드에 노출돼요 · 노트당 최초 공개 시 100P 적립"
                : "꺼져 있으면 나만 볼 수 있어요 (기본값)"}
            </div>
          </div>
          <span
            aria-hidden="true"
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              isPublic ? "bg-primary" : "bg-[#d5dceb]"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                isPublic ? "left-[22px]" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </div>

      {/* 하단 CTA */}
      <div className="mt-4 flex flex-col gap-2">
        {needLogin && (
          <div className="rounded-[14px] border border-[rgba(29,79,216,.2)] bg-[rgba(29,79,216,.08)] px-4 py-3 text-center text-[13px] text-primary">
            저장하려면 로그인이 필요해요 — 작성한 내용은 유지돼요.{" "}
            <Link href={loginHref} className="font-extrabold underline underline-offset-2">
              로그인하기 ›
            </Link>
          </div>
        )}
        {saveError && (
          <div className="rounded-[14px] border border-[color:var(--danger-border)] bg-danger-soft px-4 py-3 text-center text-[13px] font-semibold text-danger">
            {saveError}
          </div>
        )}
        {/* AI 처리 고지 — 버튼을 누르기 전에 알린다 (몰래 보내지 않는다) */}
        <FieldCaptureConsentNotice />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading}
          className="btn-primary rounded-2xl p-[15px] text-center text-base disabled:opacity-60"
          style={{ boxShadow: "0 10px 26px rgba(29,79,216,.35)" }}
        >
          {aiRunning
            ? "AI 정리 중…"
            : saving
              ? "저장 중…"
              : isEdit
                ? "수정 완료 → AI 정리 받기"
                : "기록 완료 → AI 정리 받기"}
        </button>
        <div className="text-center text-xs text-text-3">
          저장할 때만 로그인 · 체크 항목은 다음 임장에도 유지
        </div>
      </div>
    </div>
  );
}
