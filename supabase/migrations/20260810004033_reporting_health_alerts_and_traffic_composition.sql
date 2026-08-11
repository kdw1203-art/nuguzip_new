-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260810004033,
-- name = reporting_health_alerts_and_traffic_composition.
-- 아래 본문은 그 원장의 statements 원문 그대로다(md5 d8477dbaf2e459870f7e6f18d49840d0 · 1844b —
-- 원장 md5 와 바이트 단위 대조 완료). 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 2026-08-10 병렬 세션(소유자 승인 ops 작업)이 MCP 로 적용하고
-- 파일 미러링을 남기지 않았다. 같은 날 6건(20260810001136~20260810004552)을
-- 2026-08-11 에 한꺼번에 복원했다.
--
-- 되돌리기는 본문 머리말에 적혀 있다(drop view 2건). 단, traffic_composition 은 뒤이은 20260810004552 가 이미 지웠다.

-- 2026-08-10
-- 1) ops.health_alert_log 는 8/6부터 molit·월 롤오버 결함을 정확히 기록해 왔으나
--    어떤 리포트도 이 표를 읽지 않았다. reporting 스키마로 노출한다.
-- 2) 방문 지표를 봇/사람으로 나눠 보는 뷰. 아침 리포트가 상한을 방문자로
--    오독한 원인을 구조적으로 막는다.
-- 되돌리기: drop view reporting.health_alerts, reporting.traffic_composition;

create or replace view reporting.health_alerts as
select distinct on (check_name)
       check_name,
       severity,
       age_hours,
       detail,
       checked_at,
       round((extract(epoch from (now() - checked_at)) / 3600.0)::numeric, 1) as alert_age_hours
from   ops.health_alert_log
where  checked_at > now() - interval '14 days'
order  by check_name, checked_at desc;

comment on view reporting.health_alerts is
  '체크별 최근 경보 1건(14일 이내). severity=critical 은 아침 리포트 ''주의 필요''에 그대로 올린다.';

create or replace view reporting.traffic_composition as
with base as (
  select (created_at at time zone 'Asia/Seoul')::date as d,
         user_agent,
         path
  from   public.web_vitals
  where  created_at >= now() - interval '30 days'
)
select d,
       count(*) as events,
       count(*) filter (
         where user_agent ~* 'bot|crawler|spider|meta-externalagent|slurp|bingpreview'
       ) as bot_events,
       round(100.0 * count(*) filter (
         where user_agent ~* 'bot|crawler|spider|meta-externalagent|slurp|bingpreview'
       ) / nullif(count(*), 0), 1) as bot_pct,
       count(*) filter (
         where user_agent !~* 'bot|crawler|spider|meta-externalagent|slurp|bingpreview'
       ) as human_events,
       count(distinct path) as paths
from   base
group  by d;

comment on view reporting.traffic_composition is
  '일별 자체 계측(web_vitals)의 봇/사람 구성. human_events 만 사람 지표로 쓸 것. bot_pct 가 90% 이상이면 크롤러가 지표를 지배하는 상태다.';

grant usage on schema reporting to postgres;
grant select on reporting.health_alerts, reporting.traffic_composition to postgres;