-- 2026-08-12: ops.record_site_probe 의 public 래퍼 — 서비스롤 전용.
-- ops 스키마는 PostgREST 에 노출돼 있지 않아 앱(서비스롤 클라이언트)이 RPC 를 직접
-- 못 부른다. site.http_probe 신선도 검사(20260811223945)가 요구하는 "예약 잡이
-- 프로브를 기록"하는 경로를 앱 크론 라우트로 만들기 위해 public 래퍼를 둔다.
-- EXECUTE 는 service_role 에만 — anon/authenticated 가 가짜 프로브를 심으면
-- 다운 감지가 침묵한다(사실 우선: 기록 경로는 신뢰 경계 안에만).
-- 롤백: drop function public.record_site_probe_service(text,int,numeric,text,text);
create or replace function public.record_site_probe_service(
  p_url text, p_status int, p_ttfb_ms numeric default null,
  p_vercel_error text default null, p_note text default null)
returns bigint
language sql
security definer
set search_path to 'ops','pg_catalog'
as $$
  select ops.record_site_probe(p_url, p_status, p_ttfb_ms, p_vercel_error, p_note);
$$;

revoke all on function public.record_site_probe_service(text,int,numeric,text,text) from public, anon, authenticated;
grant execute on function public.record_site_probe_service(text,int,numeric,text,text) to service_role;