-- [개선 #21] 입주물량 자동 인제스트(청약홈 분양공고) 유일키.
-- 수동 업로드 행은 source_id NULL — NULLS DISTINCT 이므로 영향 없음.
alter table public.apartment_supply
  add column if not exists source_id text;

create unique index if not exists apartment_supply_source_sid_key
  on public.apartment_supply (source, source_id);

comment on column public.apartment_supply.source_id is
  '원천 식별자 — applyhome: HOUSE_MANAGE_NO. 수동 업로드는 NULL.';
