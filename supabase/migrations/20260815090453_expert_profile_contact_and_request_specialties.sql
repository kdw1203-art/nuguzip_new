-- 전문가 프로필 고도화 (2026-08-15)
--
-- 1) expert_profiles 에 상호·연락처 컬럼 추가.
--    인증 신청서(expert_verification_requests)는 상호(organization)·전화(phone)를
--    받지만 공개 프로필에는 담을 컬럼 자체가 없어 전부 유실됐다. 연락처는
--    자동 공개하지 않는다 — 본인이 프로필 수정 화면에서 직접 채울 때만 노출
--    (전화는 인증 전문가만 화면에 표시).
-- 2) expert_verification_requests.specialties 추가.
--    신청 폼의 '전문 분야'는 API 까지 전달되지만 insert 페이로드에 컬럼이 없어
--    버려졌고, 승인 시 프로필 specialties 는 빈 배열로 하드코딩돼 있었다.
--    신청서에 보존해 승인 시 프로필로 옮긴다.
alter table public.expert_profiles
  add column if not exists organization text,
  add column if not exists contact_phone text,
  add column if not exists contact_kakao text;

alter table public.expert_verification_requests
  add column if not exists specialties text[] not null default '{}';