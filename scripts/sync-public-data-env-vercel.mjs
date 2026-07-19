#!/usr/bin/env node
/**
 * MOLIT / SEOUL 공공데이터 키를 Vercel 환경변수에 동기화하는 가이드·헬퍼
 *
 * 사용:
 *   node scripts/sync-public-data-env-vercel.mjs          # 안내만
 *   node scripts/sync-public-data-env-vercel.mjs --pull   # vercel env pull → .env.local 병합 힌트
 *
 * 필요: vercel CLI 로그인 + 프로젝트 link (vercel link)
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const PUBLIC_DATA_KEYS = [
  {
    key: "MOLIT_SERVICE_KEY",
    label: "국토부·기상·에어 (apis.data.go.kr 인코딩 키)",
    portal: "https://www.data.go.kr",
  },
  {
    key: "DATA_GO_KR_ENCODING_KEY",
    label: "MOLIT_SERVICE_KEY 대체 (인코딩 키)",
    portal: "https://www.data.go.kr",
  },
  {
    key: "DATA_GO_KR_SERVICE_KEY",
    label: "공공데이터포털 odcloud (디코딩 키)",
    portal: "https://www.odcloud.kr",
  },
  {
    key: "SEOUL_DATA_API_KEY",
    label: "서울 열린데이터광장 Open API",
    portal: "http://data.seoul.go.kr",
  },
  {
    key: "VWORLD_API_KEY",
    label: "브이월드 Open API (국토부 부동산중개업 등)",
    portal: "https://www.vworld.kr",
  },
  {
    key: "VWORLD_API_DOMAIN",
    label: "VWorld 키 등록 도메인 (예: https://nuguzip.com)",
    portal: "https://www.vworld.kr",
  },
  {
    key: "EX_DATA_API_KEY",
    label: "한국도로공사 EX Open API (혼잡빈도)",
    portal: "https://data.ex.co.kr",
  },
  {
    key: "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID",
    label: "네이버 지도 NCP Client ID (Web Dynamic Map)",
    portal: "https://console.ncloud.com/ → AI·NAVER API",
  },
];

function hasVercelCli() {
  try {
    execSync("vercel --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function printGuide() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  공공데이터 키 · Vercel env 동기화");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("대상 변수:\n");
  for (const k of PUBLIC_DATA_KEYS) {
    console.log(`  • ${k.key}`);
    console.log(`    ${k.label}`);
    console.log(`    ${k.portal}\n`);
  }
  console.log("수동 등록 (Production + Preview 권장):\n");
  for (const k of PUBLIC_DATA_KEYS) {
    console.log(`  vercel env add ${k.key} production`);
    console.log(`  vercel env add ${k.key} preview\n`);
  }
  console.log("로컬에서 Vercel env 가져오기:\n");
  console.log("  cd my-app && vercel env pull .env.local\n");
  console.log("배포 후 확인 URL:\n");
  console.log("  GET /api/health?detail=1");
  console.log("  GET /api/public-data/status");
  console.log("  npm run smoke:public-data\n");
}

function tryPull() {
  if (!hasVercelCli()) {
    console.error("vercel CLI가 없습니다. npm i -g vercel 후 vercel login");
    process.exit(1);
  }
  const envPath = path.join(root, ".env.local");
  console.log("Pulling Vercel env → .env.local …");
  try {
    execSync("vercel env pull .env.local", { cwd: root, stdio: "inherit" });
  } catch {
    console.error("vercel env pull 실패 — 대시보드에서 수동 등록하세요.");
    process.exit(1);
  }
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    const missing = PUBLIC_DATA_KEYS.filter((k) => !text.includes(`${k.key}=`));
    if (missing.length) {
      console.log("\n⚠️  아직 비어 있을 수 있는 키:");
      for (const m of missing) console.log(`   - ${m.key}`);
    } else {
      console.log("\n✅ 공공데이터 키가 .env.local 에 포함된 것으로 보입니다.");
    }
  }
}

const pull = process.argv.includes("--pull");
if (pull) tryPull();
else printGuide();
