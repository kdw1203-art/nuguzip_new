import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const strict = process.env.STRICT_ENV_CHECK === "1";
const isProduction = process.env.NODE_ENV === "production";

/**
 * 운영/배포 필수 환경변수 사전 검증.
 * - 기본: 경고만 출력
 * - STRICT_ENV_CHECK=1: 누락 시 빌드 실패
 */
const required = [
  "AUTH_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  // 크론/ETL 인가(lib/cron/authorize.ts)가 fail-closed 라 이 값이 비면 스케줄러
  // (.github/workflows/etl.yml)가 전부 거부당한다 — 배포 후가 아니라 빌드 전에 걸러야 한다.
  "CRON_SECRET",
];

const alternatives = [
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
];

const optionalProductionWarnings = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_DIRECT_URL",
  "OPENAI_API_KEY",
  "TOSS_SECRET_KEY",
  "NEXT_PUBLIC_TOSS_CLIENT_KEY",
  "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID",
  "MOLIT_SERVICE_KEY",
  "SEOUL_DATA_API_KEY",
  "VWORLD_API_KEY",
];

const businessDisclosureKeys = [
  "NEXT_PUBLIC_COMPANY_REPRESENTATIVE",
  "NEXT_PUBLIC_COMPANY_REGISTRATION_NUMBER",
  /* NEXT_PUBLIC_COMPANY_PHONE · NEXT_PUBLIC_COMPANY_ADDRESS 는 일부러 뺐다 —
     유선번호·사업장 주소는 이제 코드(lib/brand/business-info.ts 의 PHONE·ADDRESS)가
     단일 출처이고 env 를 읽지 않는다. 여기 남겨두면 "설정하라"고 권하는 셈이라,
     설정해봐야 무시되는 값을 안내하게 된다. (주소 env 는 실제로 옛 값이 코드
     기본값을 덮어써 토스 심사 요건 위반을 만들었다 — 2026-08-12) */
  /* NEXT_PUBLIC_MAIL_ORDER_SALES_NUMBER 도 뺐다 — 신고번호(2026-안양동안-1095)가
     코드 상수가 되면서 env 를 읽지 않는다. Vercel 에 남은 자리표시("신고 진행 중")가
     실번호를 덮는 사고를 구조적으로 차단(PHONE·ADDRESS 와 동일 원칙, 2026-08-13). */
];

function isMissing(key) {
  return !String(process.env[key] ?? "").trim();
}

const missingRequired = required.filter(isMissing);
const missingAlternatives = alternatives.filter((keys) => keys.every(isMissing));
const missingOptional = optionalProductionWarnings.filter(isMissing);

if (missingRequired.length > 0 || missingAlternatives.length > 0) {
  const missing = [
    ...missingRequired,
    ...missingAlternatives.map((keys) => `${keys.join(" or ")}`),
  ];
  console.warn(
    `[env-check] missing required env: ${missing.join(", ")}`,
  );
}

if (isProduction && missingOptional.length > 0) {
  console.warn(
    `[env-check] recommended for production: ${missingOptional.join(", ")}`,
  );
}

const missingBusiness = businessDisclosureKeys.filter(isMissing);
if (isProduction && missingBusiness.length > 0) {
  console.warn(
    `[env-check] business disclosure incomplete (footer/terms/pricing): ${missingBusiness.join(", ")}`,
  );
}

if (strict && (missingRequired.length > 0 || missingAlternatives.length > 0)) {
  const missing = [
    ...missingRequired,
    ...missingAlternatives.map((keys) => `${keys.join(" or ")}`),
  ];
  console.error(
    `[env-check] STRICT_ENV_CHECK=1, failing build due to missing env: ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.info(
  `[env-check] complete (strict=${strict ? "on" : "off"}, production=${isProduction ? "yes" : "no"})`,
);
