-- 스토리지 버킷 정리 — 2026-07-27 감사
--
-- 세 가지가 한꺼번에 어긋나 있었다.
--
-- 1) 코드가 쓰는 버킷 두 개가 **존재하지 않았다.**
--    lib/storage/upload.ts 는 SUPABASE_STORAGE_BUCKET ?? 'woodong-uploads',
--    app/api/chat/upload/route.ts 는 'chat-uploads' 를 쓰는데 둘 다 없었다.
--    service_role 로 도는 경로라 유출은 없었지만, 채팅 첨부와 일반 업로드가
--    런타임에 조용히 실패하고 있었다.
--
-- 2) inspection-note-images 는 public = true 였는데, 걸려 있는 storage.objects
--    정책 두 개는 `auth.uid()::text = (storage.foldername(name))[1]` 로 **본인 폴더만**
--    보게 쓰여 있었다. 즉 의도는 비공개다. 그런데 버킷이 공개면
--    `/storage/v1/object/public/...` 경로는 **RLS 를 아예 평가하지 않는다** —
--    SELECT 정책은 목록 API 만 막는다. 담기는 것은 사용자가 임장하며 찍은 집 내부
--    사진이고, 경로는 `<auth.uid()>/<파일명>` 이었다. 같은 감사에서 profiles 가
--    anon 에게 전부 열려 있었으므로 uid 는 이미 다 구할 수 있었고, 남은 비밀은
--    파일명뿐이었다.
--
-- 3) make-99a854cb-* 세 개는 초기 스캐폴딩 잔재다(객체 0건·정책 0건·코드 참조 0건).
--
-- 공개 버킷을 쓰지 않기로 한 이유가 곧 이 파일의 요지다: 공개 경로는 RLS 를 건너뛰므로
-- 정책으로는 닫을 수 없다. 비공개 버킷 + 서명 URL 만이 실제로 닫히는 조합이다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-uploads', 'chat-uploads', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'woodong-uploads', 'woodong-uploads', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

update storage.buckets set public = false where id = 'inspection-note-images';

-- make-99a854cb-* 삭제는 storage.protect_delete() 트리거가 SQL 경로를 막는다.
-- 대시보드 Storage 에서 손으로 지울 것. 비공개라 남아 있어도 노출 위험은 없다.
