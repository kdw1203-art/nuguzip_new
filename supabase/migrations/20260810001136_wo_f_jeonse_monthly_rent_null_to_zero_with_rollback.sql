-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260810001136,
-- name = wo_f_jeonse_monthly_rent_null_to_zero_with_rollback.
-- 아래 본문은 그 원장의 statements 원문 그대로다(md5 25913ae0af67881d030660850b74188c · 935b —
-- 원장 md5 와 바이트 단위 대조 완료). 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 2026-08-10 병렬 세션(소유자 승인 ops 작업)이 MCP 로 적용하고
-- 파일 미러링을 남기지 않았다. 같은 날 6건(20260810001136~20260810004552)을
-- 2026-08-11 에 한꺼번에 복원했다.
--
-- 되돌리기는 본문의 comment(ops.jeonse_null_to_zero_20260810 백업 표)에 적혀 있다. 단, 뒤이은 20260810002436 이 이 백업 표의 인덱스를 지웠다(표 자체는 남음).

-- WO-F: 전세 표기 일원화 (소유자 승인 2026-08-10)
-- 근거: NULL vs 0 은 의미 차이가 아니라 ETL 세대 차이.
--   created_at ≤ 2026-07-18 적재분은 전부 NULL, 2026-07-25 이후 적재분은 전부 0.
--   양 그룹 모두 deposit_krw 결측/0원 0건 — 의미상 동일한 '전세'.
--   잔존 NULL 24,182행은 202605~202607 구세대 잔재.
-- 롤백표를 남기고 NULL 행에만 적용한다.

create table if not exists ops.jeonse_null_to_zero_20260810 as
select id, monthly_rent_krw as old_value, now() as captured_at
from public.market_transactions
where transaction_type = 'rent' and monthly_rent_krw is null;

create index if not exists jeonse_null_to_zero_20260810_id_idx
  on ops.jeonse_null_to_zero_20260810 (id);

update public.market_transactions
set monthly_rent_krw = 0
where transaction_type = 'rent' and monthly_rent_krw is null;

comment on table ops.jeonse_null_to_zero_20260810 is
  'WO-F 롤백표. 되돌리려면: update public.market_transactions m set monthly_rent_krw = b.old_value from ops.jeonse_null_to_zero_20260810 b where m.id = b.id; — 드롭 금지.';
