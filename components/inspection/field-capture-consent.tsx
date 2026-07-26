/**
 * 현장 기록 AI 처리 고지 (final-test-checklist — Field capture AI consent).
 *
 * 노트 저장 시 기록 내용이 AI 정리를 위해 외부 LLM 으로 전송된다는 사실을
 * 버튼을 누르기 전에 알린다. 몰래 보내지 않는 것이 원칙이다.
 * 사진은 업로드 시점에 EXIF(GPS·기기정보)가 제거된다(lib/storage/upload.ts).
 */
import Link from "next/link";

export function FieldCaptureConsentNotice() {
  return (
    <p className="text-[10px] leading-[1.6] text-text-3">
      기록 완료 시 노트에 적은 내용이 AI 정리를 위해 외부 AI API 전송됩니다.
      사진은 저장 시 위치정보(EXIF)가 자동 제거돼요. 자세한 내용은{" "}
      <Link href="/legal/privacy" className="font-bold text-primary underline">
        개인정보처리방침
      </Link>
      을 확인하세요.
    </p>
  );
}
