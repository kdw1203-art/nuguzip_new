-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
-- 원장 version = 20260727080008, name = create_ingest_daily_news.
-- 아래 SQL 은 원장 statements 원문 그대로다(md5 36a01b645a9055cc0232640e3a145f47,
-- 4530 bytes — 복원 시 대조 완료). 내가 쓴 것은 이 머리말뿐이다.
--
-- 읽는 사람 주의: 파일 끝의 anon/authenticated GRANT 는 이후 회수와 재부여를
-- 오갔고(20260803221147 회수 → 20260804234917 복붙 재부여 → 20260806182312
-- 재회수), **최종 상태는 service_role 전용**이다. 이 파일이 열려 있다고 지금
-- 열려 있는 게 아니다.
-- 되돌리기: drop function public.ingest_daily_news(text, jsonb);
--           drop table public.automation_secrets;  -- 비밀 값이 지워진다. 주의.

create table if not exists public.automation_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.automation_secrets enable row level security;

insert into public.automation_secrets (key, value)
values ('news_ingest', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

create or replace function public.ingest_daily_news(p_secret text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
         'contentMode', 'news', 'source_kind', 'rss',
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
$fn$;

revoke all on function public.ingest_daily_news(text, jsonb) from public;
grant execute on function public.ingest_daily_news(text, jsonb) to anon, authenticated;
