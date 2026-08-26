-- 일일 집계 크론이 멈춘 원인 수리. (서버 반영 완료 · 이 파일은 기록)
--
-- 실측(2026-08-26):
--   · market-aggregates-daily(jobid 12) 08-26 04:00 statement timeout(900s) 실패,
--     마지막 성공 08-25 04:12 이후 회복 없음 → "중단 상태" critical.
--   · refresh_market_region_monthly(3) = 12.8초 / 1,605행
--     같은 함수 기본값 25개월 = 900초 초과로 취소.
--   · 개월 수는 8배인데 시간은 70배 넘게 든다 — 선형이 아니다. withprev 가 agg
--     CTE 를 자기 자신과 조인해 해시 빌드가 커지고 디스크로 넘친다. 술어를
--     받쳐 주는 인덱스도 없어 1.17GB 표를 매번 순차 스캔한다.
--
-- 25개월을 매일 다시 만들 이유가 없다. 실제로 바뀌는 건 최근 몇 달뿐이다
-- (국토부 신고 지연 30~60일). 옛 달은 해제 신고로만 바뀌고, 그건 하루 늦어도 된다.
--   · 매일 : 최근 4개월(현재월 + 직전 3개월) — withprev 가 직전 달을 필요로 하므로
--            4개월을 읽어야 최근 3개월 변동률이 정확하다.
--   · 매주 : 25개월 전체 — 해제 신고 소급 반영.
--
-- 결과(실측): 전체 집계 900초 타임아웃 → **81.7초 성공**.
--   단계별 ms: tx_band_landing 15197 · complex_sitemap 20319 · map_price_point 14096
--   · complex_pair 8132 · complex_tx_stats_base 6559 · lawd_region_map 5887
--   · market_region_monthly 5513 (이 단계가 예전엔 700초 넘게 걸리던 자리다)
--
-- 인덱스를 새로 만들지 않은 이유: market_transactions 에 이미 12개·약 380MB 가
-- 붙어 있어 쓰기 증폭이 크다. 주 1회 도는 전체 재구축 하나를 위해 더 얹는 것보다
-- 그 잡에 시간을 주는 편이 싸다.
--
-- 함수 본문은 기본값(p_months 25 → 4)과 metadata 의 window_months 외에는 이전과 같다.
-- 전문은 배포된 정의를 따른다(이 파일은 변경 사유 기록용).

-- 매주 일요일 03:20 UTC(12:20 KST) — 다른 무거운 잡(19:00~20:10 UTC)과 겹치지 않는다.
select cron.unschedule('market-region-monthly-full')
where exists (select 1 from cron.job where jobname = 'market-region-monthly-full');

select cron.schedule(
  'market-region-monthly-full',
  '20 3 * * 0',
  $$ set local statement_timeout = '1800s'; select public.refresh_market_region_monthly(25); $$
);
