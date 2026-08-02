-- 포인트 원자적 적립 RPC — point_ledger_award
--
-- 배경: 20260725170000 에서 차감(point_ledger_spend)만 직렬화했다. 적립은
-- lib/points/ledger.ts awardPoints 가 "잔액 조회 → 적립 행 insert" 로 두 왕복을
-- 그대로 두고 있어서, 같은 사용자의 적립과 차감이 겹치면 나중에 쓰는 쪽이
-- 앞선 쪽의 결과를 통째로 덮는다(point_ledger 는 행마다 러닝 잔액을 들고 있어
-- 마지막 행의 balance 가 곧 잔액이다). 즉 적립 한 번이 동시에 일어난 차감을
-- 지워 포인트를 공짜로 되돌릴 수 있었다. spend 와 같은 자물쇠를 award 에도 건다.
--
-- - advisory lock 키는 spend 와 **반드시 동일해야** 한다('point_ledger:' || email).
--   키가 다르면 서로를 막지 못해 자물쇠가 있으나 마나다.
-- - security definer + service_role 전용 (클라이언트 직접 호출 불가)
-- - 반환: jsonb { ok, awarded, balance, reason }
--   · ok=false 사유: invalid
-- - user_email 은 앱 코드와 동일하게 전달값 그대로 비교한다(정규화하지 않는다).

create or replace function public.point_ledger_award(
  p_user_email text,
  p_amount integer,
  p_reason text,
  p_ref_id text default null,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_user_email is null or length(trim(p_user_email)) = 0
     or p_amount is null or p_amount <= 0
     or p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'awarded', 0, 'balance', 0, 'reason', 'invalid');
  end if;

  -- 같은 사용자의 적립·차감을 트랜잭션 범위에서 직렬화 (point_ledger_spend 와 같은 키)
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

  insert into public.point_ledger (user_email, delta, reason, ref_id, balance, expires_at)
  values (p_user_email, p_amount, p_reason, p_ref_id, v_balance + p_amount, p_expires_at);

  return jsonb_build_object('ok', true, 'awarded', p_amount, 'balance', v_balance + p_amount);
end;
$$;

-- service_role 전용 — 익명·인증 클라이언트에서 직접 호출 금지.
-- `from public` 을 빠뜨리면 PostgreSQL 이 함수 생성 시 기본으로 주는
-- GRANT EXECUTE TO PUBLIC 이 그대로 남고, anon 은 PUBLIC 의 구성원이므로
-- anon/authenticated 에서만 회수해 봐야 아무것도 회수되지 않는다.
revoke all on function public.point_ledger_award(text, integer, text, text, timestamptz) from public;
revoke all on function public.point_ledger_award(text, integer, text, text, timestamptz) from anon;
revoke all on function public.point_ledger_award(text, integer, text, text, timestamptz) from authenticated;
grant execute on function public.point_ledger_award(text, integer, text, text, timestamptz) to service_role;
