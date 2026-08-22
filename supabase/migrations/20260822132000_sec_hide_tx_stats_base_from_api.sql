-- 개선 #43 (2026-08-22) — 집계 머티리얼라이즈드 뷰의 Data API 직노출 차단.
-- (MCP apply_migration 으로 적용됨 — 미러)
-- 진단(materialized_view_in_api): complex_tx_stats_base 가 anon/authenticated 로
-- REST 에서 직접 SELECT 가능했다. 앱은 이 물화뷰를 직접 읽지 않는다 —
-- 소비는 전부 SECURITY DEFINER RPC(map_complex_attrs 등)와 파생 뷰 경유라
-- (definer 는 소유자 권한으로 읽으므로) 직접 권한 회수로 깨지는 경로가 없다.
-- ※ vector·pg_net 확장의 public 스키마 상주(WARN 2건)는 타입 참조·내부 의존이
--   얽혀 있어 별도 점검 창에서 옮긴다(코드 스윕 필요) — 이 파일 범위 밖.
revoke select on public.complex_tx_stats_base from anon, authenticated;
