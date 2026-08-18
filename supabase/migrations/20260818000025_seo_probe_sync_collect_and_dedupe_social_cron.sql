-- 헬스 경보 수리 (2026-08-18, 소유자 인박스 경보 대응)
--
-- 1) seo-asset 프로브 오탐 수리 — "발사→다음날 수거" 설계가 pg_net 응답
--    TTL(수 시간)과 어긋나, 하루 뒤 수거 시점엔 응답이 이미 삭제돼 4개 자산
--    전부 "무응답(유실)"로 기록됐다 (2026-08-17 21:35 오탐 4건 — 실측은 전부
--    200, 같은 날 23:58 수동 수거로 확인). 발사→대기(최대 30초)→수거를 한
--    실행으로 합친다. pg_net 응답은 보통 수 초 내 도착하므로 TTL 과 무관해진다.
--
-- 2) 레거시 소셜 pg_cron 잡 해제 — social-autopost/social-upload-drain 은
--    Vercel 크론으로 이관 완료(2026-08-16). pg_cron 판은 vault cron_secret
--    미등록이라 현재 무동작이지만, 나중에 시크릿이 등록되는 순간(빌링 개방)
--    Vercel 판과 이중 발사되는 잠복 결함이라 지금 제거한다.

create or replace function ops.run_seo_asset_probe()
 returns integer
 language plpgsql
 security definer
 set search_path to 'ops', 'net', 'public', 'pg_catalog'
as $function$
declare
  targets text[] := array[
    'https://nuguzip.com/robots.txt',
    'https://nuguzip.com/llms.txt',
    'https://nuguzip.com/sitemap.xml',
    'https://nuguzip.com/sitemap-complexes.xml'
  ];
  t text;
  rid bigint;
  p record;
  r record;
  collected int := 0;
  n_loc int;
  tries int := 0;
begin
  -- 0) 옛 설계가 남긴 잔여 pending 정리: 응답이 아직 있으면 수거하고, 없으면
  --    "유실" 행을 만들지 않고 버린다 — 설계 결함의 흔적이 오탐 데이터가 되면
  --    안 된다 (2026-08-17 오탐 4건의 재발 방지).
  for p in select * from ops.seo_asset_probe_pending loop
    select status_code, timed_out, error_msg, content
      into r from net._http_response where id = p.request_id;
    if found then
      n_loc := case when p.url like '%sitemap%' and r.content is not null
                    then (length(r.content) - length(replace(r.content, '<loc>', ''))) / 5
                    else null end;
      insert into ops.seo_asset_probe(url, http_status, bytes, loc_count, note)
      values (p.url, r.status_code, coalesce(length(r.content), 0), n_loc,
              case when r.timed_out then '타임아웃'
                   when r.error_msg is not null then left(r.error_msg, 200)
                   else 'pg_net seo-probe' end);
      collected := collected + 1;
    end if;
    delete from ops.seo_asset_probe_pending where request_id = p.request_id;
  end loop;

  -- 1) 발사
  foreach t in array targets loop
    rid := net.http_get(url := t, timeout_milliseconds := 20000);
    insert into ops.seo_asset_probe_pending(request_id, url, requested_at)
    values (rid, t, now());
  end loop;

  -- 2) 같은 실행 안에서 수거 — 3초 간격 최대 10회(30초)
  while tries < 10 loop
    perform pg_sleep(3);
    for p in select * from ops.seo_asset_probe_pending loop
      select status_code, timed_out, error_msg, content
        into r from net._http_response where id = p.request_id;
      if found then
        n_loc := case when p.url like '%sitemap%' and r.content is not null
                      then (length(r.content) - length(replace(r.content, '<loc>', ''))) / 5
                      else null end;
        insert into ops.seo_asset_probe(url, http_status, bytes, loc_count, note)
        values (p.url, r.status_code, coalesce(length(r.content), 0), n_loc,
                case when r.timed_out then '타임아웃'
                     when r.error_msg is not null then left(r.error_msg, 200)
                     else 'pg_net seo-probe' end);
        delete from ops.seo_asset_probe_pending where request_id = p.request_id;
        collected := collected + 1;
      end if;
    end loop;
    exit when not exists (select 1 from ops.seo_asset_probe_pending);
    tries := tries + 1;
  end loop;

  -- 3) 30초 내 미응답 = 진짜 이상 — 이제는 실측 실패로 기록해도 오탐이 아니다
  for p in select * from ops.seo_asset_probe_pending loop
    insert into ops.seo_asset_probe(url, http_status, bytes, loc_count, note)
    values (p.url, null, null, null, '30초 내 응답 없음');
    delete from ops.seo_asset_probe_pending where request_id = p.request_id;
  end loop;

  return collected;
end;
$function$;

-- 레거시 소셜 pg_cron 잡 해제 (이중 발사 잠복 결함 제거)
select cron.unschedule(jobid) from cron.job
 where jobname in ('social-autopost', 'social-upload-drain');