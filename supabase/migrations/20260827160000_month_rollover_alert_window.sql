/*
  [F96] 월 롤오버 오경보 수리 — market_transactions.month_rollover

  증상: "ETL 조회 대상 월=202607 · 당월=202608 — 당월로 롤오버되지 않음" critical 이
  하루 20시간 넘게 매시간 떴다(7일간 26건, 마지막 08-27 09:30 KST).
  그런데 사실은 정상이었다:
    · market_transactions 의 202608 행 25,478건
    · molit 적재 로그 "아파트 매매·전월세 실거래 202608" 이 08-27 09:40 KST 에 ok

  원인: molit_target CTE 가 "최근 26시간 안의 molit 로그 중 **월 라벨 최댓값**"을
  본다. 당월(202608) 적재는 하루 한 번 09:40 경에 한 줄 남고, 같은 날 낮에는
  지난달(202607) 보정 적재가 따로 돈다. 09:40 로그가 26시간을 넘겨 창 밖으로
  나가는 다음 날 11:40 경부터는 창 안에 202607 만 남아 max = 202607 이 되고,
  체크는 "당월로 롤오버 안 됨"이라고 결론 냈다. 지난달 보정 적재는 정상 동작인데
  그걸 롤오버 실패로 읽은 것이다.

  왜 중요한가: critical 이 매시간 거짓으로 울리면 진짜 critical(지금은 vault
  cron_secret 미등록으로 멈춘 billing-renewals)이 같은 목록에 묻힌다.
  경보의 값어치는 "울렸을 때 진짜였던 비율"이다.

  수리: 창을 26시간 → 72시간으로 넓힌다. 당월 적재가 하루 한 번이므로 26시간은
  하루만 밀려도 창이 비는 폭이었다. 72시간이면 당월 로그가 항상 창 안에 있고,
  당월 적재가 정말로 3일 끊기면 그때는 제대로 critical 이 뜬다.
  "ETL 이 도는가"는 ingest.pass_cadence 가 따로 본다 — 이 체크는 "어느 달을
  겨냥하고 있는가"만 본다.

  방식: 함수 본문 13KB 를 통째로 다시 적지 않고, molit_target CTE 안의 그
  한 자리만 치환한다. interval '26 hours' 는 이 함수에 네 번 나오므로
  뒤따르는 fallback select 까지 포함한 유일 문자열을 앵커로 쓰고,
  일치가 정확히 1건이 아니면 예외를 던져 멈춘다(조용한 오치환 금지).

  적용 후 확인(2026-08-28 KST):
    select * from ops.etl_freshness() where check_name='market_transactions.month_rollover';
    → ok · "ETL 조회 대상 월=202608 · 당월=202608"
*/
do $$
declare
  def   text;
  needle text := 'and created_at > now() - interval ''26 hours''),
           (select max((regexp_match(dataset, ''([0-9]{6})[[:space:]]*$''))[1])';
  repl  text := 'and created_at > now() - interval ''72 hours''),
           (select max((regexp_match(dataset, ''([0-9]{6})[[:space:]]*$''))[1])';
  hits  int;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'ops' and p.proname = 'etl_freshness';
  if def is null then
    raise exception 'ops.etl_freshness 함수를 찾지 못했습니다';
  end if;

  hits := (length(def) - length(replace(def, needle, ''))) / length(needle);
  if hits = 0 then
    raise notice '이미 적용됨(앵커 없음) — 건너뜁니다';
    return;
  end if;
  if hits <> 1 then
    raise exception '앵커 일치 %건 — 1건이어야 합니다. 함수 본문이 바뀌었습니다.', hits;
  end if;

  execute replace(def, needle, repl);
end $$;
