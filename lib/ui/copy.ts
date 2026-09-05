/**
 * [966] 클립보드 복사 — 단일 출처.
 *
 * navigator.clipboard 는 HTTPS·문서 포커스·권한 조건이 하나라도 어긋나면 던진다
 * (iOS 인앱 브라우저·http 개발 서버에서 실측). 화면마다 try/catch 를 손으로 쓰다
 * 보니 어떤 곳은 폴백이 있고 어떤 곳은 조용히 삼켰다 — 같은 "복사" 버튼인데
 * 결과가 달랐다. 여기서 한 번만 처리한다: clipboard → 숨긴 textarea 순으로 시도하고
 * 성공 여부만 boolean 으로 돌려준다. **절대 던지지 않는다.**
 */

/** 복사 실패 안내 — 토스트·인라인 어디서든 같은 문장을 쓴다. */
export const COPY_FAIL_MESSAGE = "복사하지 못했어요 — 길게 눌러 직접 복사해 주세요";

export async function copyText(text: string): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 권한 거부·비보안 컨텍스트 — 아래 textarea 폴백으로 */
  }
  try {
    /* 폴백은 포커스를 훔친다 — 끝나면 원래 자리로 되돌린다(콤보박스·모달 안에서
       복사 버튼을 눌렀을 때 포커스가 body 로 튀지 않게). */
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    prev?.focus?.();
    return ok;
  } catch {
    return false;
  }
}
