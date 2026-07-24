/**
 * 단지 Q&A — 서버 전용 데이터 접근.
 *
 * RLS deny-all(정책 없음) 테이블(complex_questions / complex_answers)이므로
 * service-role(또는 read-only) 클라이언트 경유로만 접근한다.
 *
 * PRIVACY: author_email 은 PII 다. 목록/상세에는 절대 원본 이메일을 노출하지 않고
 * `maskEmail()` 로 마스킹한 `authorLabel` 만 반환 타입에 담는다.
 *
 * 더미데이터 정책: 실데이터 우선, 없으면 정확히 1건의 예시(isSample)만 노출한다.
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

/* ---------- 예시(샘플) 폴백 — 실데이터가 하나도 없을 때만 사용 ---------- */

const SAMPLE_ID = "sample-eunma-0001";

function sampleQuestion(): QnaQuestion {
  return {
    id: SAMPLE_ID,
    complexId: null,
    complexName: "은마아파트",
    region: "서울 강남구 대치동",
    authorLabel: "sam***",
    title: "은마아파트 재건축 진행 상황이 궁금해요 (조합 설립 이후 일정)",
    body: "대치동 은마아파트 재건축 관련해서, 조합 설립 인가 이후 사업시행인가까지 대략 어느 정도 걸릴지, 지금은 어느 단계인지 아시는 분 계실까요? 실거주 목적으로 매수를 고민 중인데 입주까지 시간이 얼마나 걸릴지 감이 안 잡혀서요. 학군(대치초·대청중)이랑 주차 상황도 같이 알려주시면 감사하겠습니다.",
    tags: ["재건축", "강남구", "학군", "실거주"],
    bountyPoints: 300,
    status: "answered",
    answerCount: 1,
    viewCount: 128,
    isSample: true,
    createdAt: new Date("2026-07-15T09:00:00.000Z").toISOString(),
  };
}

function sampleAnswer(): QnaAnswer {
  return {
    id: "sample-eunma-answer-0001",
    questionId: SAMPLE_ID,
    authorLabel: "nzp***",
    body: "은마는 조합 설립 인가 이후 정비계획·시공 관련 절차가 이어지는 단계예요. 사업시행인가 → 관리처분 → 착공 → 입주까지는 통상 수년 이상 걸리므로, 실거주 목적이라면 일정에 여유를 두고 보시는 게 좋습니다. 학군은 대치초·대청중 배정권이라 선호가 높고, 주차는 세대당 대수가 부족한 편이라는 의견이 많아요. (개인 의견이니 참고만 하세요.)",
    isAccepted: true,
    helpfulCount: 12,
    isSample: true,
    createdAt: new Date("2026-07-16T02:30:00.000Z").toISOString(),
  };
}

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
  // 실데이터 없음/미설정 → 예시 정확히 1건 (예시 배지로 구분)
  return [sampleQuestion()];
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
  if (id === SAMPLE_ID) {
    return { question: sampleQuestion(), answers: [sampleAnswer()] };
  }

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
  if (questionId === SAMPLE_ID) {
    return { ok: false, error: "예시 질문에는 답변할 수 없어요." };
  }

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
