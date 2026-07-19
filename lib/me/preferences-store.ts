/**
 * 사용자 페르소나·우선순위(개인화 가중) 서버 저장소.
 * - 로그인 시 Supabase `user_preferences` 에 영속.
 * - Supabase 미설정 시 in-memory 폴백(개발/테스트).
 * 클라이언트는 비로그인 시 localStorage(personalization/store)로 폴백한다.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import {
  DEFAULT_PRIORITIES,
  type PersonaId,
  type PriorityWeights,
} from "@/lib/personalization/store";

export type ServerPreferences = {
  persona: PersonaId | null;
  priorities: PriorityWeights;
  holdingYears: number | null;
  riskTolerance: number | null;
  updatedAt: string | null;
};

export const DEFAULT_SERVER_PREFERENCES: ServerPreferences = {
  persona: null,
  priorities: { ...DEFAULT_PRIORITIES },
  holdingYears: null,
  riskTolerance: null,
  updatedAt: null,
};

const mem = new Map<string, ServerPreferences>();

function normalizePriorities(input: unknown): PriorityWeights {
  const p = (input ?? {}) as Partial<PriorityWeights>;
  return {
    school: Number.isFinite(p.school) ? Number(p.school) : DEFAULT_PRIORITIES.school,
    transport: Number.isFinite(p.transport) ? Number(p.transport) : DEFAULT_PRIORITIES.transport,
    price: Number.isFinite(p.price) ? Number(p.price) : DEFAULT_PRIORITIES.price,
    future: Number.isFinite(p.future) ? Number(p.future) : DEFAULT_PRIORITIES.future,
  };
}

export async function getPreferences(authorEmail: string): Promise<ServerPreferences> {
  const em = authorEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) return mem.get(em) ?? { ...DEFAULT_SERVER_PREFERENCES };
  const { data, error } = await sb
    .from("user_preferences")
    .select("*")
    .eq("author_email", em)
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_SERVER_PREFERENCES };
  const row = data as Record<string, unknown>;
  return {
    persona: (row.persona as PersonaId | null) ?? null,
    priorities: normalizePriorities(row.priorities),
    holdingYears: row.holding_years != null ? Number(row.holding_years) : null,
    riskTolerance: row.risk_tolerance != null ? Number(row.risk_tolerance) : null,
    updatedAt: row.updated_at != null ? String(row.updated_at) : null,
  };
}

export async function putPreferences(
  authorEmail: string,
  patch: {
    persona?: PersonaId | null;
    priorities?: Partial<PriorityWeights>;
    holdingYears?: number | null;
    riskTolerance?: number | null;
  },
): Promise<ServerPreferences> {
  const em = authorEmail.trim().toLowerCase();
  const now = new Date().toISOString();
  const current = await getPreferences(em);
  const next: ServerPreferences = {
    persona: patch.persona !== undefined ? patch.persona : current.persona,
    priorities: patch.priorities
      ? normalizePriorities({ ...current.priorities, ...patch.priorities })
      : current.priorities,
    holdingYears: patch.holdingYears !== undefined ? patch.holdingYears : current.holdingYears,
    riskTolerance:
      patch.riskTolerance !== undefined ? patch.riskTolerance : current.riskTolerance,
    updatedAt: now,
  };

  const sb = getServiceSupabase();
  if (!sb) {
    mem.set(em, next);
    return next;
  }
  await sb.from("user_preferences").upsert(
    {
      author_email: em,
      persona: next.persona,
      priorities: next.priorities,
      holding_years: next.holdingYears,
      risk_tolerance: next.riskTolerance,
      updated_at: now,
    },
    { onConflict: "author_email" },
  );
  return next;
}
