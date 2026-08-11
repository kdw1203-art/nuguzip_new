-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260810002436,
-- name = ops_traffic_bot_share_and_index_hygiene.
-- 아래 본문은 그 원장의 statements 원문 그대로다(md5 a30f5360131a6b5302cfc29ddbc99e98 · 1652b —
-- 원장 md5 와 바이트 단위 대조 완료). 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 2026-08-10 병렬 세션(소유자 승인 ops 작업)이 MCP 로 적용하고
-- 파일 미러링을 남기지 않았다. 같은 날 6건(20260810001136~20260810004552)을
-- 2026-08-11 에 한꺼번에 복원했다.
--
-- 되돌리기: drop function ops.traffic_bot_share(integer); (지운 인덱스는 앞 미러의 create index 문으로 재생성 가능)

-- 2026-08-10 비용 절감 작업.
-- (1) 어제 만든 롤백표의 보조 인덱스는 불필요하다(롤백은 1회성 조인, seq scan 으로 충분).
--     760kB 를 매 쓰기마다 유지할 이유가 없다.
drop index if exists ops.jeonse_null_to_zero_20260810_id_idx;

-- (2) 봇 트래픽 비중 상시 계측.
--     실측(10일): RUM 33,587건 중 사람으로 볼 수 있는 모바일 UA 는 964건(2.9%).
--     meta-externalagent 단독 27%, /notes/new + /widget 두 경로가 32%.
--     robots.txt 조치 후 이 함수로 전후를 비교해 비용 절감 효과를 검증한다.
create or replace function ops.traffic_bot_share(days integer default 10)
returns table(
  bucket text,
  kind text,
  events bigint,
  pct numeric
)
language sql
stable
security definer
set search_path to 'public', 'ops'
set work_mem to '128MB'
as $function$
with base as (
  select coalesce(user_agent,'') ua, coalesce(path,'(null)') path
  from public.web_vitals
  where created_at > now() - (days || ' days')::interval
),
cls as (
  select case
           when ua ~* '(bot|crawl|spider|slurp|externalagent|gptbot|claudebot|ccbot|bingpreview|headless|python-requests|curl|wget)' then '봇(자칭)'
           when ua ~* '(iphone|android|ipad)' then '사람(모바일)'
           when ua = '' then '미상'
           else '데스크톱UA(봇 의심)'
         end k, path
  from base
)
select 'UA분류'::text, k, count(*)::bigint,
       round(100.0*count(*)/nullif(sum(count(*)) over (),0), 1)
from cls group by k
union all
select '경로', path, count(*)::bigint,
       round(100.0*count(*)/nullif(sum(count(*)) over (),0), 1)
from cls group by path
order by 1 desc, 3 desc
$function$;

revoke all on function ops.traffic_bot_share(integer) from public, anon, authenticated;

comment on function ops.traffic_bot_share(integer) is
  '봇 트래픽 비중 계측(WO-NEW-2 검증용). robots.txt 조치 전후 비교로 비용 절감 효과를 확인한다.';
