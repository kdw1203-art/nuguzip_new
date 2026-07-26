-- market_transactions.raw 통계 수집 중단 (ANALYZE CPU 고갈 해소)
--
-- 왜 필요한가 (2026-07-26 실측):
--   autovacuum 의 ANALYZE public.market_transactions 가 표본 30,000/30,000 을
--   다 읽고도 `computing statistics` 단계에서 8,600초(2시간 24분) 넘게
--   state=active, wait_event_type=null 로 CPU 만 태우고 있었다.
--   그 사이 다른 백엔드가 스케줄에서 밀려나, 캐시에 100% 올라온
--   43 buffer(shared hit, 디스크 읽기 0)짜리 질의가 한 번은 3,687ms,
--   다음 번은 77ms 가 걸렸다(같은 질의·같은 플랜). select 1 은 0.093ms.
--   → I/O 문제도 인덱스 문제도 아니고 CPU 경합이다.
--
-- 무엇이 CPU 를 태우는가:
--   컬럼별 평균 폭을 보면 raw(jsonb) 가 avg_width 570 으로 압도적이다.
--   (다음이 external_key 50, address 28, complex_name 22, 나머지는 전부 16 이하)
--   ANALYZE 의 computing statistics 단계는 표본값을 정렬·비교해
--   MCV·히스토그램·n_distinct 를 만든다. 570바이트 jsonb 30,000개를
--   기본 통계 목표(100)로 정렬하는 비용이 이 표 전체 통계 비용을 지배한다.
--
-- 왜 통계를 꺼도 안전한가:
--   raw 를 조건으로 거르는 실행 경로가 없다. 코드 전수 확인 결과
--   raw 를 참조하는 SQL 은 20260725042611 의 1회성 백필
--   (`raw ->> 'cdealType' = 'O'` → is_cancelled 채우기) 뿐이고,
--   그 결과는 이미 is_cancelled 컬럼과 인덱스로 물질화되어 있다.
--   런타임 질의·뷰·인덱스 어디에도 raw predicate 가 없으므로
--   플래너가 raw 통계를 볼 일이 없다. 즉 회귀 위험 0.
--
-- 되돌리기: ALTER COLUMN raw SET STATISTICS -1; (기본값으로 복귀)
-- 파괴적 변경 아님 — 컬럼·데이터는 그대로다. 통계 수집 대상에서만 뺀다.

alter table public.market_transactions
  alter column raw set statistics 0;

comment on column public.market_transactions.raw is
  '원본 API 응답(jsonb). 조회 조건으로 쓰지 않는다 — 감사/재처리용 보존 필드. '
  'ANALYZE CPU 고갈 때문에 통계 목표를 0 으로 두었다(20260726160000).';
