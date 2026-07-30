/* 매물 상세 필터용 컬럼 — 유형·방·화장실·주차.
   기존 행은 NULL (필터 적용 시 "값 있는 매물만" 표시).
   국토부 실거래에는 해당 필드가 없어 listings 전용이다. */

alter table public.listings
  add column if not exists property_kind text,
  add column if not exists rooms smallint,
  add column if not exists bathrooms smallint,
  add column if not exists parking_spaces smallint;

comment on column public.listings.property_kind is
  'apartment|villa|detached|officetel|commercial|other';
comment on column public.listings.rooms is
  '방 개수 1~7 (null=미입력)';
comment on column public.listings.bathrooms is
  '화장실 개수 0~5 (null=미입력)';
comment on column public.listings.parking_spaces is
  '주차 가능 대수 0~10 (null=미입력)';

alter table public.listings
  drop constraint if exists listings_property_kind_check;
alter table public.listings
  add constraint listings_property_kind_check
  check (
    property_kind is null
    or property_kind in (
      'apartment',
      'villa',
      'detached',
      'officetel',
      'commercial',
      'other'
    )
  );

alter table public.listings
  drop constraint if exists listings_rooms_check;
alter table public.listings
  add constraint listings_rooms_check
  check (rooms is null or (rooms >= 1 and rooms <= 7));

alter table public.listings
  drop constraint if exists listings_bathrooms_check;
alter table public.listings
  add constraint listings_bathrooms_check
  check (bathrooms is null or (bathrooms >= 0 and bathrooms <= 5));

alter table public.listings
  drop constraint if exists listings_parking_spaces_check;
alter table public.listings
  add constraint listings_parking_spaces_check
  check (parking_spaces is null or (parking_spaces >= 0 and parking_spaces <= 10));

create index if not exists listings_map_filter_idx
  on public.listings (status, listing_type, property_kind)
  where deleted_at is null and is_hidden = false and lat is not null;
