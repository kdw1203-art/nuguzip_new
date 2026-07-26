"use client";

/**
 * S22 — 쿠키 동의 재설정 링크 (푸터).
 *
 * 배너는 결정 전에만 뜨므로, 한 번 "필수만 허용"을 누른 사용자가 마음을
 * 바꿀 경로가 없었다 — 동의 철회·변경 경로가 없으면 동의 제도 자체가
 * 반쪽이다. 저장된 결정을 지우고 새로고침해 배너를 다시 띄운다.
 */
export function CookieSettingsLink() {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.removeItem("nz_cookie_consent");
        } catch {
          /* 접근 불가 시에도 새로고침은 진행 */
        }
        window.location.reload();
      }}
      className="text-text-3 underline-offset-2 hover:underline"
    >
      쿠키 설정
    </button>
  );
}
