-- inspection_notes.author_email 을 anon/authenticated 가 읽지 못하게 한다.
-- 적용: 2026-08-06 16:38:53 UTC (원격 선적용 → 이 파일은 원장 미러)
--
-- ── 무엇이 새고 있었나 (실측) ───────────────────────────────────────────────
-- 브라우저 번들에 그대로 실려 나가는 publishable 키로
--   GET /rest/v1/inspection_notes?select=author_email&is_public=eq.true
-- 를 치면 HTTP 200 에 8행 전부가 주인 이메일을 **그대로** 돌려줬다.
--
-- 지난 커밋에서 같은 결함을 `/api/inspection/notes` 응답에서 지웠다. 그런데
-- 그건 앱의 문 하나를 잠근 것이지 유일한 문을 잠근 게 아니었다. PostgREST 는
-- 별개의 문이고, 열려 있었다.
--   → API 한쪽 문만 잠그면 REST 문은 열린 채다.
--
-- RLS 는 **행**만 막는다. 컬럼은 GRANT 만이 막는다. inspection_notes 의
-- anon SELECT 정책(is_public + slug/published_at)은 정상 동작하고 있었고,
-- 그 정책이 통과시킨 행의 **모든 컬럼**이 따라 나가고 있었을 뿐이다.
--
-- ── 왜 표 단위 회수 + 컬럼 단위 재부여인가 (reports 선례와 동일) ────────────
-- `revoke select (author_email)` 만으로는 표 단위 GRANT 가 남아 있어 소용없다.
-- 표 단위를 회수하고 나머지 54개만 다시 준다. 부수 효과 둘 다 의도한 것:
--   1) 앞으로 추가되는 컬럼은 **기본이 비공개**다. 보이려면 명시적으로 줘야 한다.
--   2) anon 의 `select=*` 는 컬럼을 조용히 빼 주는 게 아니라 **표 통째로
--      42501** 이 된다. 그래서 같은 커밋에서 lib/inspection/store-db.ts 의
--      listPublicNotes 가 `select("*")` → 명시 23컬럼으로 바뀌었다.
--      (그 함수는 서비스 롤이 없으면 anon 으로 떨어진다. `*` 를 두면 그 경로에서
--       공개 노트 목록이 통째로 죽는다 — 조용히가 아니라 아예.)
--
-- ── 정책 표현식은 영향받지 않는다 (짐작이 아니라 실측) ──────────────────────
-- inspection_notes_select_authed / _update_authed / _delete_authed 는 USING 절에
-- author_email 을 참조한다. 회수하면 깨지는 것 아닌가? 임시 표로 재 봤다:
--   A. 정책이 revoke 된 컬럼을 참조 + 허용 컬럼만 조회  → 통과 (행 보임)
--   B. revoke 된 컬럼을 직접 조회                        → 42501
--   C. revoke 된 컬럼을 WHERE 에 사용                    → 42501
-- 즉 정책 표현식은 실행기가 내부적으로 평가하므로 호출 역할의 컬럼 권한을
-- 요구하지 않는다. B·C 만 막힌다 — 정확히 막고 싶던 것이다.
--
-- ── 적용 후 실측 (live anon REST, publishable 키) ───────────────────────────
--   select=author_email                 → 42501 permission denied
--   select=*                            → 42501 permission denied
--   author_email=eq.…  (WHERE)          → 42501 permission denied
--   order=author_email                  → 42501 permission denied
--   select=id,title,author_label        → 200, 실제 행 반환 (계속 보여야 하는 것)
--   [양성 대조] board_posts?select=id    → 200, 실제 행 (키가 살아 있다는 증거)
--   [음성 대조] reports?select=author_id → 42501 (지난 커밋에서 막은 것)
-- 컬럼 집합은 눈으로 안 맞추고 집합 차로 확인했다: 기대 54 / 부여 54 /
-- 누락 없음 / 초과 없음.
--
-- ── 전수 훑기 (같은 결함이 다른 데 또 있나) ─────────────────────────────────
-- anon 역할이 **실제로 되어서**(set local role anon) 권한과 RLS 를 둘 다 진짜로
-- 태우고, anon 이 SELECT 할 수 있는 text 컬럼 471개 / 82개 표를 훑었다.
-- 행이 있는 표 33개 · 795,208행 전수 → 이메일 모양 값 **0건**.
-- 0건이 기계가 죽어서 나온 게 아니라는 증거로, 같은 기계를 권한만 무시하고
-- inspection_notes.author_email 에 대 봤더니 8건을 잡았다.
--   → 0행짜리 표에 대고 [] 를 읽는 건 아무것도 재지 않은 것이다.
--
-- ── 되돌리기 ────────────────────────────────────────────────────────────────
--   grant select on table public.inspection_notes to anon, authenticated;
--   -- 표 단위 GRANT 가 컬럼 단위를 흡수하므로 이 한 줄이면 원상 복구된다.
--   -- 단, 되돌리면 이메일이 다시 공개된다. store-db.ts 도 같이 되돌릴 것.

revoke select on table public.inspection_notes from anon, authenticated;

grant select (
  id, author_label, title, region, apt_name, visit_date, weather, transportation,
  summary, score_location, score_school, score_transport, score_facility, score_future,
  checklist, sections, photos, ai_analysis, is_public, created_at, updated_at, slug,
  body_md, author_type, metadata, intent, user_id, property_name, budget_label, tags,
  photo_notes, voice_notes, check_items, risk_notes, verdict, status,
  analysis_requested_at, analyzed_at, published_at, public_summary, public_risks,
  cover_image_url, visit_at, address_road, address_jibun, latitude, longitude,
  bjd_code, sido, sigungu, dong, persona, analysis_content_hash, check_detail
) on public.inspection_notes to anon, authenticated;
