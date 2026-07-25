/* ============================================================
   apartment_complexes 네임스페이스 상수.

   이 테이블은 이름과 달리 "단지 마스터"만 들어있지 않다. source_key 로
   세 종류가 한 테이블에 섞여 있고, 그중 하나만 실제 대장 정보를 갖는다
   (2026-07-25 프로덕션 실측, 총 39,362행):

     source_key        행수     address 보유   kaptCode/approvalDate/heating/roadAddress
     k-apt-basic     21,658        21,658                              전부 100%
     reb-name-alias   8,905             0                                     0
     reb-complex-id   8,799             0                                     0

   즉 17,704행(45%)은 단지 레코드가 아니라 REB 이름 별칭·ID 레코드다.
   이름만 있고 주소도 메타데이터도 없다. 단지 정보를 얻으려는 조회가
   이 행들을 함께 긁으면 얻는 게 없을 뿐 아니라, 이름이 정확히 일치한다는
   이유로 진짜 마스터를 밀어내고 선택될 수 있다.

   그래서 "apartment_complexes 에서 단지를 찾는" 모든 조회는 이 상수로
   스코프한다. 별칭 행이 필요한 곳은 아직 없다 — 생기면 그때 별도 상수를
   두고, 여기 값을 재사용하지 않는다.

   상수를 lib/national-data/apartment-ingest.ts 가 아니라 여기에 둔 이유:
   그 모듈은 "server-only" + 공공데이터 API 클라이언트를 끌고 오는 ETL 이라,
   페이지 렌더 경로(lib/complex·lib/market)에서 문자열 하나 때문에 import
   하면 불필요한 의존이 딸려온다. 값의 단일 출처는 유지하되(그쪽이 이 파일을
   재export 한다) 무게는 나누지 않는다.
   ============================================================ */

/** 실제 단지 대장(K-apt) 행만 가리키는 apartment_complexes.source_key */
export const APT_MASTER_SOURCE_KEY = "k-apt-basic";
