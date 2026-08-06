-- reports.author_id — uuid 컬럼에 이메일을 넣고 있었다 (판매 등록 전면 실패)
--
-- 실측 (2026-08-06):
--   · public.reports.author_id 는 uuid, FK reports_author_id_fkey → expert_profiles(id)
--   · 그런데 lib/reports/store-db.ts createReport 는 여기에 **세션 이메일**을 넣는다.
--   · REST 로 그대로 재현했다:
--       GET /rest/v1/reports?select=id&author_id=eq.kdw1203%40gmail.com
--       → {"code":"22P02","message":"invalid input syntax for type uuid: \"kdw1203@gmail.com\""}
--   · 그래서 이 경로가 전부 죽어 있다 —
--       POST /api/creator/reports        → 500 (에러 문구가 그대로 사용자에게 나갔다)
--       GET  /api/creator/reports        → getCreatorSales 가 오류를 EMPTY 로 삼켜
--                                          대시보드는 영구히 "—"
--       PATCH/DELETE /api/reports/[id]   → 소유자 필터가 같은 오류라 404 "수정 실패"
--   · public.reports 0행 · public.expert_profiles 0행 — 성공한 적이 한 번도 없다.
--     0행은 "아직 아무도 안 팔았다"가 아니라 "팔 수 없었다"는 뜻이었다.
--
-- 같은 판정을 이미 한 번 했다. 20260727090500 이 report_purchases.payment_id 를
-- 같은 이유(코드가 uuid 아닌 값을 넣는다)로 uuid → text 로 바꿨다. 여기도 같다.
--
-- FK 도 함께 없앤다. lib/creator/gate.ts 의 크리에이터 요건은 "인증 전문가 **또는**
-- 공개 노트 1건 이상"이라, expert_profiles 행이 없는 사람도 리포트를 판다.
-- expert_profiles(id) 로 강제할 수 있는 관계가 아니었다 — 남겨 두면 타입만 맞추고
-- insert 는 23503 으로 죽는다.
--
-- 두 번째 문제: author_id 가 이제 이메일을 담는데, reports 는 reports_public_read
-- (PUBLIC · using true) 로 **아무나 전 컬럼을 읽을 수 있다.** 타입만 고치면 고친
-- 순간부터 크리에이터 이메일이 anon 키로 그대로 조회된다. 그래서 같은 마이그레이션에서
-- 컬럼 단위 GRANT 로 author_id 를 공개 범위에서 뺀다. 앱은 reports 를 전부
-- service-role 로만 읽으므로 화면에 영향이 없다 — 호출부 4개 전수 확인:
--   lib/reports/store-db.ts · lib/creator/sales.ts ·
--   lib/report-purchases/store-db.ts · lib/admin/stats.ts (넷 다 getServiceSupabase)
--
-- 컬럼 목록을 나열하는 GRANT 라, 앞으로 reports 에 컬럼을 추가하면 그 컬럼은
-- **기본적으로 공개되지 않는다.** 공개해야 하면 그 마이그레이션에서 명시적으로
-- grant select (새컬럼) 을 적어야 한다. 조용히 새 컬럼이 공개되는 것보다 이쪽이 낫다.
--
-- ── 이 변경이 실제로 깨는 것 (적용 후 실측) ──────────────────────────────
-- anon/authenticated 의 `select=*` 는 이제 **42501 permission denied** 다.
-- `*` 는 author_id 까지 펼쳐지는데 그 컬럼 권한이 없기 때문이다. 지금 저장소에는
-- publishable key 로 reports 를 읽는 코드가 없지만(위 4곳 전부 service-role),
-- 앞으로 클라이언트에서 읽는다면 컬럼을 명시해야 한다. 이건 숨은 함정이라
-- 여기 적어 둔다 — 가려진 한계는 없는 한계처럼 읽힌다.
--
-- ── 적용 후 검증 (2026-08-06, 실제 행 1건을 넣었다 지웠다) ────────────────
--   author_id 타입 text · FK 0개 · idx_reports_author_id 는 자동 재생성돼 유지
--   anon 컬럼 SELECT 20 / 전체 21 — author_id 만 빠짐
--   insert (author_id='kdw1203@gmail.com') → 성공
--   select ... where author_id = 'kdw1203@gmail.com' → 1행 (전에는 22P02)
--   anon select=id,title,author_label,region → 그 행이 정상 조회됨
--   anon select=...,author_id            → 42501
--   anon ?author_id=eq.<이메일>          → 42501  (필터로도 못 캔다)
--   anon ?order=author_id.asc            → 42501  (정렬로도 못 캔다)
--   검증 행 삭제 후 reports 0행
--
-- 되돌리기:
--   alter table public.reports alter column author_id type uuid
--     using nullif(author_id, '')::uuid;
--   alter table public.reports add constraint reports_author_id_fkey
--     foreign key (author_id) references public.expert_profiles(id) on delete set null;
--   grant select on public.reports to anon, authenticated;
--   (되돌릴 때 이메일이 든 행이 있으면 uuid 변환이 22P02 로 실패한다. 먼저 비워야 한다.)

alter table public.reports
  drop constraint if exists reports_author_id_fkey;

alter table public.reports
  alter column author_id type text using author_id::text;

comment on column public.reports.author_id is
  '작성자 이메일(소문자 정규화). uuid 가 아니다 — 20260727090500(payment_id)과 같은 이유로 text. PII 라 anon/authenticated 에는 컬럼 GRANT 를 주지 않는다.';

revoke select on public.reports from anon, authenticated;

grant select (
  id, title, subtitle, category, region, price, original_price, tags,
  table_of_contents, preview_content, rating, reviews, downloads, views,
  pages, is_premium, gradient, published_at, updated_at, author_label
) on public.reports to anon, authenticated;
