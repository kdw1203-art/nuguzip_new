/* 알림 센터 표시 로직 — 화면(app/notifications/page.tsx)과 테스트가 함께 쓴다.
   순수 함수만 둔다(브라우저 API·상태 없음). */

export type NotificationCategory =
  | "매물"
  | "관심지역"
  | "활동"
  | "포인트"
  | "운영";

export type InboxItemView = {
  id: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export type OpsGroup = {
  id: string;
  title: string;
  body: string;
  actionUrl: string | null;
  read: boolean;
  createdAt: string;
  /** 접힌 개수(1이면 접히지 않음) */
  repeat: number;
  /** 묶음에서 가장 오래된 발생 시각 */
  firstAt: string;
  checkName?: string;
  severity?: "critical" | "warn";
  /** 묶음에 들어간 원본 id 들 */
  groupIds: string[];
};

/* ── 시간 ──────────────────────────────────────────────────────────────
   두 가지를 고친다.

   ① 경과 시간(ms)이 아니라 **달력 일자** 로 센다.
      예전엔 Math.floor(경과ms / 24h) 였다. 그래서 8월 19일 06:55 는 "6일 전",
      같은 8월 19일 02:00 은 "08. 19." 로 나왔다 — 같은 날이 두 표기로 갈렸다.

   ② 그 달력은 **한국 시간(KST)** 이다. 브라우저 로컬 자정을 쓰면 사용자가
      해외에 있을 때 "어제"의 뜻이 흔들리고, 서버·테스트(UTC)에서는 같은 입력이
      다른 문자열이 된다. 국토부 신고·공표가 전부 한국 날짜인 서비스라
      화면의 '하루'도 한국 날짜여야 한다.
      KST 는 서머타임이 없어 고정 +9h — 오프셋 산술로 정확하다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const KST = "Asia/Seoul";

/** epoch ms → KST 기준 일련 일자(1970-01-01 KST = 0) */
function kstDayNumber(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / 86_400_000);
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const ms = then.getTime();
  if (!Number.isFinite(ms)) return "";
  const diff = now.getTime() - ms;
  if (diff < 60_000) return "방금 전";

  const days = kstDayNumber(now.getTime()) - kstDayNumber(ms);
  if (days <= 0) {
    const min = Math.floor(diff / 60_000);
    return min < 60 ? `${min}분 전` : `${Math.floor(min / 60)}시간 전`;
  }
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;

  const sameYear =
    new Date(ms + KST_OFFSET_MS).getUTCFullYear() ===
    new Date(now.getTime() + KST_OFFSET_MS).getUTCFullYear();
  return then.toLocaleDateString("ko-KR", {
    timeZone: KST,
    ...(sameYear ? {} : { year: "numeric" }),
    month: "long",
    day: "numeric",
  });
}

/** 묶음 표기용 짧은 날짜 — "8월 19일"(KST) */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", {
    timeZone: KST,
    month: "long",
    day: "numeric",
  });
}

/* ── 운영 경보 ─────────────────────────────────────────────────────────
   점검 키를 사람 말로. 원문 키는 카드에 그대로 병기한다 —
   화면에서 본 문구로 로그를 검색할 수 있어야 하기 때문이다. */
export const CHECK_LABEL: Record<string, string> = {
  "db.query_load": "DB 부하",
  "billing.payment_failures": "결제 실패",
  "market_transactions.ingest": "실거래 적재",
  "market_transactions.month_rollover": "실거래 월 롤오버",
  "ingest.pipeline_heartbeat": "수집 파이프라인",
  "seo.cwv_page": "Core Web Vitals",
  "seo.asset": "SEO 색인 경로",
  "ops.cron_job": "크론 잡",
  "ops.watchdog": "감시 잡",
  rent_yield_cache_empty: "전월세 집계 캐시",
};

/* 카드 왼쪽 아이콘에 들어갈 2글자 코드.
   예전엔 CHECK_LABEL 을 slice(0,2) 했는데 "Core Web Vitals" → "Co",
   "SEO 색인 경로" → "SE" 처럼 잘린 알파벳이 나왔다. 뜻이 남는 말로 직접 적는다. */
export const CHECK_SHORT: Record<string, string> = {
  "db.query_load": "DB",
  "billing.payment_failures": "결제",
  "market_transactions.ingest": "적재",
  "market_transactions.month_rollover": "월별",
  "ingest.pipeline_heartbeat": "수집",
  "seo.cwv_page": "속도",
  "seo.asset": "색인",
  "ops.cron_job": "크론",
  "ops.watchdog": "감시",
  rent_yield_cache_empty: "전월",
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * "[HEALTH] db.query_load 이 critical 상태입니다 — DB 실행시간 787043ms/…"
 *  → { checkName: "db.query_load", severity: "critical", body: "DB 실행시간 …" }
 * 접두사와 "…이 critical 상태입니다" 는 제목이 이미 말하는 내용이라 지운다.
 */
export function parseHealthBody(raw: string): {
  checkName?: string;
  severity?: "critical" | "warn";
  body: string;
} {
  const m = /^\[HEALTH\]\s*([A-Za-z0-9_.]+)\s*(?:—|-)?\s*([\s\S]*)$/.exec(raw);
  if (!m) return { body: raw };
  const checkName = m[1];
  let rest = m[2].trim();
  const severity = /\bcritical\b/.test(rest)
    ? ("critical" as const)
    : /\bwarn(ing)?\b/.test(rest)
      ? ("warn" as const)
      : undefined;
  /* 체크명은 위 정규식이 이미 걷어냈다. 남은 문장은 "이 critical 상태입니다 — …"
     처럼 조사부터 시작한다 — 여기서 체크명을 다시 요구하면 아무것도 안 지워진다
     (실제로 그 버그로 "이 critical 상태입니다 — DB 실행시간 …" 이 그대로 나갔다).
     혹시 본문이 체크명을 한 번 더 반복하는 형태여도 받도록 선택적으로 둔다. */
  rest = rest
    .replace(
      new RegExp(
        `^(?:${escapeRe(checkName)}\\s*)?이?\\s*(?:critical|warn(?:ing)?)\\s*상태입니다\\s*(?:—|-)?\\s*`,
      ),
      "",
    )
    .trim();
  return { checkName, severity, body: rest || raw };
}

/**
 * 같은 경보를 하나로 접는다.
 * 실측(2026-08-26): "Core Web Vitals 이상"이 같은 값(CLS p75 0.825)으로 8일
 * 연속 8줄, "SEO 색인 경로 이상"이 8줄, month_rollover 가 5줄이었다.
 * 29줄 중 21줄이 같은 말의 반복이라, 스크롤은 길고 정보량은 몇 건뿐이었다.
 * 묶음 기준은 제목 — 점검 키 하나가 곧 제목 하나다.
 */
export function foldOpsAlerts(rows: InboxItemView[]): OpsGroup[] {
  const groups = new Map<string, InboxItemView[]>();
  for (const r of rows) {
    const cur = groups.get(r.title);
    if (cur) cur.push(r);
    else groups.set(r.title, [r]);
  }
  const out: OpsGroup[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const head = sorted[0];
    const parsed = parseHealthBody(head.body);
    /* "운영 점검 필요 · db.query_load" 같은 제목은 접두사를 떼면 점검 키만 남는다.
       그 키는 카드 아래 chip 으로 따로 보여 주므로, 제목은 사람 말로 바꾼다. */
    const stripped = head.title.replace(/^운영 점검 필요 · /, "");
    out.push({
      id: head.id,
      title: CHECK_LABEL[stripped] ?? stripped,
      body: parsed.body,
      actionUrl: head.actionUrl,
      /* 묶음은 전부 읽어야 읽은 것이다 — 하나만 읽고 사라지면 나머지가 숨는다. */
      read: sorted.every((x) => Boolean(x.readAt)),
      createdAt: head.createdAt,
      repeat: sorted.length,
      firstAt: sorted[sorted.length - 1].createdAt,
      checkName: parsed.checkName,
      severity: parsed.severity,
      groupIds: sorted.map((x) => x.id),
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
