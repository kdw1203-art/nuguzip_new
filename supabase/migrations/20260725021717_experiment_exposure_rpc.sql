-- A7 — 실험 노출 누적 RPC + 배정 집계 뷰.
--
-- 원격 DB 에 이미 적용된 마이그레이션의 사본이다(supabase/migrations/README.md 규약).
-- version 20260725021717 = supabase_migrations.schema_migrations 의 값과 정확히 일치.
--
-- 왜 upsert 가 아니라 함수인가: PostgREST 의 upsert 로는 "기존 값 + 1" 같은 증가를
-- 원자적으로 못 한다. 읽고-더하고-쓰면 동시 요청에서 노출 수가 조용히 새어 나간다.
-- 그래서 증가는 전부 이 함수 안의 단일 INSERT ... ON CONFLICT 로 처리한다.
--
-- variant_conflicts 를 세는 이유: 같은 subject 가 다른 변형으로 다시 배정되면
-- (가중치를 실험 도중에 바꿨다거나 변형을 추가했을 때) 그 실험의 비교는 이미 깨졌다.
-- 이 값을 0 이 아닌 채로 화면에 그대로 보여줘서 "결과가 깨끗하지 않다"를 숨기지 않는다.

alter table public.experiment_assignments
  add column if not exists variant_conflicts integer not null default 0;

create or replace function public.record_experiment_exposure(
  p_experiment_key text,
  p_subject_key text,
  p_subject_kind text,
  p_variant text
) returns void
language plpgsql
as $function$
begin
  insert into public.experiment_assignments (experiment_key, subject_key, subject_kind, variant)
  values (p_experiment_key, p_subject_key, p_subject_kind, p_variant)
  on conflict (experiment_key, subject_key) do update
    set last_seen_at = now(),
        exposure_count = public.experiment_assignments.exposure_count + 1,
        variant_conflicts = public.experiment_assignments.variant_conflicts
          + case
              when public.experiment_assignments.variant is distinct from excluded.variant then 1
              else 0
            end;
end;
$function$;

-- 브라우저(anon)가 직접 호출해 배정을 부풀릴 수 없게 한다. 서버 라우트만 실행한다.
revoke all on function public.record_experiment_exposure(text, text, text, text) from public;
revoke all on function public.record_experiment_exposure(text, text, text, text) from anon, authenticated;
grant execute on function public.record_experiment_exposure(text, text, text, text) to service_role;

-- 배정 집계 — PostgREST 는 GROUP BY 를 못 하므로 뷰로 만든다.
create or replace view public.experiment_assignment_stats
with (security_invoker = on) as
select
  a.experiment_key,
  a.variant,
  count(*)::bigint as subjects,
  count(*) filter (where a.subject_kind = 'user')::bigint as user_subjects,
  sum(a.exposure_count)::bigint as exposures,
  sum(a.variant_conflicts)::bigint as variant_conflicts,
  min(a.assigned_at) as first_assigned_at,
  max(a.last_seen_at) as last_seen_at
from public.experiment_assignments a
group by a.experiment_key, a.variant;

revoke all on public.experiment_assignment_stats from anon, authenticated;
grant select on public.experiment_assignment_stats to service_role;
