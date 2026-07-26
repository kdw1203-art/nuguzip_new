#!/usr/bin/env node
/* 시크릿 스캐너(gitleaks)가 걸 만한 "표식"을 푸시 전에 미리 잡는다.
 *
 * 왜 필요한가 (2026-07-26 실제 사고):
 *   lib/seo/google-oauth.ts 의 **주석**에 환경변수 사용 예시를 적으면서
 *   PEM 머리글을 문자 그대로 넣었다. 실제 키는 한 글자도 없었지만,
 *   gitleaks 의 private-key 규칙은 머리글만 보고 잡는다. 배포는 checkout 직후
 *   51초 만에 죽었고, 로그를 열어 보기 전에는 "무엇이 막았는지"조차 알 수 없었다.
 *   CI 에서만 도는 검사는 이렇게 원인이 늦게 보인다 — 로컬에서 먼저 잡는다.
 *
 * 이 스크립트가 하는 일 / 하지 않는 일:
 *   - 한다: 진짜 시크릿이 아니어도 **스캐너가 걸 표식**을 찾는다. 목적이
 *     "유출 탐지"가 아니라 "배포가 막힐 줄 미리 알기"이기 때문이다.
 *   - 안 한다: gitleaks 를 대체하지 않는다. 엔트로피 기반 규칙까지 흉내 내면
 *     오탐만 늘고 아무도 안 고친다. 머리글처럼 **확실한 것만** 본다.
 *
 * 통과시키려면: 예시를 문자 그대로 적지 말고 말로 설명하라(권장), 또는
 * 정말 공개되어야 하는 값이면 .gitleaks.toml 의 allowlist 에 근거와 함께 넣어라.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/* gitleaks 기본 규칙 중 "본문 없이 표식만으로" 걸리는 것들.
   각 항목에 why 를 적어 둔다 — 걸렸을 때 무엇을 고쳐야 하는지가 바로 보이게. */
const MARKERS = [
  {
    id: "private-key",
    re: /-----BEGIN[ A-Za-z0-9_-]{0,100}PRIVATE KEY( BLOCK)?-----/,
    why: "PEM 개인키 머리글. 예시라도 문자 그대로 적으면 gitleaks 가 잡는다.",
  },
  {
    id: "aws-access-key",
    re: /\b(AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/,
    why: "AWS 액세스 키 ID 형식.",
  },
  {
    id: "github-token",
    re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
    why: "GitHub 개인 액세스 토큰 형식.",
  },
  {
    id: "slack-token",
    re: /\bxox[abposr]-[0-9A-Za-z-]{10,}\b/,
    why: "Slack 토큰 형식.",
  },
  {
    id: "stripe-key",
    re: /\b[sr]k_(live|test)_[0-9A-Za-z]{20,}\b/,
    why: "Stripe 시크릿 키 형식.",
  },
  {
    id: "google-api-key",
    re: /\bAIza[0-9A-Za-z_-]{35}\b/,
    why: "Google API 키 형식.",
  },
];

/* .gitleaks.toml 의 allowlist 를 그대로 존중한다. 두 곳이 어긋나면
   "로컬은 통과인데 CI 는 실패" 또는 그 반대가 되어 신뢰를 잃는다. */
function loadAllowlist() {
  let toml = "";
  try {
    toml = readFileSync(".gitleaks.toml", "utf8");
  } catch {
    return { regexes: [], paths: [] };
  }
  const block = (name) => {
    const m = toml.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\]`));
    if (!m) return [];
    return [...m[1].matchAll(/'''([\s\S]*?)'''/g)].map((x) => x[1]);
  };
  const compile = (list) =>
    list.flatMap((src) => {
      try {
        return [new RegExp(src)];
      } catch {
        console.warn(`  (경고) .gitleaks.toml 의 정규식을 읽지 못했습니다: ${src}`);
        return [];
      }
    });
  return { regexes: compile(block("regexes")), paths: compile(block("paths")) };
}

const allow = loadAllowlist();

/* 추적 중인 텍스트 파일만 본다. node_modules·.next·바이너리는 볼 이유가 없다. */
const files = execFileSync("git", ["ls-files", "-z"], { maxBuffer: 64 * 1024 * 1024 })
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .filter((f) => !/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|mp4|bundle)$/i.test(f))
  .filter((f) => !allow.paths.some((re) => re.test(f)));

const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // 바이너리/삭제됨 — 스캔 대상 아님
  }
  if (!text.includes("BEGIN") && !/[A-Za-z]{2}[0-9A-Za-z_-]{18}/.test(text)) continue;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (allow.regexes.some((re) => re.test(line))) continue;
    for (const m of MARKERS) {
      const found = line.match(m.re);
      if (found) hits.push({ file, line: i + 1, id: m.id, why: m.why, sample: found[0].slice(0, 40) });
    }
  }
}

if (hits.length === 0) {
  console.log(`[check-secret-markers] PASS — 파일 ${files.length}개, 스캐너 표식 0건`);
  process.exit(0);
}

console.error("[check-secret-markers] FAIL — 시크릿 스캐너가 잡을 표식을 찾았습니다.\n");
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}  [${h.id}]  ${h.sample}`);
  console.error(`    ${h.why}`);
}
console.error(
  "\n  고치는 법: 예시는 문자 그대로 적지 말고 말로 설명하세요.\n" +
    "  정말 공개되어야 하는 값이라면 .gitleaks.toml 의 allowlist 에 근거를 적어 추가하세요.",
);
process.exit(1);
