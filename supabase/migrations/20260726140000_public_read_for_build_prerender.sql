-- 빌드 프리렌더가 읽을 수 있게 공개 집계에 anon SELECT 를 연다 (추가 전용 — 지우는 것 없음).
--
-- ── 무슨 일이 있었나 (실측) ────────────────────────────────────────────────
-- 운영 https://nuguzip.com/complex/compare 가 이렇게 렌더되고 있었다:
--
--   "비교 조합 목록을 불러오지 못했습니다.
--    비교할 단지가 없다는 뜻이 아니라 조회 자체가 실패했다는 뜻입니다."
--
-- 그런데 DB 는 멀쩡했다:
--
--   set local role service_role;
--   select count(*) from public.complex_pair_source;   → 669
--
-- 같은 2시간 구간의 Vercel 런타임 로그에도 complex_pair_source 오류가 한 줄도
-- 없었다. 즉 **런타임이 실패한 게 아니라 실패가 이미 HTML 에 굳어 있었다**.
--
-- /complex/compare 는 `revalidate = 3600` 이라 배포 산출물에 프리렌더된다.
-- 프로덕션 빌드는 GitHub Actions 의 `vercel build --prod` 가 돌리는데, 그 환경에
-- Service Role 키가 없다. lib/market/complex-pairs.ts 는 getServiceSupabase() 를
-- 쓰므로 클라이언트가 null 이 되고, 로더가 던지고, 페이지가 그 실패 상태를 그대로
-- 구워 낸다. 그 HTML 이 다음 재검증(최대 1시간)까지 모든 방문자와 크롤러에게 나간다.
--
-- ── 이건 처음이 아니다 ────────────────────────────────────────────────────
-- lib/market/tx-bands.ts 의 주석에 같은 사고가 이미 두 번 기록돼 있다. 거기서 얻은
-- 결론이 getReadOnlySupabase() — Service Role 이 있으면 그대로 쓰고(운영 런타임
-- 동작 불변) 없을 때만 publishable 키로 폴백한다. N10(단지 비교)과 N11(시장 온도)을
-- 만들면서 그 교훈을 적용하지 않았다. 이 마이그레이션이 폴백이 실제로 읽을 수 있도록
-- 권한 쪽을 맞추고, 코드 쪽은 같은 커밋에서 getReadOnlySupabase() 로 바꾼다.
--
-- ── 왜 anon 에 여는 것이 안전한가 ─────────────────────────────────────────
-- 두 대상 모두 **이미 공개 페이지에 그대로 렌더되는 집계**다. 새로 열어 주는 정보가
-- 아니라, 빌드가 자기가 인쇄할 내용을 미리 읽게 하는 것뿐이다.
--
--   * complex_pair_mv — 국토교통부 실거래 신고 건수의 단지쌍 집계. 원본
--     market_transactions 에는 이미 `market_transactions_public_read`(SELECT,
--     qual=true) 정책이 있어 anon 이 **행 단위로** 읽을 수 있다. 그 집계를 못 읽게
--     막아 둘 이유가 없다(오히려 집계 쪽이 노출이 더 좁다).
--   * market_temperature_snapshot — 0~100 점수와 그 계산에 들어간 값들. 점수는
--     /analysis/temperature 에 그대로 찍히고, 계산식은 /methodology 에 공개돼 있다.
--
-- 개인정보·사용자 데이터는 여기에 없다. 두 대상 다 ETL 이 만든 파생 집계다.
--
-- ── 성능 (anon statement_timeout = 3s) ────────────────────────────────────
-- complex_pair_mv 는 669행, market_temperature_snapshot 은 지역 62 × 주 단위라
-- 1년 뒤에도 3,224행이다. 둘 다 이미 계산이 끝난 저장 객체이므로 3초 예산과는
-- 무관하다. (/tx 때 anon 이 죽었던 건 뷰가 매 요청 68,126행을 seq scan 하며
--  percentile_cont 를 다시 계산했기 때문이고, 그건 MV 로 내려서 해결했다.)

-- ── 1) N10 단지 비교 ──────────────────────────────────────────────────────
-- public.complex_pair_source 는 security_invoker = on 이다. 그래서 바깥 뷰에만
-- GRANT 를 주면 아무 소용이 없고, **호출 롤이 MV 자체에** SELECT 를 들고 있어야
-- 한다. 20260726061500 이 같은 함정에 빠졌던 기록을 참고. 둘 다 준다.
grant select on market_agg.complex_pair_mv to anon, authenticated;
grant select on public.complex_pair_source to anon, authenticated;

-- ── 2) N11 시장 온도 주간 아카이브 ────────────────────────────────────────
-- 이 표는 RLS 가 켜져 있고 정책이 하나도 없다. GRANT 만 주면 anon 은 권한은 있는데
-- 보이는 행이 0개인 상태가 된다 — "조회 실패"가 아니라 "기록 없음"으로 읽히는,
-- 이 서비스에서 가장 피하고 싶은 종류의 거짓말이다. 그래서 GRANT 와 정책을 함께 둔다.
grant select on public.market_temperature_snapshot to anon, authenticated;

-- 읽기 정책만 만든다. insert/update/delete 정책은 두지 않으므로 RLS 가 켜진 이상
-- 쓰기는 정책을 우회하는 service_role 로만 가능하다(크론이 그 경로를 쓴다).
drop policy if exists market_temperature_snapshot_public_read
  on public.market_temperature_snapshot;
create policy market_temperature_snapshot_public_read
  on public.market_temperature_snapshot
  for select
  to anon, authenticated
  using (true);

comment on policy market_temperature_snapshot_public_read
  on public.market_temperature_snapshot is
  '공개 집계 — /analysis/temperature 에 그대로 렌더되는 값이다. 빌드 프리렌더가 '
  'publishable 키로 읽을 수 있어야 배포 직후 1시간 동안 "불러오지 못했습니다" 가 '
  '굳지 않는다. 쓰기 정책은 없다(크론의 service_role 만 쓴다).';
