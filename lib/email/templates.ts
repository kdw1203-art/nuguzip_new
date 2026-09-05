/**
 * 한국어 이메일 템플릿 — 내집나우 브랜드(포인트 컬러 #1d4fd8), 인라인 스타일 HTML.
 * 각 함수는 sendEmail 에 바로 펼쳐 넣을 수 있는 { subject, html, text } 를 반환합니다.
 */

import { getBusinessInfo } from "@/lib/brand/business-info";

const ACCENT = "#1d4fd8"; /* 나우 블루 — 버튼·링크 전용(브랜드 규칙) */
/* [962] 브랜드 마스터 v2.1 — 메일도 같은 언어: 네이비 워드마크 + 주홍 온점, 한지 머리띠, 슬로건 */
const NAVY = "#0B2545";
const RED = "#C8442B";
const HANJI = "#F6F1E7";
const SAND = "#8A7F6E";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 공통 레이아웃: 브랜드 헤더 + 카드 + 표준 푸터 (고도화 49).
 *
 * 푸터는 모든 발신 메일에서 동일해야 한다 — 발신 주체(사업자 표기), 문의 경로,
 * 알림 수신 설정(수신거부) 링크. 알림성 메일 발송처(comment-notify·outbox)도
 * 자체 <div> 대신 이 레이아웃을 쓰도록 export 한다.
 *
 * 수신거부 링크는 실재하는 화면(/my/settings 알림 탭 — notification-prefs 실배선)
 * 만 가리킨다. 사업자 표기는 lib/brand/business-info 단일 출처에서 온다.
 */
export function emailLayout(bodyHtml: string): string {
  const biz = getBusinessInfo();
  return `<!DOCTYPE html>
<html lang="ko">
<body style="margin:0;padding:0;background-color:#f4f6fb;">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px;font-family:'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;background-color:${HANJI};border-radius:12px;">
      <tr>
        <td style="padding:14px 18px;">
          <span style="font-size:19px;font-weight:700;color:${NAVY};letter-spacing:2px;">내집나우</span><span style="display:inline-block;width:7px;height:7px;margin-left:3px;border-radius:50%;background-color:${RED};vertical-align:baseline;"></span>
          <span style="display:block;margin-top:2px;font-size:9px;font-weight:700;color:${SAND};letter-spacing:4px;">NAEJIP NOW</span>
        </td>
        <td style="padding:14px 18px;text-align:right;font-size:11px;color:${NAVY};letter-spacing:2px;white-space:nowrap;">오래 머물 집을, 지금<span style="color:${RED};font-weight:700;">.</span></td>
      </tr>
    </table>
    <div style="background-color:#ffffff;border:1px solid #e5e9f2;border-radius:12px;padding:28px 24px;">
      ${bodyHtml}
    </div>
    <p style="color:#8a94a6;font-size:12px;line-height:1.6;margin:16px 4px 0;">
      본 메일은 내집나우(naezipnow.com)에서 자동 발송되었습니다. 문의는
      <a href="https://naezipnow.com/support" style="color:#8a94a6;">고객센터</a>,
      알림 메일 수신 설정(수신거부)은
      <a href="https://naezipnow.com/my/settings" style="color:#8a94a6;">마이 › 설정 › 알림</a>
      에서 할 수 있습니다.
    </p>
    <p style="color:#a8b0bf;font-size:11px;line-height:1.6;margin:8px 4px 0;">
      ${escapeHtml(biz.legalName)} · 대표 ${escapeHtml(biz.representative)} · 사업자등록번호 ${escapeHtml(biz.registrationNumber)}
    </p>
  </div>
</body>
</html>`;
}

/** @deprecated 내부 호환용 별칭 — 새 코드는 emailLayout 을 쓸 것 */
const layout = emailLayout;

/** 비밀번호 재설정 안내 메일 */
export function passwordResetEmail(params: { resetUrl: string; expiresMinutes?: number }) {
  const { resetUrl, expiresMinutes = 60 } = params;
  const safeUrl = escapeHtml(resetUrl);
  const html = layout(`
      <h1 style="margin:0 0 12px;font-size:18px;color:#0B2545;">비밀번호 재설정 안내</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#3d4657;">
        내집나우 계정의 비밀번호 재설정 요청을 받았습니다.<br />
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
    "내집나우 비밀번호 재설정 안내",
    "",
    `아래 링크에서 새 비밀번호를 설정해 주세요. (${expiresMinutes}분 유효)`,
    resetUrl,
    "",
    "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.",
  ].join("\n");
  return { subject: "[내집나우] 비밀번호 재설정 안내", html, text };
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
      <h1 style="margin:0 0 12px;font-size:18px;color:#0B2545;">새 고객 문의가 접수되었습니다</h1>
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
  return { subject: `[내집나우 문의:${params.category}] ${params.subject}`, html, text };
}

/** [D002] 주간 다이제스트 메일 — cron/weekly-digest 의 이메일 채널.
 *
 * 내용은 인앱·푸시와 같은 원천(getWeeklyDigest)이다. 요약 한 줄이 아니라
 * 시세·뉴스의 실제 항목을 싣는다 — 메일은 열어 보는 매체라 "왔어요"만으로는
 * 다시 올 이유가 되지 않는다. 항목이 없는 섹션은 통째로 뺀다(빈 제목 금지).
 */
export function weeklyDigestEmail(params: {
  weekLabel: string;
  market: Array<{ name: string; price: string; delta: string; tone: "up" | "down" | "flat" }>;
  news: Array<{ title: string; sourceName: string | null }>;
  communityCount: number;
}) {
  const subject = `[내집나우] ${params.weekLabel} 주간 다이제스트`;
  const toneColor = (t: "up" | "down" | "flat") =>
    t === "up" ? "#c62828" : t === "down" ? "#1565c0" : "#8a94a6";

  const marketRows = params.market
    .slice(0, 6)
    .map(
      (m) => `<tr>
        <td style="padding:7px 0;font-size:14px;color:#191f28;">${escapeHtml(m.name)}</td>
        <td style="padding:7px 0;font-size:14px;font-weight:700;color:#191f28;text-align:right;">${escapeHtml(m.price)}</td>
        <td style="padding:7px 0 7px 10px;font-size:13px;font-weight:700;color:${toneColor(m.tone)};text-align:right;white-space:nowrap;">${escapeHtml(m.delta)}</td>
      </tr>`,
    )
    .join("");
  const newsRows = params.news
    .slice(0, 5)
    .map(
      (n) => `<li style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#191f28;">
        ${escapeHtml(n.title)}${n.sourceName ? ` <span style="color:#8a94a6;font-size:12px;">· ${escapeHtml(n.sourceName)}</span>` : ""}
      </li>`,
    )
    .join("");

  const html = emailLayout(`
    <h1 style="margin:0 0 6px;font-size:19px;color:#191f28;">${escapeHtml(params.weekLabel)} 주간 다이제스트</h1>
    <p style="margin:0 0 18px;font-size:13px;color:#8a94a6;">국토교통부 실거래 기준 · 매물 호가가 아닙니다</p>
    ${
      marketRows
        ? `<h2 style="margin:0 0 6px;font-size:14px;color:#191f28;">주요 지역 시세</h2>
           <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">${marketRows}</table>`
        : ""
    }
    ${
      newsRows
        ? `<h2 style="margin:0 0 8px;font-size:14px;color:#191f28;">이번 주 뉴스</h2>
           <ul style="margin:0 0 18px;padding:0 0 0 18px;">${newsRows}</ul>`
        : ""
    }
    ${
      params.communityCount > 0
        ? `<p style="margin:0 0 18px;font-size:13px;color:#4a5568;">이웃 글 ${params.communityCount}건이 새로 올라왔어요.</p>`
        : ""
    }
    <a href="https://naezipnow.com/digest" style="display:inline-block;background:#1d4fd8;color:#ffffff;font-size:14px;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;">전체 다이제스트 보기</a>
  `);

  const text = [
    `${params.weekLabel} 주간 다이제스트`,
    ...params.market.slice(0, 6).map((m) => `${m.name} ${m.price} ${m.delta}`),
    ...params.news.slice(0, 5).map((n) => `- ${n.title}`),
    "전체 보기: https://naezipnow.com/digest",
  ].join("\n");

  return { subject, html, text };
}

/** [945 · 실사용50 #20] 관심단지 새 실거래 메일 — 하루 1통 묶음.
 * 수치는 전부 국토부 신고 실측(금액·면적·층·계약월) — 해석·권유 문장을 넣지 않는다. */
export function watchlistTxEmail(params: {
  items: Array<{
    complexName: string;
    count: number;
    latestLine: string; // 예: "84㎡ 12층 28.5억 (2026.08 계약)"
    href: string; // 절대 URL
  }>;
}) {
  const total = params.items.reduce((a, x) => a + x.count, 0);
  const rows = params.items
    .slice(0, 8)
    .map(
      (x) => `<tr>
        <td style="padding:9px 0;">
          <a href="${x.href}" style="font-size:14px;font-weight:700;color:#191f28;text-decoration:none;">${escapeHtml(x.complexName)}</a>
          <span style="font-size:12px;color:#8a94a6;"> · 새 신고 ${x.count}건</span>
          <p style="margin:2px 0 0;font-size:13px;color:#4a5568;">${escapeHtml(x.latestLine)}</p>
        </td>
      </tr>`,
    )
    .join("");
  const html = emailLayout(`
    <h1 style="margin:0 0 6px;font-size:18px;color:#191f28;">관심단지에 새 실거래 ${total}건</h1>
    <p style="margin:0 0 14px;font-size:13px;color:#8a94a6;">국토교통부 실거래 신고 기준 · 매물 호가가 아닙니다</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">${rows}</table>
    <a href="https://naezipnow.com/my/watchlist" style="display:inline-block;background:#1d4fd8;color:#ffffff;font-size:14px;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;">관심 단지 전체 보기</a>
  `);
  const text = [
    `관심단지에 새 실거래 ${total}건`,
    ...params.items.map((x) => `- ${x.complexName}: ${x.count}건 · ${x.latestLine}`),
    "전체 보기: https://naezipnow.com/my/watchlist",
  ].join("\n");
  return { subject: `[내집나우] 관심단지 새 실거래 ${total}건`, html, text };
}

/** [945 · 실사용50 #14] 가입 환영 메일 — 첫 로그인 성공 시 1회 발송.
 *
 * 트랜잭션성(가입 완료 안내 + 시작 방법)이라 (광고) 표기 대상이 아니다.
 * 서비스에 실재하는 기능만 적는다 — 노트 저장·AI 초안·관심 단지·지도.
 */
export function welcomeEmail(params: { name: string }) {
  const name = escapeHtml(params.name || "회원");
  const item = (emoji: string, title: string, desc: string, href: string) => `
    <tr>
      <td style="padding:10px 12px 10px 0;font-size:20px;vertical-align:top;">${emoji}</td>
      <td style="padding:10px 0;">
        <a href="${href}" style="font-size:14px;font-weight:700;color:#191f28;text-decoration:none;">${title}</a>
        <p style="margin:2px 0 0;font-size:13px;line-height:1.55;color:#8a94a6;">${desc}</p>
      </td>
    </tr>`;
  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:19px;color:#191f28;">${name}님, 내집나우에 오신 것을 환영해요</h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4a5568;">
      집 보러 다니는 날의 기록이 흩어지지 않게 — 내집나우가 도와드릴게요.<br />
      지금 바로 할 수 있는 것들이에요.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
      ${item("📝", "첫 임장노트 쓰기", "체크리스트·사진·음성메모로 현장을 기록해요. AI가 데이터 초안도 잡아줘요.", "https://naezipnow.com/notes/new")}
      ${item("🗺️", "지도에서 시세 보기", "구별 평균가·전세가율·경사·공매 물건까지 한 화면에서.", "https://naezipnow.com/map")}
      ${item("⭐", "관심 단지 등록", "보고 있는 단지를 담아두면 새 실거래를 모아볼 수 있어요.", "https://naezipnow.com/my/watchlist")}
    </table>
    <a href="https://naezipnow.com/welcome" style="display:inline-block;background:#1d4fd8;color:#ffffff;font-size:14px;font-weight:700;padding:11px 22px;border-radius:8px;text-decoration:none;">30초 시작 가이드 보기</a>
  `);
  const text = [
    `${params.name || "회원"}님, 내집나우에 오신 것을 환영해요`,
    "",
    "지금 바로 할 수 있는 것들:",
    "- 첫 임장노트 쓰기 (AI 초안 지원): https://naezipnow.com/notes/new",
    "- 지도에서 시세 보기: https://naezipnow.com/map",
    "- 관심 단지 등록: https://naezipnow.com/my/watchlist",
    "",
    "30초 시작 가이드: https://naezipnow.com/welcome",
  ].join("\n");
  return { subject: "[내집나우] 환영해요 — 첫 임장노트, 오늘 써봐요", html, text };
}

/** [E010] 이탈 리마인드 메일 — reengage-reminders 크론의 이메일 채널.
 *
 * 법적 전제: **마케팅 수신 동의자(user_consents.marketing_agreed)에게만** 나가고,
 * 제목에 (광고) 표기를 붙인다(정보통신망법 광고성 정보 표기). 수신거부 경로는
 * emailLayout 하단 고지(마이 › 설정 › 알림)가 담당한다. 동의 없는 회원에게는
 * 인앱·푸시까지만 — 이 구분을 코드가 강제한다(호출부 참조).
 */
export function reengageEmail(params: { title: string; body: string; actionUrl: string }) {
  const url = params.actionUrl.startsWith("http")
    ? params.actionUrl
    : `https://naezipnow.com${params.actionUrl}`;
  return {
    subject: `(광고) ${params.title}`,
    html: emailLayout(`
      <h1 style="margin:0 0 10px;font-size:18px;color:#191f28;">${escapeHtml(params.title)}</h1>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#4a5568;">${escapeHtml(params.body)}</p>
      <a href="${url}" style="display:inline-block;background:#1d4fd8;color:#ffffff;font-size:14px;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;">이어서 보기</a>
    `),
    text: `${params.title}\n\n${params.body}\n\n이어서 보기: ${url}`,
  };
}

/**
 * [966] 결제 완료(영수증) 메일 — 결제 직후 사용자가 갖는 유일한 우리 쪽 기록.
 *
 * 예전엔 결제 완료 화면 한 번이 전부였다(이메일 0건·알림함 0건). 토스가 보내는
 * 메일은 customerEmail 을 넘긴 결제에만, 그것도 토스 명의로 온다. 여기서는
 * **무엇을·얼마에·언제까지** 와 영수증(매출전표) 링크, 환불 규정 위치만 적는다.
 * 거래 확인 메일이라 마케팅 동의와 무관하게 나간다(광고 아님 — (광고) 표기 없음).
 */
export function paymentReceiptEmail(params: {
  planLabel: string;
  /** "주간권(7일)" · "월간" · "연간" · "월간 자동결제 갱신" 등 화면 표기 그대로 */
  periodLabel: string;
  amountKrw: number;
  paidAt: Date;
  orderId: string;
  /** 이용 종료(만료) 시각 — 알 수 없으면 생략 */
  endsAt?: Date | null;
  receiptUrl?: string | null;
  /** 자동결제면 다음 청구 예정일 */
  nextChargeAt?: Date | null;
}) {
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" });
  const fmtDateTime = (d: Date) =>
    d.toLocaleString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Seoul",
    });
  const amount = `${params.amountKrw.toLocaleString("ko-KR")}원`;
  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#8a94a6;white-space:nowrap;vertical-align:top;">${k}</td>
      <td style="padding:7px 0 7px 14px;font-size:13px;font-weight:700;color:#191f28;text-align:right;">${v}</td>
    </tr>`;
  const html = emailLayout(`
    <h1 style="margin:0 0 6px;font-size:19px;color:${NAVY};">결제가 완료됐어요</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#4a5568;">
      ${escapeHtml(params.planLabel)} ${escapeHtml(params.periodLabel)} 이용권이 바로 적용됐습니다.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e9f2;border-bottom:1px solid #e5e9f2;margin:0 0 16px;">
      ${row("상품", `${escapeHtml(params.planLabel)} · ${escapeHtml(params.periodLabel)}`)}
      ${row("결제 금액", `${amount} <span style="font-weight:400;color:#8a94a6;">(VAT 포함)</span>`)}
      ${row("결제 일시", escapeHtml(fmtDateTime(params.paidAt)))}
      ${params.endsAt ? row("이용 기간", `${escapeHtml(fmtDate(params.endsAt))}까지`) : ""}
      ${params.nextChargeAt ? row("다음 결제 예정", escapeHtml(fmtDate(params.nextChargeAt))) : ""}
      ${row("주문번호", `<span style="font-weight:400;font-family:monospace;">${escapeHtml(params.orderId)}</span>`)}
    </table>
    ${
      params.receiptUrl
        ? `<a href="${escapeHtml(params.receiptUrl)}" style="display:inline-block;background:${NAVY};color:#ffffff;font-size:14px;font-weight:700;padding:11px 22px;border-radius:8px;text-decoration:none;">매출전표(영수증) 보기</a>`
        : `<a href="https://naezipnow.com/subscription#billing" style="display:inline-block;background:${NAVY};color:#ffffff;font-size:14px;font-weight:700;padding:11px 22px;border-radius:8px;text-decoration:none;">결제 내역 보기</a>`
    }
    <p style="margin:16px 0 0;font-size:12px;line-height:1.7;color:#8a94a6;">
      결제 후 7일 이내 청약철회(전액 환불)가 가능해요 —
      <a href="https://naezipnow.com/legal/terms#refund" style="color:#8a94a6;">환불 규정</a> ·
      환불·문의는 <a href="https://naezipnow.com/support?category=payment&order=${encodeURIComponent(params.orderId)}" style="color:#8a94a6;">고객센터</a>
    </p>
  `);
  const text = [
    "결제가 완료됐어요",
    `${params.planLabel} · ${params.periodLabel}`,
    `결제 금액: ${amount} (VAT 포함)`,
    `결제 일시: ${fmtDateTime(params.paidAt)}`,
    ...(params.endsAt ? [`이용 기간: ${fmtDate(params.endsAt)}까지`] : []),
    ...(params.nextChargeAt ? [`다음 결제 예정: ${fmtDate(params.nextChargeAt)}`] : []),
    `주문번호: ${params.orderId}`,
    ...(params.receiptUrl ? [`영수증: ${params.receiptUrl}`] : []),
    "환불 규정: https://naezipnow.com/legal/terms#refund",
  ].join("\n");
  return {
    subject: `[내집나우] 결제 완료 — ${params.planLabel} ${params.periodLabel} ${amount}`,
    html,
    text,
  };
}

/** [966] 환불(취소) 안내 메일 — 관리자 취소 처리 시 사용자에게 */
export function paymentRefundEmail(params: {
  planLabel: string;
  periodLabel: string;
  refundedKrw: number;
  /** 전액이면 null */
  partialOfKrw?: number | null;
  orderId: string;
  reason?: string | null;
}) {
  const amount = `${params.refundedKrw.toLocaleString("ko-KR")}원`;
  const html = emailLayout(`
    <h1 style="margin:0 0 6px;font-size:19px;color:${NAVY};">환불이 처리됐어요</h1>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#4a5568;">
      ${escapeHtml(params.planLabel)} ${escapeHtml(params.periodLabel)} 결제 ${params.partialOfKrw ? `중 ${amount}(부분 환불)` : `전액 ${amount}`}이
      결제하신 수단으로 돌아갑니다. 카드사에 따라 3~7영업일이 걸릴 수 있어요.
    </p>
    ${params.reason ? `<p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#4a5568;">사유: ${escapeHtml(params.reason)}</p>` : ""}
    <p style="margin:0;font-size:12px;line-height:1.7;color:#8a94a6;">주문번호 ${escapeHtml(params.orderId)} · 이용권은 무료 플랜으로 돌아갑니다. 문의는 <a href="https://naezipnow.com/support?category=payment" style="color:#8a94a6;">고객센터</a></p>
  `);
  const text = [
    "환불이 처리됐어요",
    `${params.planLabel} · ${params.periodLabel} — ${params.partialOfKrw ? "부분 환불" : "전액 환불"} ${amount}`,
    ...(params.reason ? [`사유: ${params.reason}`] : []),
    `주문번호: ${params.orderId}`,
  ].join("\n");
  return { subject: `[내집나우] 환불 처리 안내 — ${amount}`, html, text };
}
