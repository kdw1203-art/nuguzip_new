/**
 * 한국어 이메일 템플릿 — 누구집 브랜드(포인트 컬러 #1d4fd8), 인라인 스타일 HTML.
 * 각 함수는 sendEmail 에 바로 펼쳐 넣을 수 있는 { subject, html, text } 를 반환합니다.
 */

const ACCENT = "#1d4fd8";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 공통 레이아웃: 브랜드 헤더 + 카드 + 푸터 */
function layout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<body style="margin:0;padding:0;background-color:#f4f6fb;">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px;font-family:'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',Arial,sans-serif;">
    <div style="padding:0 4px 16px;">
      <span style="font-size:20px;font-weight:700;color:${ACCENT};letter-spacing:-0.5px;">누구집</span>
    </div>
    <div style="background-color:#ffffff;border:1px solid #e5e9f2;border-radius:12px;padding:28px 24px;">
      ${bodyHtml}
    </div>
    <p style="color:#8a94a6;font-size:12px;line-height:1.6;margin:16px 4px 0;">
      본 메일은 누구집(nuguzip.com)에서 자동 발송되었습니다.
    </p>
  </div>
</body>
</html>`;
}

/** 비밀번호 재설정 안내 메일 */
export function passwordResetEmail(params: { resetUrl: string; expiresMinutes?: number }) {
  const { resetUrl, expiresMinutes = 60 } = params;
  const safeUrl = escapeHtml(resetUrl);
  const html = layout(`
      <h1 style="margin:0 0 12px;font-size:18px;color:#1a2233;">비밀번호 재설정 안내</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#3d4657;">
        누구집 계정의 비밀번호 재설정 요청을 받았습니다.<br />
        아래 버튼을 눌러 새 비밀번호를 설정해 주세요. 링크는 <strong>${expiresMinutes}분</strong> 동안만 유효합니다.
      </p>
      <a href="${safeUrl}"
         style="display:inline-block;background-color:${ACCENT};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">
        비밀번호 재설정하기
      </a>
      <p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:#8a94a6;">
        버튼이 열리지 않으면 아래 주소를 복사해 브라우저에 붙여넣어 주세요.<br />
        <a href="${safeUrl}" style="color:${ACCENT};word-break:break-all;">${safeUrl}</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;line-height:1.7;color:#8a94a6;">
        본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다. 비밀번호는 변경되지 않습니다.
      </p>`);
  const text = [
    "누구집 비밀번호 재설정 안내",
    "",
    `아래 링크에서 새 비밀번호를 설정해 주세요. (${expiresMinutes}분 유효)`,
    resetUrl,
    "",
    "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.",
  ].join("\n");
  return { subject: "[누구집] 비밀번호 재설정 안내", html, text };
}

/** 고객 문의 접수 알림 메일 (운영팀 수신용) */
export function supportInquiryEmail(params: {
  category: string;
  subject: string;
  message: string;
  fromEmail: string;
}) {
  const category = escapeHtml(params.category);
  const subject = escapeHtml(params.subject);
  const fromEmail = escapeHtml(params.fromEmail);
  const messageHtml = escapeHtml(params.message).replace(/\r?\n/g, "<br />");
  const html = layout(`
      <h1 style="margin:0 0 12px;font-size:18px;color:#1a2233;">새 고객 문의가 접수되었습니다</h1>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#3d4657;">
        <tr>
          <td style="padding:8px 12px 8px 0;color:#8a94a6;white-space:nowrap;vertical-align:top;">카테고리</td>
          <td style="padding:8px 0;">
            <span style="display:inline-block;background-color:#eaf0ff;color:${ACCENT};font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;">${category}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 12px 8px 0;color:#8a94a6;white-space:nowrap;vertical-align:top;">제목</td>
          <td style="padding:8px 0;font-weight:700;">${subject}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px 8px 0;color:#8a94a6;white-space:nowrap;vertical-align:top;">보낸이</td>
          <td style="padding:8px 0;"><a href="mailto:${fromEmail}" style="color:${ACCENT};">${fromEmail}</a></td>
        </tr>
      </table>
      <div style="margin-top:16px;padding:16px;background-color:#f7f9fd;border-left:3px solid ${ACCENT};border-radius:0 8px 8px 0;font-size:14px;line-height:1.7;color:#3d4657;">
        ${messageHtml}
      </div>
      <p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:#8a94a6;">
        이 메일에 회신하면 문의자에게 답장됩니다.
      </p>`);
  const text = [
    "새 고객 문의가 접수되었습니다",
    "",
    `카테고리: ${params.category}`,
    `제목: ${params.subject}`,
    `보낸이: ${params.fromEmail}`,
    "",
    params.message,
  ].join("\n");
  return { subject: `[누구집 문의:${params.category}] ${params.subject}`, html, text };
}
