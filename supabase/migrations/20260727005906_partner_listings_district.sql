/* partner_listings 에 지역(시군구) 컬럼을 더한다.

   왜: 지역 워크스페이스의 "파트너 매물" 칩은 그 시군구의 건수를 말해야 하는데,
   테이블에는 complex_id(단지 식별자 base64) 뿐이라 시군구로 좁힐 수가 없었다.
   그래서 예전 코드는 전국 활성 매물을 세어 그 지역 수치인 양 보여줬다.
   컬럼을 더해 라벨과 값이 같은 것을 가리키게 만든다. 추가만 한다. */
alter table public.partner_listings
  add column if not exists sido text,
  add column if not exists district text;

create index if not exists partner_listings_district_status_idx
  on public.partner_listings (district, status);
