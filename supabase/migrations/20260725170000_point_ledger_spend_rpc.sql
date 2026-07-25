-- 포인트 원자적 차감 RPC — point_ledger_spend
--
-- 배경: lib/points/ledger.ts spendPoints 가 "잔액 조회 → 차감 행 insert" 를
-- 두 번의 왕복으로 수행해, 동시 요청이 같은 잔액을 읽고 둘 다 차감에 성공하는
-- 경합(음수 잔액·이중 사용)이 가능했다. 이 함수는 잔액 검증과 차감 insert 를
-- 단일 트랜잭션 함수로 묶고, 사용자 단위 advisory lock 으로 직렬화한다.
--
-- - security definer + service_role 전용 (클라이언트 직접 호출 불가)
-- - 반환: jsonb { ok, spent, balance, reason }
--   · ok=false 사유: invalid | insufficient
-- - user_email 은 앱 코드(lib/points/ledger.ts)와 동일하게 전달값 그대로 비교한다
--   (원장 행이 세션 이메일 원문으로 적재되므로 여기서 임의 정규화하면 오히려 어긋난다).

create or replace function public.point_ledger_spend(
  p_user_email text,
  p_cost integer,
  p_reason text,
  p_ref_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_user_email is null or length(trim(p_user_email)) = 0
     or p_cost is null or p_cost <= 0
     or p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'spent', 0, 'balance', 0, 'reason', 'invalid');
  end if;

  -- 같은 사용자의 동시 차감을 트랜잭션 범위에서 직렬화 (경합 방지의 핵심)
  perform pg_advisory_xact_lock(hashtextextended('point_ledger:' || p_user_email, 0));

  select coalesce(balance, 0)
    into v_balance
    from public.point_ledger
   where user_email = p_user_email
   order by created_at desc
   limit 1;

  if v_balance is null then
    v_balance := 0;
  end if;

  if v_balance < p_cost then
    return jsonb_build_object('ok', false, 'spent', 0, 'balance', v_balance, 'reason', 'insufficient');
  end if;

  insert into public.point_ledger (user_email, delta, reason, ref_id, balance)
  values (p_user_email, -p_cost, p_reason, p_ref_id, v_balance - p_cost);

  return jsonb_build_object('ok', true, 'spent', p_cost, 'balance', v_balance - p_cost);
end;
$$;

-- service_role 전용 — 익명·인증 클라이언트에서 직접 호출 금지
revoke all on function public.point_ledger_spend(text, integer, text, text) from public;
revoke all on function public.point_ledger_spend(text, integer, text, text) from anon;
revoke all on function public.point_ledger_spend(text, integer, text, text) from authenticated;
grant execute on function public.point_ledger_spend(text, integer, text, text) to service_role;
