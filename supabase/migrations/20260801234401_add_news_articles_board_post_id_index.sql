-- 성능 권고(unindexed_foreign_keys) 1건 해소 — news_articles.board_post_id FK.
-- board_posts 행 삭제/갱신 때 참조 검사가 news_articles 를 전량 스캔하던 것을 막는다.
-- (프로덕션에는 2026-08-01 MCP 마이그레이션으로 적용됨 — 이 파일은 저장소 기록.)
create index if not exists news_articles_board_post_id_idx
  on public.news_articles (board_post_id);
