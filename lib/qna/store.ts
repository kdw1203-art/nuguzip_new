/**
 * 단지 Q&A — 서버 전용 데이터 접근.
 *
 * RLS deny-all(정책 없음) 테이블(complex_questions / complex_answers)이므로
 * service-role(또는 read-only) 클라이언트 경유로만 접근한다.
 *
 * PRIVACY: author_email 은 PII 다. 목록/상세에는 절대 원본 이메일을 노출하지 않고
 * `maskEmail()` 로 마스킹한 `authorLabel` 만 반환 타입에 담는다.
 *
 * 더미데이터 정책: 실데이터만 노출한다. 질문이 없으면 빈 목록을 반환하고,
 * 화면은 "아직 등록된 질문이 없어요" 빈 상태를 그린다.
 * (DB 행에 is_sample=true 로 운영자가 직접 심어둔 예시는 배지와 함께 그대로 노출한다.)
 */
import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import type { QnaQuestion, QnaAnswer } from "@/lib/qna/types";

/* 공개 조회 컬럼 — author_email 은 마스킹 목적으로만 select 하고 절대 그대로 노출하지 않는다. */
const QUESTION_COLUMNS =
  "id,complex_id,complex_name,region,author_email,title,body,tags,bounty_points,status,answer_count,view_count,accepted_answer_id,is_sample,created_at";
const ANSWER_COLUMNS =
  "id,question_id,author_email,body,is_accepted,helpful_count,is_sample,created_at";

/* ---------- 좌표 변환 헬퍼 ---------- */

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  return [];
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 이메일 마스킹 — local-part 앞 3글자 + "***".
 * 예: "kdw1203@gmail.com" → "kdw***". 값이 없으면 "익명".
 */
export function maskEmail(email: string): string {
  const raw = (email ?? "").trim();
  if (!raw) return "익명";
  const at = raw.indexOf("@");
  const local = at > 0 ? raw.slice(0, at) : raw;
  if (!local) return "익명";
  return `${local.slice(0, 3)}***`;
}

function mapQuestion(r: Record<string, unknown>): QnaQuestion {
  return {
    id: String(r.id ?? ""),
    complexId: r.complex_id != null ? String(r.complex_id) : null,
    complexName: r.complex_name != null ? String(r.complex_name) : null,
    region: r.region != null ? String(r.region) : null,
    authorLabel: maskEmail(r.author_email != null ? String(r.author_email) : ""),
    title: String(r.title ?? ""),
    body: r.body != null ? String(r.body) : "",
    tags: toStringArray(r.tags),
    bountyPoints: num(r.bounty_points) ?? 0,
    status: String(r.status ?? "open"),
    answerCount: num(r.answer_count) ?? 0,
    viewCount: num(r.view_count) ?? 0,
    isSample: r.is_sample === true,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

function mapAnswer(r: Record<string, unknown>): QnaAnswer {
  return {
    id: String(r.id ?? ""),
    questionId: String(r.question_id ?? ""),
    authorLabel: maskEmail(r.author_email != null ? String(r.author_email) : ""),
    body: r.body != null ? String(r.body) : "",
    isAccepted: r.is_accepted === true,
    helpfulCount: num(r.helpful_count) ?? 0,
    isSample: r.is_sample === true,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

/* 사실 우선: 여기 있던 예시 Q&A 1쌍(sample-eunma-0001)을 삭제했다.
   실존하는 은마아파트(서울 강남구 대치동)를 지목해, 재건축이 "조합 설립 인가 이후
   정비계획·시공 절차가 이어지는 단계"라고 진행 단계를 단정하고, 학군 배정(대치초·
   대청중)과 주차 사정까지 사실처럼 서술한 답변이었다. 게다가 채택 표시와 "도움됨
   12"까지 붙여 실제 이웃이 검증해 준 답변인 것처럼 보이게 했다 — 작성자도 답변도
   실재하지 않는다.
   재건축 단계는 매수 판단을 직접 좌우하는 정보이고, 시점에 따라 사실이 달라진다.
   "예시" 배지 하나로 감당할 수 있는 종류의 오류가 아니다.
   질문이 없으면 빈 목록을 반환한다 — 화면에는 "첫 질문 남기기" 빈 상태가 뜬다. */

/* ---------- 조회 ---------- */

/** 질문 목록 — created_at 내림차순. 실데이터가 없으면 예시 1건만 반환. */
export async function listQuestions(
  opts: { status?: string; limit?: number } = {},
): Promise<QnaQuestion[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const sb = getReadOnlySupabase();
  if (sb) {
    try {
      let q = sb.from("complex_questions").select(QUESTION_COLUMNS);
      if (opts.status) q = q.eq("status", opts.status);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((r) => mapQuestion(r as Record<string, unknown>));
      }
    } catch (e) {
      logger.warn("[qna] listQuestions", e);
    }
  }
  // 실데이터 없음/미설정 → 빈 목록. 질문을 지어내지 않는다.
  return [];
}

/**
 * 특정 단지의 Q&A — 단지 상세 임베드용. complex_name 정확 일치(실데이터만, 샘플 폴백 없음).
 * 없으면 빈 배열 → 호출측이 "첫 질문 남기기" 안내를 표시.
 */
export async function listQuestionsForComplex(
  complexName: string,
  limit = 5,
): Promise<QnaQuestion[]> {
  const name = complexName.trim();
  if (!name) return [];
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("complex_questions")
      .select(QUESTION_COLUMNS)
      .eq("complex_name", name)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 20));
    if (error || !Array.isArray(data)) return [];
    return data
      .map((r) => mapQuestion(r as Record<string, unknown>))
      .filter((q) => !q.isSample);
  } catch (e) {
    logger.warn("[qna] listQuestionsForComplex", e);
    return [];
  }
}

/** 상세 조회수 +1 — service client, best-effort(원자성 미보장, 실패 무시). */
async function incrementViewCount(id: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb || !id) return;
  try {
    const { data } = await sb
      .from("complex_questions")
      .select("view_count")
      .eq("id", id)
      .maybeSingle();
    const row = data as Record<string, unknown> | null;
    const current = row && row.view_count != null ? Number(row.view_count) : 0;
    await sb
      .from("complex_questions")
      .update({ view_count: current + 1 })
      .eq("id", id);
  } catch (e) {
    logger.warn("[qna] incrementViewCount", e);
  }
}

/** 질문 + 답변(created_at 오름차순). 예시 id 는 하드코딩 값으로 응답. */
export async function getQuestion(
  id: string,
): Promise<{ question: QnaQuestion; answers: QnaAnswer[] } | null> {
  if (!id) return null;

  const sb = getReadOnlySupabase();
  if (!sb) return null;
  try {
    const { data: qRow, error: qErr } = await sb
      .from("complex_questions")
      .select(QUESTION_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (qErr || !qRow) return null;
    const question = mapQuestion(qRow as Record<string, unknown>);

    const { data: aRows } = await sb
      .from("complex_answers")
      .select(ANSWER_COLUMNS)
      .eq("question_id", id)
      .order("created_at", { ascending: true });
    const answers = Array.isArray(aRows)
      ? aRows.map((r) => mapAnswer(r as Record<string, unknown>))
      : [];

    // 실데이터에 한해 조회수 +1 (best-effort, 오류 무시)
    await incrementViewCount(id);

    return { question, answers };
  } catch (e) {
    logger.warn("[qna] getQuestion", e);
    return null;
  }
}

/* ---------- 쓰기 ---------- */

/** 질문 등록 — service client. 제목 120자·본문 4000자 캡. */
export async function createQuestion(input: {
  email: string;
  title: string;
  body?: string;
  complexName?: string;
  region?: string;
  tags?: string[];
  bountyPoints?: number;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소를 사용할 수 없어요. 잠시 후 다시 시도해 주세요." };

  const email = (input.email ?? "").trim();
  if (!email) return { ok: false, error: "로그인이 필요합니다." };

  const title = (input.title ?? "").trim().slice(0, 120);
  if (title.length < 4) return { ok: false, error: "제목은 4글자 이상 입력해 주세요." };

  const body = (input.body ?? "").trim().slice(0, 4000);
  const complexName = input.complexName?.trim() || null;
  const region = input.region?.trim() || null;
  const tags = (input.tags ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
  const rawBounty = input.bountyPoints;
  const bountyPoints =
    typeof rawBounty === "number" && Number.isFinite(rawBounty)
      ? Math.max(0, Math.min(1_000_000, Math.trunc(rawBounty)))
      : 0;

  try {
    const { data, error } = await sb
      .from("complex_questions")
      .insert({
        author_email: email,
        title,
        body,
        complex_name: complexName,
        region,
        tags,
        bounty_points: bountyPoints,
        status: "open",
      })
      .select("id")
      .maybeSingle();
    const inserted = data as Record<string, unknown> | null;
    const newId = inserted?.id;
    if (error || !newId) {
      logger.error("[qna] createQuestion insert", error);
      return { ok: false, error: "질문 등록에 실패했어요. 잠시 후 다시 시도해 주세요." };
    }
    return { ok: true, id: String(newId) };
  } catch (e) {
    logger.error("[qna] createQuestion", e);
    return { ok: false, error: "질문 등록 중 오류가 발생했어요." };
  }
}

/** 답변 등록 — 답변 insert 후 질문 answer_count +1 / status='answered'(best-effort). */
export async function createAnswer(input: {
  questionId: string;
  email: string;
  body: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const questionId = (input.questionId ?? "").trim();
  if (!questionId) return { ok: false, error: "질문을 찾을 수 없어요." };

  const email = (input.email ?? "").trim();
  if (!email) return { ok: false, error: "로그인이 필요합니다." };

  const body = (input.body ?? "").trim().slice(0, 4000);
  if (body.length < 5) return { ok: false, error: "답변은 5글자 이상 입력해 주세요." };

  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소를 사용할 수 없어요. 잠시 후 다시 시도해 주세요." };

  try {
    // 질문 존재 확인 (없으면 거절)
    const { data: qRow, error: qErr } = await sb
      .from("complex_questions")
      .select("id,answer_count")
      .eq("id", questionId)
      .maybeSingle();
    const question = qRow as Record<string, unknown> | null;
    if (qErr || !question || !question.id) {
      return { ok: false, error: "질문을 찾을 수 없어요." };
    }

    const { data, error } = await sb
      .from("complex_answers")
      .insert({
        question_id: questionId,
        author_email: email,
        body,
      })
      .select("id")
      .maybeSingle();
    const inserted = data as Record<string, unknown> | null;
    const newId = inserted?.id;
    if (error || !newId) {
      logger.error("[qna] createAnswer insert", error);
      return { ok: false, error: "답변 등록에 실패했어요. 잠시 후 다시 시도해 주세요." };
    }

    // answer_count +1 & status 갱신 — best-effort
    try {
      const current =
        question.answer_count != null ? Number(question.answer_count) : 0;
      await sb
        .from("complex_questions")
        .update({
          answer_count: current + 1,
          status: "answered",
          updated_at: new Date().toISOString(),
        })
        .eq("id", questionId);
    } catch (e) {
      logger.warn("[qna] createAnswer bump", e);
    }

    return { ok: true, id: String(newId) };
  } catch (e) {
    logger.error("[qna] createAnswer", e);
    return { ok: false, error: "답변 등록 중 오류가 발생했어요." };
  }
}
