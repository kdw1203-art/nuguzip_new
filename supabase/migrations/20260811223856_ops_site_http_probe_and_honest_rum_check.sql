-- 2026-08-12: site.rum_heartbeat 은 구조적으로 작동 불가(측정: 28일 중 10개 72시간 창이 0건,
-- 일 중앙값 172건, 12h 중앙값 144 < 코드상 하한 200 → 항상 'unknown' 으로 침묵).
-- RUM 으로는 사이트 다운을 판정할 수 없음이 데이터로 확정되어, 가짜 커버리지를 제거하고
-- 실제 HTTP 프로브 이력을 남기는 경로로 대체한다.

create table if not exists ops.site_probe (
  id           bigserial primary key,
  probed_at    timestamptz not null default now(),
  url          text        not null,
  http_status  int,
  ttfb_ms      numeric,
  vercel_error text,
  note         text
);
create index if not exists site_probe_probed_at_idx on ops.site_probe (probed_at desc);

comment on table ops.site_probe is
  '외부(예약 잡)에서 수행한 nuguzip.com HTTP 프로브 결과. DB 에 pg_net 이 없어 아웃바운드 HTTP 불가 → 프로브는 외부에서 기록한다.';

create or replace function ops.record_site_probe(
  p_url text, p_status int, p_ttfb_ms numeric default null,
  p_vercel_error text default null, p_note text default null)
returns bigint
language sql
security definer
set search_path to 'ops','pg_catalog'
as $$
  insert into ops.site_probe(url, http_status, ttfb_ms, vercel_error, note)
  values (p_url, p_status, p_ttfb_ms, p_vercel_error, p_note)
  returning id;
$$;

revoke all on function ops.record_site_probe(text,int,numeric,text,text) from public, anon, authenticated;