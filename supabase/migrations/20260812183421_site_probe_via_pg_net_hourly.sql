-- 2026-08-12: site.http_probe 의 기록 잡을 DB 안에서 완결 — pg_net + pg_cron.
--
-- 왜: vercel.json crons 로 앱 라우트를 부르게 배선했으나 18:15 UTC 예정 발화가
-- 오지 않았음을 런타임 로그로 실측(등록 여부를 이쪽에서 검증할 방법도 없음).
-- 20260811223945 의 "DB 에 pg_net 이 없어" 는 낡은 실측치였다 — 확장 목록에
-- pg_net 0.20.0 이 있고 활성화만 안 돼 있었다. 활성화하면 프로브를 발사·수집·
-- 기록까지 전부 이 DB 안에서 완결되어, 검증 불가능한 외부 스케줄러 의존이 없다.
--
-- pg_net 은 비동기다: http_get 은 request_id 만 돌려주고 응답은 net._http_response
-- 에 나중에 쌓인다. 그래서 잡 하나가 "지난 요청 수거 → 새 요청 발사" 순서로 돈다.
-- 매시 30분 실행이므로 감지 지연은 최대 2시간 — 검사 문턱(26h warn/50h critical)
-- 대비 충분하다. 응답이 30분 넘게 안 오면 그것 자체를 실패(status null)로 기록한다
-- — 다운일수록 기록이 없으면 안 된다.
--
-- 롤백: select cron.unschedule('site-probe-hourly');
--       drop function ops.run_site_probe();
--       drop table ops.site_probe_pending;
--       (pg_net 확장은 다른 사용처가 생길 수 있어 롤백에 포함하지 않음)
create extension if not exists pg_net;

create table if not exists ops.site_probe_pending (
  request_id   bigint primary key,
  url          text        not null,
  requested_at timestamptz not null default now()
);

comment on table ops.site_probe_pending is
  'pg_net 비동기 프로브의 미수거 요청. run_site_probe() 가 다음 실행에서 수거해 ops.site_probe 로 옮긴다.';

create or replace function ops.run_site_probe()
returns void
language plpgsql
security definer
set search_path to 'ops','net','pg_catalog'
as $$
declare
  p record;
  r record;
begin
  -- 1) 지난 요청 수거
  for p in select * from ops.site_probe_pending loop
    select status_code, timed_out, error_msg,
           (headers->>'x-vercel-error') as vercel_error
      into r
      from net._http_response where id = p.request_id;
    if found then
      insert into ops.site_probe(url, http_status, ttfb_ms, vercel_error, note)
      values (p.url, r.status_code, null, r.vercel_error,
              case when r.timed_out then 'pg_net 프로브: 타임아웃'
                   when r.error_msg is not null then ('pg_net 프로브 오류: ' || left(r.error_msg, 200))
                   else 'pg_net db-probe' end);
      delete from ops.site_probe_pending where request_id = p.request_id;
    elsif p.requested_at < now() - interval '30 minutes' then
      -- 응답이 소멸/유실 — 실패로 기록한다. 침묵 금지.
      insert into ops.site_probe(url, http_status, ttfb_ms, vercel_error, note)
      values (p.url, null, null, null, 'pg_net 프로브: 30분 내 응답 없음(유실)');
      delete from ops.site_probe_pending where request_id = p.request_id;
    end if;
  end loop;

  -- 2) 새 요청 발사 (헤더 도착까지의 TTFB 는 pg_net 이 안 주므로 ttfb_ms 는 null)
  insert into ops.site_probe_pending(request_id, url)
  select net.http_get(
           url := 'https://nuguzip.com/',
           headers := jsonb_build_object('user-agent', 'nuguzip-db-probe/1'),
           timeout_milliseconds := 30000
         ),
         'https://nuguzip.com/';
end;
$$;

revoke all on function ops.run_site_probe() from public, anon, authenticated;

select cron.schedule('site-probe-hourly', '30 * * * *', $$select ops.run_site_probe()$$);