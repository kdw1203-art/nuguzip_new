-- [953] 전문가 후기·평점 + 견적 제안 영속화
--
-- 1) public.expert_reviews — 답변이 완료된 상담(expert_consultations.replied_at)에
--    의뢰자가 한 번만 남기는 별점(1~5)·한 줄 후기. 집계(평균·건수)는 앱이
--    expert_profiles.rating / reviews 에 써 넣는다(두 컬럼은 여태 아무도 쓰지 않는
--    상수 0 이었다). 후기 없는 전문가는 "평가 없음"으로 그린다(0.0 아님).
-- 2) market_request_proposals — 전문가 제안이 알림으로만 나가고 행이 남지 않던 것을
--    고친다. 제안한 전문가(expert_id)와 표시명을 함께 저장해 의뢰자 화면에서
--    프로필로 이어 준다. (request_id, proposer_email) 유니크 — 같은 요청에 중복 제안 방지.
--
-- 권한: 서비스 롤 전용(deny-all RLS). anon/authenticated 는 명시적으로 revoke —
-- 프로젝트 원칙(권한 GRANT 금지·revoke 만).

create table if not exists public.expert_reviews (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid not null references public.expert_profiles(id) on delete cascade,
  consultation_id uuid not null references public.expert_consultations(id) on delete cascade,
  reviewer_email text not null,
  reviewer_label text,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consultation_id)
);
comment on table public.expert_reviews is
  '전문가 상담 후기 — 답변 완료 상담당 1건, 의뢰자만 작성. 집계는 expert_profiles.rating/reviews';
create index if not exists expert_reviews_expert_created_idx
  on public.expert_reviews (expert_id, created_at desc);

alter table public.expert_reviews enable row level security;
revoke all on public.expert_reviews from anon, authenticated;

alter table public.market_request_proposals
  add column if not exists expert_id uuid references public.expert_profiles(id) on delete set null,
  add column if not exists expert_label text;
create unique index if not exists market_request_proposals_request_proposer_uq
  on public.market_request_proposals (request_id, proposer_email);
create index if not exists market_request_proposals_request_idx
  on public.market_request_proposals (request_id, created_at desc);
revoke all on public.market_request_proposals from anon, authenticated;
