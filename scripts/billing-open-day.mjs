#!/usr/bin/env node
/* [#142] 빌링 오픈 당일 — 원버튼.
 *
 * 사람 단계(런북 1·3: Vercel 라이브 키 교체 → 재배포)가 끝난 "직후" 실행한다.
 * 기계로 할 수 있는 나머지 전부를 순서대로 한 번에:
 *   ① 동결 게이트(가격·문구 소스 검증) ② 리허설 점검(웹훅·헬스)
 *   ③ 오픈 상태 라이브 검증(/subscription 결제 UI·가격 표면)
 *   ④ 오픈 공지 게시(서비스 키 있으면 idempotent 게시, 없으면 초안 출력)
 * 실결제 스모크(런북 4-2, 실카드 1,100원)는 여전히 사람 몫 — 이 스크립트는
 * 그 직전까지의 실수 면적을 0으로 만든다.
 *
 * 사용: node scripts/billing-open-day.mjs        (오픈 검증 + 공지)
 *       node scripts/billing-open-day.mjs --dry  (공지 게시 없이 검증만)
 * 종료코드: 0 = 전부 통과 · 1 = CHECK 항목 있음(공지는 게시하지 않음)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const BASE = process.env.REHEARSAL_BASE_URL ?? "https://naezipnow.com";
const DRY = process.argv.includes("--dry");

const results = [];
const add = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS " : "CHECK"} ${name} — ${detail}`);
};

function runNode(script) {
  const r = spawnSync(process.execPath, [join(root, "scripts", script)], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

console.log(`[open-day] 기준 URL ${BASE} · ${DRY ? "검증만(--dry)" : "검증 + 공지"}\n`);

/* ① 동결 게이트 — 가격·문구가 심사 제출본과 일치하는지 (소스 검증) */
{
  const r = runNode("check-toss-review-freeze.mjs");
  add("① 가격·문구 동결 게이트", r.code === 0, r.code === 0 ? "소스 일치" : r.out.split("\n").slice(-3).join(" / "));
}

/* ② 리허설 점검 — 웹훅 계약·헬스·런북 완비 (오픈 후에는 '결제 개통 상태'가 정상) */
{
  const r = runNode("billing-open-rehearsal.mjs");
  /* 리허설은 /subscription 이 "정확히 한 모드"이기만 하면 통과 — 오픈 후에도 유효 */
  add("② 리허설 점검(웹훅·헬스)", r.code === 0, r.code === 0 ? "통과" : r.out.split("\n").filter((l) => l.startsWith("CHECK")).join(" / ") || "실패");
}

/* ③ 오픈 상태 라이브 검증 — 결제 UI 가 실제로 켜졌는지 + 가격 표면 */
try {
  const res = await fetch(`${BASE}/subscription`, {
    headers: { "User-Agent": "Mozilla/5.0 (billing-open-day)" },
    redirect: "follow",
  });
  const text = await res.text();
  const checkout = text.includes("플러스 시작하기");
  const preorder = text.includes("오픈 알림 받기");
  add(
    "③ 결제 UI 개통",
    res.status === 200 && checkout && !preorder,
    `HTTP ${res.status} · 결제버튼=${checkout} · 사전등록=${preorder}${
      !checkout ? " — 플래그·재배포(런북 1·3) 반영 전이거나 캐시" : ""
    }`,
  );
  /* 가격 표면 — 동결 게이트의 표시 가격이 라이브 HTML 에도 그대로 있는지 */
  const prices = ["1,100", "9,900"].filter((p) => text.includes(p));
  add("③ 가격 표면(주간권·월간권)", prices.length >= 1, prices.length ? `노출 확인: ${prices.join("·")}원` : "가격 문자열 미검출 — 눈으로 확인");
} catch (e) {
  add("③ 결제 UI 개통", false, String(e));
}

/* ④ 오픈 공지 — idempotent(external_key). 서비스 키 없으면 초안만. */
const NOTICE_KEY = "billing-open-notice:v1";
const noticeTitle = "내집나우 플러스, 오늘부터 시작할 수 있어요";
const noticeBody = [
  "내집나우 플러스 자동결제가 오늘 열렸습니다.",
  "",
  "- 주간권 1,100원 · 월간권 9,900원 — /subscription 에서 시작",
  "- 언제든 해지 가능, 남은 기간은 일할 환불",
  "- 결제 관련 문의는 /support 로",
  "",
  "지금까지처럼 무료로 쓸 수 있는 범위는 그대로예요. 플러스는 더 깊은 분석과 리포트가 필요할 때를 위한 선택지입니다.",
].join("\n");

const failBefore = results.filter((r) => !r.ok).length;
if (DRY) {
  add("④ 오픈 공지", true, "--dry — 게시 생략(초안 준비됨)");
} else if (failBefore > 0) {
  add("④ 오픈 공지", false, "앞 단계 CHECK 있음 — 해소 전에는 게시하지 않음");
} else {
  /* .env.local 로드 (backup 스크립트와 동일 패턴) */
  for (const f of [".env.local", ".env"]) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    add("④ 오픈 공지", true, "서비스 키 없음 — 아래 초안을 관리자 글쓰기로 게시하세요");
    console.log(`\n----- 공지 초안 -----\n${noticeTitle}\n\n${noticeBody}\n---------------------`);
  } else {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { data: existing } = await sb.from("board_posts").select("id").eq("external_key", NOTICE_KEY).maybeSingle();
      if (existing) {
        add("④ 오픈 공지", true, `이미 게시됨(#${existing.id}) — 중복 게시 안 함`);
      } else {
        const { data: bot } = await sb
          .from("board_posts")
          .select("author_id")
          .eq("is_automated", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!bot?.author_id) {
          add("④ 오픈 공지", false, "봇 계정 조회 실패 — 관리자 글쓰기로 수동 게시");
        } else {
          const { error } = await sb.from("board_posts").insert({
            author_id: bot.author_id,
            board_type: "community",
            category: "정보/소식",
            title: noticeTitle,
            content: noticeBody,
            tags: ["공지"],
            source_name: "내집나우",
            external_key: NOTICE_KEY,
            is_automated: true,
            automation_meta: { source: "billing-open-day" },
          });
          add("④ 오픈 공지", !error, error ? error.message : "게시 완료");
        }
      }
    } catch (e) {
      add("④ 오픈 공지", false, String(e));
    }
  }
}

const fail = results.filter((r) => !r.ok).length;
console.log(
  fail === 0
    ? "\n[open-day] 전부 통과 — 남은 것: 실카드 스모크(런북 4-2, 1,100원 등록→해지) 1건."
    : `\n[open-day] CHECK ${fail}건 — 해소 후 다시 실행하세요. (공지는 통과 전 게시되지 않습니다)`,
);
process.exit(fail === 0 ? 0 : 1);
