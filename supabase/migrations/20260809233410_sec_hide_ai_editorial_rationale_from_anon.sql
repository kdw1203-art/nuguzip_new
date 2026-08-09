-- AI 편집 판단 근거(ai_scores·ai_reason)가 익명에게 통째로 읽히고 있었다 — 닫는다.
-- 적용: 2026-08-09 23:34:10 UTC (MCP apply_migration 선적용 → 이 파일은 원장 미러.
-- 본문 md5 5cbbc4007e21951238e6d08b2a36847b, 4319 bytes — 복원 시 대조 완료)
--
-- ── 무엇이 새고 있었나 (적용 직전 실측) ─────────────────────────────────────
-- · board_posts.automation_meta(jsonb) 는 anon SELECT 대상 컬럼이고, 자동수집
--   뉴스 138행의 meta 안에 'ai_scores'(4개 점수)·'ai_reason'(선별 사유 문장)이
--   들어 있었다. publishable 키로 REST 에서 그대로 읽혔다(실측).
-- · news_articles 는 표 전체가 anon·authenticated SELECT + 정책 qual=true 로
--   열려 있었다. 이 표는 앱 코드가 한 줄도 읽지 않는 수집 아카이브다
--   (저장소 전수 grep 0건 — is_automated 노출분은 board_posts 로만 나간다).
--
-- ── 무엇을 했나 ─────────────────────────────────────────────────────────────
-- 1) news_articles 의 anon·authenticated SELECT 회수 + 죽은 정책 drop.
--    정책을 남겨 두면 나중에 SELECT 가 어떤 경로로든 재부여되는 순간 표 전체가
--    조용히 다시 열린다 — 죽은 정책은 가짜 안전망이다.
-- 2) board_posts.automation_meta 에서 두 키 제거(138행). 지우기 전에 재 봤다:
--    138행 전부 news_articles 에 external_key 로 값까지 동일하게 존재
--    (ai_reason 문자열 일치 138/138, 점수 4종 일치 138/138). 잃는 정보 없음.
-- 3) ingest_daily_news 교체 — meta 에 두 키를 더 쓰지 않는다. 점수·사유는
--    news_articles 컬럼으로만 저장(기존과 동일). 그 외 로직은 20260727081748
--    판과 같다. create or replace 는 기존 ACL 을 보존한다.
--
-- ── 같이 발견한 것 (이 파일은 안 고친다 — 소유자 확인 필요) ─────────────────
-- 자동화 RPC 3개의 anon EXECUTE 가 **또** 원장 밖에서 재부여돼 있었다.
-- 20260806182312 회수 이후의 원장 행 어디에도 grant 가 없는데 ACL 에
-- anon=X/postgres 가 다시 붙어 있다(3/3). 정황: 08-07 밤 수집이 1회 결번
-- (collected_date 08-08 없음), 08-08 부터 재개 — 그 사이 누군가 execute_sql
-- 또는 대시보드로 재부여한 것으로 보이나 원장에 없으니 지어내지 않는다.
-- 회수가 걸린 채로도 성공한 적재가 3회(08-03 23:51 · 08-04 23:32 · 08-06 23:41)
-- 있어 수집기의 키 종류가 확정되지 않는다. 세 번째 회수는 수집 경로 확인 후에.
--
-- ── 되돌리기 ────────────────────────────────────────────────────────────────
--   grant select on public.news_articles to anon, authenticated;
--   create policy news_articles_public_read on public.news_articles
--     for select to anon, authenticated using (true);
--   -- meta 의 두 키는 news_articles 에서 복사해 되살릴 수 있다(위 대조 근거).

revoke select on public.news_articles from anon, authenticated;
drop policy if exists news_articles_public_read on public.news_articles;

update public.board_posts
   set automation_meta = automation_meta - 'ai_scores' - 'ai_reason'
 where automation_meta ? 'ai_scores' or automation_meta ? 'ai_reason';

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
         'rank', (v_item->>'rank')::int
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
