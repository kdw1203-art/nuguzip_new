-- [2026-08-14] 운영 헬스 critical → 운영자 인박스 자동 통지.
--
-- 배경(제품 리뷰): ops.record_health_alerts()(매시 watchdog jobid=24)가 위반을
-- health_alert_log 에 적재하지만, 아무도 그 표를 상시 안 본다 — critical 이 나도
-- 운영자에게 닿지 않았다. 이 판은 같은 함수에서 운영자 인박스
-- (public.user_inbox_notifications)로 직접 알림을 넣는다. 앱 라우트·cron_secret
-- 에 의존하지 않는 순수 DB 경로라 즉시 동작한다(빌링/소셜 크론과 달리 대기 없음).
--
-- 스팸 방지(둘 다 충족해야 통지):
--  1) 지금 critical 이고
--  2) 같은 check 로 최근 20시간 내 운영자 통지가 없다
--     (전환 순간을 놓치지 않으면서, 지속 critical 은 하루 한 번만 재알림).
-- 운영자 통지는 body 에 '[HEALTH]' 표식을 넣어 dedup·식별한다.
--
-- error_log 급증도 함께 본다: 최근 1시간 error 지문 발생 합계가 임계 초과면 통지.
--
-- 롤백: record_health_alerts() 를 20260805225303 판으로 되돌린다(통지 블록 제거).

create or replace function ops.record_health_alerts()
returns integer
language plpgsql
security definer
set search_path to 'public', 'ops', 'cron'
as $function$
declare
  n integer;
  owner_emails text[] := array['kdw1203@gmail.com','nuguzip@naver.com'];
  em text;
  c record;
  err_count bigint;
begin
  -- 기존 동작: warn/critical 을 이력에 적재(90일 보존)
  insert into ops.health_alert_log (check_name, severity, detail, age_hours)
  select f.check_name, f.severity, f.detail, round((extract(epoch from f.age)/3600.0)::numeric, 1)
  from ops.etl_freshness() f
  where f.severity in ('warn','critical');
  get diagnostics n = row_count;
  delete from ops.health_alert_log where checked_at < now() - interval '90 days';

  -- [신설] critical 을 운영자 인박스로 통지(20시간 dedup)
  for c in
    select f.check_name, f.detail
    from ops.etl_freshness() f
    where f.severity = 'critical'
  loop
    -- 같은 check 로 최근 20시간 내 통지가 있으면 건너뛴다
    if exists (
      select 1 from public.user_inbox_notifications
      where body like '[HEALTH]%' || c.check_name || '%'
        and created_at > now() - interval '20 hours'
    ) then
      continue;
    end if;
    foreach em in array owner_emails loop
      insert into public.user_inbox_notifications (user_email, title, body, action_url)
      values (
        em,
        '운영 점검 필요 · ' || c.check_name,
        '[HEALTH] ' || c.check_name || ' 이 critical 상태입니다 — ' || left(coalesce(c.detail, ''), 300),
        '/admin/ops'
      );
    end loop;
  end loop;

  -- [신설] 에러 급증 통지 — 최근 1시간 error 지문 발생 합계 20건 초과
  select coalesce(sum(count), 0) into err_count
  from ops.error_log
  where level = 'error' and last_seen > now() - interval '1 hour';
  if err_count > 20 then
    if not exists (
      select 1 from public.user_inbox_notifications
      where body like '[HEALTH] error_log%'
        and created_at > now() - interval '6 hours'
    ) then
      foreach em in array owner_emails loop
        insert into public.user_inbox_notifications (user_email, title, body, action_url)
        values (
          em,
          '에러 급증 · 최근 1시간',
          '[HEALTH] error_log 최근 1시간 에러 ' || err_count || '건 — /admin/ops 에서 확인하세요.',
          '/admin/ops'
        );
      end loop;
    end if;
  end if;

  return n;
end;
$function$;

comment on function ops.record_health_alerts() is
  'ops.etl_freshness() 위반을 health_alert_log 에 적재 + critical/에러급증을 운영자 인박스로 통지(20h/6h dedup). 매시 watchdog(jobid 24).';