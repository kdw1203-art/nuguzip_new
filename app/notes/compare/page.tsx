import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";
import { CompareView } from "./CompareView";
import { Timeline } from "./Timeline";
import { safeAuth } from "@/lib/safe-auth";
import {
  getNote,
  listNotesByAuthorForApt,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import {
  buildVisitCompareModel,
  type CellTone,
  type VisitCompareModel,
} from "@/lib/inspection/visit-compare";
import { AiFeedbackButtons } from "@/app/components/AiFeedbackButtons";

/* 시안 9e — 노트 다회차 비교.
   실데이터: listNotesByAuthorForApt. 예시 목업 제거 — 회차 부족 시 empty+CTA. */

export const dynamic = "force-dynamic";

const TONE_CLASS: Record<CellTone, string> = {
  good: "font-extrabold text-primary",
  avg: "font-bold text-text-2",
  bad: "font-extrabold text-danger",
  none: "text-text-3",
};

function firstParam(
  v: string | string[] | undefined,
): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0].trim() || null;
  return null;
}

async function loadCompareNotes(
  noteId: string | null,
  email: string | null,
): Promise<
  | { kind: "ok"; notes: InspectionNote[]; model: VisitCompareModel }
  | { kind: "need_login" }
  | { kind: "need_note" }
  | { kind: "need_more"; aptName: string; count: number; noteId: string }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
> {
  if (!email) return { kind: "need_login" };
  if (!noteId) return { kind: "need_note" };

  try {
    const note = await getNote(noteId);
    if (!note) return { kind: "need_note" };
    if (note.authorEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
      return { kind: "forbidden" };
    }
    const apt = note.aptName?.trim();
    if (!apt) {
      return { kind: "need_more", aptName: "단지명 없음", count: 1, noteId };
    }
    const notes = await listNotesByAuthorForApt(email, apt, 20);
    if (notes.length < 2) {
      return {
        kind: "need_more",
        aptName: apt,
        count: notes.length,
        noteId,
      };
    }
    const model = buildVisitCompareModel(notes);
    if (!model) return { kind: "need_more", aptName: apt, count: notes.length, noteId };
    return { kind: "ok", notes, model };
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

function CompareTable({ model }: { model: VisitCompareModel }) {
  const n = model.colCount;
  const gridStyle = {
    gridTemplateColumns: `90px repeat(${n}, minmax(72px, 1fr))`,
  } as const;
  const first = model.scores[0]?.value ?? 0;
  const last = model.scores[model.scores.length - 1]?.value ?? 0;

  return (
    <div className="rise-in-1 card overflow-x-auto rounded-[20px] px-[22px] py-5">
      <div className="min-w-[520px]">
        <div
          className="grid items-end gap-2 border-b border-[#f0f3f8] pb-2.5 pt-2 text-[11px] text-text-3"
          style={gridStyle}
        >
          <span />
          {model.headers.map((h) => (
            <div
              key={h.noteId}
              className={`text-center ${
                h.latest ? "rounded-lg bg-[rgba(29,79,216,.05)] p-0.5" : ""
              }`}
            >
              <Link
                href={`/notes/${encodeURIComponent(h.noteId)}`}
                className={`font-extrabold no-underline ${
                  h.latest ? "text-primary" : "text-text-1"
                }`}
              >
                {h.n}
              </Link>
              <br />
              {h.meta}
            </div>
          ))}
        </div>
        {model.rows.map((row) => (
          <div
            key={row.label}
            className="grid items-center gap-2 border-b border-[#f0f3f8] py-[9px] text-xs"
            style={gridStyle}
          >
            <span className="text-text-2">{row.label}</span>
            {row.cells.map((c, i) => (
              <span key={i} className={`text-center ${TONE_CLASS[c.tone]}`}>
                {c.text}
              </span>
            ))}
          </div>
        ))}
        <div
          className="grid items-center gap-2 py-[9px] text-xs"
          style={gridStyle}
        >
          <span className="text-text-2">종합 점수</span>
          {model.scores.map((s, i) => (
            <span key={i} className={`text-center font-extrabold ${s.cls}`}>
              {s.value}
            </span>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-text-3">
          점수 추이 {first} → {last} · 작성자 5축 평균×20 (0~100)
        </div>
      </div>
    </div>
  );
}

export default async function NotesComparePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const noteId = firstParam(sp.noteId);
  const session = await safeAuth();
  const email = session?.user?.email?.trim() ?? null;
  const result = await loadCompareNotes(noteId, email);

  if (result.kind === "ok") {
    const { model } = result;
    return (
      <PageShell breadcrumb={`임장노트 › 회차 비교 › ${model.aptName}`}>
        <div className="flex flex-col gap-3.5">
          <div className="rise-in flex flex-col gap-3 px-1 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-[22px] font-extrabold text-ink">
                노트 다회차 비교
              </h1>
              <p className="mt-1.5 text-sm text-text-2">
                {model.region ? `${model.region} · ` : ""}
                {model.aptName} — 내 방문 기록 {model.colCount}회
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {model.headers.map((h) => (
                <Link
                  key={h.noteId}
                  href={`/notes/${encodeURIComponent(h.noteId)}`}
                  className="chip-tag px-2.5 py-1.5 no-underline"
                >
                  {h.n}
                </Link>
              ))}
            </div>
          </div>

          <CompareView
            timeline={<Timeline steps={model.timeline} />}
            table={<CompareTable model={model} />}
          />

          <div className="rise-in-2">
            <AIPanel title="다회차 종합 (규칙 요약)">
              {model.summaryText}
            </AIPanel>
            <div className="mt-2">
              <AiFeedbackButtons
                targetType="visit_compare"
                targetId={noteId ?? model.headers[model.headers.length - 1]?.noteId}
                context={{ aptName: model.aptName, visits: model.colCount }}
              />
            </div>
          </div>

          <div className="rise-in-3 card flex flex-col items-start gap-2.5 rounded-[20px] px-[22px] py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-extrabold text-ink">다음 방문 기록 남기기</div>
              <p className="mt-0.5 text-xs text-text-2">
                같은 단지를 한 번 더 기록하면 표에 새 열이 붙어요.
              </p>
            </div>
            <Link
              href={`/notes/new?apt=${encodeURIComponent(model.aptName)}${
                model.region ? `&region=${encodeURIComponent(model.region)}` : ""
              }`}
              className="btn-primary rounded-xl px-4 py-2.5 text-[13px] no-underline"
            >
              이 단지 노트 쓰기
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const emptyTitle =
    result.kind === "need_login"
      ? "로그인이 필요해요"
      : result.kind === "forbidden"
        ? "내 노트만 비교할 수 있어요"
        : result.kind === "error"
          ? "회차 비교를 불러오지 못했어요"
          : result.kind === "need_more"
            ? `${result.aptName} 방문이 ${result.count}회예요`
            : "비교할 노트를 골라 주세요";

  const emptyDesc =
    result.kind === "need_login"
      ? "같은 단지를 2회 이상 기록한 뒤 회차 비교를 볼 수 있어요."
      : result.kind === "forbidden"
        ? "다른 사람의 임장노트 회차는 비교 화면에서 열 수 없어요."
        : result.kind === "error"
          ? result.message
          : result.kind === "need_more"
            ? "같은 단지 노트가 2회 이상이어야 표·타임라인이 채워져요. 예시 데이터로 채우지 않아요."
            : "노트 상세의 ‘회차 전체 비교’로 들어오거나, 내 노트에서 단지를 고른 뒤 비교해 주세요.";

  return (
    <PageShell breadcrumb="임장노트 › 회차 비교">
      <div className="flex flex-col gap-3.5">
        <div className="rise-in px-1">
          <h1 className="text-[22px] font-extrabold text-ink">노트 다회차 비교</h1>
          <p className="mt-1.5 text-sm text-text-2">
            같은 단지를 여러 번 기록하면 점수 축 변화를 표로 비교해요.
          </p>
        </div>
        <div className="card flex flex-col gap-3 rounded-[20px] px-[22px] py-8 text-center">
          <div className="text-[15px] font-extrabold text-ink">{emptyTitle}</div>
          <p className="mx-auto max-w-[420px] text-[13px] leading-[1.6] text-text-2">
            {emptyDesc}
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {result.kind === "need_login" ? (
              <Link
                href="/login?callbackUrl=/notes/compare"
                className="btn-primary rounded-xl px-4 py-2.5 text-[13px] no-underline"
              >
                로그인
              </Link>
            ) : result.kind === "need_more" ? (
              <>
                <Link
                  href={`/notes/new?apt=${encodeURIComponent(result.aptName)}`}
                  className="btn-primary rounded-xl px-4 py-2.5 text-[13px] no-underline"
                >
                  같은 단지 한 번 더 기록
                </Link>
                <Link
                  href={`/notes/${encodeURIComponent(result.noteId)}`}
                  className="btn-secondary rounded-xl px-4 py-2.5 text-[13px] no-underline"
                >
                  노트 상세로
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/notes?mine=1"
                  className="btn-primary rounded-xl px-4 py-2.5 text-[13px] no-underline"
                >
                  내 노트 보기
                </Link>
                <Link
                  href="/notes/new"
                  className="btn-secondary rounded-xl px-4 py-2.5 text-[13px] no-underline"
                >
                  임장노트 쓰기
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
