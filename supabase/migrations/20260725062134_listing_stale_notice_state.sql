-- I10 — 매물 신선도 알림(끌어올리기 안내 · 마감 제안)의 발송 이력.
--
-- 원격 DB 에 이미 적용된 마이그레이션의 사본이다(supabase/migrations/README.md 규약).
-- version 20260725062134 = supabase_migrations.schema_migrations 의 값과 정확히 일치.
--
-- 현재 신선도는 화면 표시 전용이다. refreshed_at 이 21일(LISTING_STALE_DAYS)을
-- 넘기면 /listings/[id] 에 "확인 필요" 배지가 뜨고 소유자에게는 끌어올리기
-- 버튼이 보인다. 문제는 그 화면을 열어야만 보인다는 것이다. 중개사는 자기
-- 매물 상세를 매일 열지 않고 /my/listings 만 보는데, 거기엔 신선도 표시가
-- 아예 없다. 그래서 오래된 호가가 아무에게도 지적받지 않고 그대로 남는다.
--
-- 크론이 대신 알리려면 "이 매물에 대해 어느 단계까지 알렸는가"를 알아야 한다.
-- 그 상태가 없으면 크론이 도는 날마다 같은 매물로 같은 알림이 나간다.
--
-- stale_notice_stage: 0 = 아직 없음, 1 = 21일 끌어올리기 안내, 2 = 60일 마감 제안.
-- 단계가 올라갈 때만 새로 보내므로 매물 하나당 최대 2번이다. 소유자가
-- 끌어올리면(refreshed_at 갱신) 0 으로 되돌려 다음 주기를 새로 시작한다.
--
-- **자동 마감은 하지 않는다.** 남의 매물 상태를 시스템이 바꾸는 것과, 바꾸라고
-- 권하는 것은 다른 일이다. 갱신이 없다는 사실이 "거래가 끝났다"를 뜻하지는
-- 않는다 — 그냥 바쁜 중개사일 수도 있다. 이 마이그레이션은 후자(제안)만
-- 가능하게 한다. status 를 바꾸는 것은 끝까지 소유자의 클릭이다.
--
-- 파괴적이지 않다: 컬럼 2개 추가 + 부분 인덱스 1개뿐, 기존 행은 기본값으로 채워진다.

alter table public.listings
  add column if not exists stale_notified_at timestamptz,
  add column if not exists stale_notice_stage smallint not null default 0;

comment on column public.listings.stale_notified_at is
  'I10 — 신선도 알림을 마지막으로 보낸 시각. null 이면 아직 보낸 적 없음.';
comment on column public.listings.stale_notice_stage is
  'I10 — 보낸 신선도 알림 단계. 0=없음, 1=끌어올리기 안내(21일), 2=마감 제안(60일). 소유자가 끌어올리면 0 으로 초기화.';

-- 크론 스캔 경로 — 노출중·미숨김·미삭제 중 2단계까지 안 간 것만 본다.
-- 신선도 기준시각(refreshed_at 없으면 created_at)으로 정렬해 오래된 것부터 훑는다.
create index if not exists listings_stale_scan_idx
  on public.listings ((coalesce(refreshed_at, created_at)))
  where status = 'approved' and is_hidden = false and deleted_at is null and stale_notice_stage < 2;

-- 매물 신선도 알림 수신 설정. 기본 켜짐 — 광고가 아니라 "본인이 올린 본인 매물"의
-- 관리 안내라서, 다른 push_* 와 같은 규칙(끄면 크론이 후보에서 제외)을 따른다.
alter table public.notification_preferences
  add column if not exists push_listing_stale boolean not null default true;

comment on column public.notification_preferences.push_listing_stale is
  'I10 — 내 매물이 오래됐을 때 끌어올리기 안내·마감 제안 수신 여부. 기본 true.';
