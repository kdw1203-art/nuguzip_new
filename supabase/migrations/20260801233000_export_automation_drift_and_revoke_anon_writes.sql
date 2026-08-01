-- 2026-08-01 감사 후속 두 가지.
--
-- (1) 스키마 드리프트 export — automation_secrets · automation_scripts ·
--     get_automation_script · ingest_daily_news 는 프로덕션에 직접 만들어져
--     supabase/migrations/ 어디에도 없었다(뉴스 수집 자동화가 쓰는 객체들).
--     프로덕션 정의를 그대로 옮겨 적어 저장소가 다시 진실이 되게 한다.
--     전부 idempotent 라 이미 있는 프로덕션에 적용해도 데이터 변화가 없다.
--
-- (2) anon·authenticated 쓰기 권한 회수 — web_vitals · push_subscriptions ·
--     geo_backlog_tmp · news_articles 4개 테이블은 RLS 가 켜져 있고 정책이
--     없어 오늘은 막혀 있지만, 테이블 권한(INSERT/UPDATE/DELETE/TRUNCATE)이
--     PUBLIC 기본값으로 살아 있었다. 훗날 관대한 정책 하나가 생기면 그대로
--     열린다. 코드 전수 확인 결과 네 테이블 모두 service_role 로만 읽고
--     쓴다(app/api/metrics/web-vitals · app/api/push/* · app/api/cron/* ·
--     lib/admin/stats.ts). 방어선을 두 겹으로 되돌린다.
--
-- 하지 않은 것: get_automation_script · ingest_daily_news 의 anon EXECUTE 는
-- 회수하지 않았다. 외부 뉴스 수집기는 p_secret(48자리 hex) 인증으로 이 RPC 를
-- 호출하는 구조라 anon 키로 부를 가능성이 높고, 회수하면 매일 08:00 뉴스
-- 적재가 끊긴다. 수집기가 실제로 어떤 키를 쓰는지는 소유자만 확인할 수 있다.

-- ── (1) 드리프트 export ────────────────────────────────────────────────

create table if not exists public.automation_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.automation_secrets enable row level security;
revoke all on public.automation_secrets from public, anon, authenticated;

create table if not exists public.automation_scripts (
  key text primary key,
  language text not null default 'python',
  body text not null,
  version integer not null default 1,
  note text,
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.automation_scripts enable row level security;
revoke all on public.automation_scripts from public, anon, authenticated;

create or replace function public.get_automation_script(p_secret text, p_key text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
  v_body text;
begin
  select value into v_secret from public.automation_secrets where key = 'news_ingest';
  if v_secret is null or p_secret is distinct from v_secret then
    raise exception 'unauthorized';
  end if;
  select body into v_body from public.automation_scripts where key = p_key;
  return v_body;
end;
$function$;

create or replace function public.ingest_daily_news(p_secret text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
  v_author uuid := '405510af-d53f-4e68-b750-946dff69a844';
  v_item jsonb;
  v_post_id uuid;
  v_date date;
  v_inserted int := 0;
  v_skipped int := 0;
  v_valid_regions text[] := array['서울','경기','인천','부산','대구','광주','대전','울산','세종',
                                  '강원','충북','충남','전북','전남','경북','경남','제주','수도권'];
  v_region text;
begin
  select value into v_secret from public.automation_secrets where key = 'news_ingest';
  if v_secret is null or p_secret is distinct from v_secret then
    raise exception 'unauthorized';
  end if;

  v_date := coalesce((p_payload->>'collected_date')::date,
                     (timezone('Asia/Seoul', now()))::date);

  for v_item in select * from jsonb_array_elements(p_payload->'articles') loop
    v_region := nullif(v_item->>'region', '');
    if v_region is not null and not (v_region = any(v_valid_regions)) then
      v_region := null;
    end if;

    v_post_id := null;

    insert into public.board_posts
      (author_id, board_type, category, region, title, content, tags, ai_summary,
       ai_keywords, image_url, source_url, source_name, source_published_at,
       external_key, is_automated, automation_meta, is_published)
    values
      (v_author, 'community', nullif(v_item->>'category',''), v_region,
       v_item->>'title',
       concat_ws(E'\n\n', v_item->>'summary', v_item->>'content',
                 '출처: ' || (v_item->>'source_name') || ' (' || (v_item->>'source_url') || ')'),
       coalesce(v_item->'tags', '[]'::jsonb),
       v_item->>'summary',
       coalesce(v_item->'tags', '[]'::jsonb),
       nullif(v_item->>'image_url',''), v_item->>'source_url', v_item->>'source_name',
       nullif(v_item->>'published_at','')::timestamptz,
       v_item->>'external_key', true,
       jsonb_build_object(
         'contentMode', 'news',
         'source_kind', 'breaking',
         'display_author', '누구집 뉴스봇',
         'viewCount', 0,
         'collector', 'cowork-daily-0800kst',
         'collected_at', p_payload->>'collected_at',
         'sourceDomain', v_item->>'source_domain',
         'thumbnailUrl', v_item->>'image_url',
         'imageUrl', v_item->>'image_url',
         'rank', (v_item->>'rank')::int,
         'ai_scores', v_item->'ai_scores',
         'ai_reason', v_item->>'ai_reason'
       ),
       true)
    on conflict (external_key) do nothing
    returning id into v_post_id;

    if v_post_id is null then
      v_skipped := v_skipped + 1;
      select id into v_post_id from public.board_posts
       where external_key = v_item->>'external_key';
    else
      v_inserted := v_inserted + 1;
    end if;

    insert into public.news_articles
      (collected_date, rank, title, summary, content, source_name, source_url,
       source_domain, image_url, published_at, category, region, tags,
       ai_interest_score, ai_importance_score, ai_traffic_score, ai_total_score,
       ai_reason, external_key, board_post_id, raw_meta)
    values
      (v_date, (v_item->>'rank')::int, v_item->>'title', v_item->>'summary',
       v_item->>'content', v_item->>'source_name', v_item->>'source_url',
       v_item->>'source_domain', nullif(v_item->>'image_url',''),
       nullif(v_item->>'published_at','')::timestamptz,
       nullif(v_item->>'category',''), v_region, coalesce(v_item->'tags','[]'::jsonb),
       (v_item->'ai_scores'->>'interest')::int,
       (v_item->'ai_scores'->>'importance')::int,
       (v_item->'ai_scores'->>'traffic')::int,
       (v_item->'ai_scores'->>'total')::int,
       v_item->>'ai_reason', v_item->>'external_key', v_post_id,
       coalesce(v_item->'raw_meta','{}'::jsonb))
    on conflict (external_key) do nothing;
  end loop;

  return jsonb_build_object('ok', true, 'collected_date', v_date,
                            'inserted', v_inserted, 'skipped_duplicate', v_skipped);
end;
$function$;

-- 함수 권한: 프로덕션과 동일하게 명시 (proacl: postgres·anon·authenticated·service_role)
grant execute on function public.get_automation_script(text, text) to anon, authenticated, service_role;
grant execute on function public.ingest_daily_news(text, jsonb) to anon, authenticated, service_role;

-- ── (2) 텔레메트리·구독 테이블의 anon·authenticated 쓰기 권한 회수 ─────

revoke insert, update, delete, truncate, references, trigger
  on public.web_vitals from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.push_subscriptions from anon, authenticated;
revoke all
  on public.geo_backlog_tmp from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.news_articles from anon, authenticated;
