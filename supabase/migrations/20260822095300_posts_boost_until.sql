-- 포인트 사용처 확장: 동네이야기 추천글 부스트 (spend:post_boost_*)
-- posts.boost_until 이 미래면 피드에서 '추천글'로 상단 정렬·표시된다.
-- 만료는 별도 잡 없이 자연 소멸(값이 과거면 비활성) — listings.boost_until 과 같은 규칙.
alter table public.posts add column if not exists boost_until timestamptz;
comment on column public.posts.boost_until is '포인트 추천글 부스트 만료 시각 — null 또는 과거면 비활성 (spend:post_boost_*)';
create index if not exists posts_boost_until_idx on public.posts (boost_until) where boost_until is not null;
