-- I1: 매물 소유확인 심사 큐 배선
-- 기존 owner_verifications 는 프로필 단위 소유확인만 상정해 매물 연결이 없었다.
-- 매물별 신청/심사를 기록하기 위해 listing_id · applicant_email 을 추가한다(가산만).
alter table public.owner_verifications
  add column if not exists listing_id uuid,
  add column if not exists applicant_email text not null default '';

-- 매물 소유확인은 세션 이메일로 접수되며, profiles 행이 없을 수 있어 user_id 를 선택값으로 완화.
alter table public.owner_verifications alter column user_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'owner_verifications_listing_id_fkey'
  ) then
    alter table public.owner_verifications
      add constraint owner_verifications_listing_id_fkey
      foreign key (listing_id) references public.listings(id) on delete cascade;
  end if;
end $$;

create index if not exists owner_verifications_status_created_idx
  on public.owner_verifications (status, created_at desc);
create index if not exists owner_verifications_listing_idx
  on public.owner_verifications (listing_id);
create index if not exists owner_verifications_applicant_idx
  on public.owner_verifications (applicant_email);

-- 같은 매물에 대한 미처리 신청은 1건만 — 중복 접수로 심사 큐가 부풀지 않게.
create unique index if not exists owner_verifications_pending_listing_uniq
  on public.owner_verifications (listing_id)
  where status = 'pending' and listing_id is not null;
