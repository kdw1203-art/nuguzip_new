-- legal_regions 를 고쳤으면 districts 도 같이 고쳐야 한다.
--
-- districts 는 legal_regions 에서 시드된 테이블이라 41430 의 "시흥시" 오기가
-- 그대로 복사돼 있었다(id 34). 결과가 두 가지로 나빴다:
--   - 시흥시 이름으로 행이 둘(41390/id 88, 41430/id 34)이라
--     lib/map/district-snapshot-store.ts 의 resolveDistrictId 가 lawd_cd
--     오름차순 첫 행을 고르는 규칙 덕분에 **우연히** 맞는 쪽(88)을 집었다.
--   - 반대로 **의왕시는 districts 에 아예 없어서** 지도 스냅샷을 만들 수도,
--     읽을 수도 없었다. 실거래는 3,198건이 들어와 있는데도.
--
-- id 34 를 참조하는 행은 district_snapshots·ai_analysis_runs 둘 다 0건이라
-- (id 88 도 0건) 이름을 고쳐도 끊어지는 참조가 없다. 삭제는 하지 않는다.

update public.districts
   set sigungu = '의왕시',
       updated_at = now()
 where lawd_cd = '41430'
   and sigungu = '시흥시';
