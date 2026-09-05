-- [965] 자격번호 정규화 규칙 변경에 맞춘 백필.
--
-- 코드(lib/experts/fraud-guards.ts normalizeCertNumber)가 공백·하이픈만 지우던 것에서
-- 접두 '제'·접미 '호'·모든 구분 기호를 걷어내도록 바뀌었다. 기존 행의
-- cert_number_normalized 를 같은 규칙으로 다시 계산해 두어야 새 신청과의 중복
-- 판정이 맞는다. 데이터만 갱신(스키마 변경 없음)·재실행 안전.

update public.expert_verification_requests
   set cert_number_normalized = nullif(
         upper(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(coalesce(cert_number, ''), '\s+', '', 'g'),
                 '^제', ''),
               '호$', ''),
             '[^0-9A-Za-z가-힣]', '', 'g')
         ), '')
 where cert_number is not null;
