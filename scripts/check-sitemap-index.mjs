#!/usr/bin/env node
/**
 * N4 — 사이트맵 인덱스 배선 검사.
 *
 * 인덱스 분할은 한 유형을 추가할 때 세 곳을 같이 고쳐야 한다.
 *   1) lib/seo/sitemap-slugs.ts  — slug 목록 (robots.txt·캐시 정책이 읽는다)
 *   2) lib/seo/sitemap-sections.ts — 로더 등록
 *   3) app/sitemap-{slug}.xml/route.ts — 실제 라우트
 *
 * 하나라도 빠지면 **조용히** 틀린다. slug 만 추가하면 robots.txt 와 인덱스가
 * 404 를 광고하고(크롤러에게 "여기 URL 목록이 있다"고 해 놓고 없는 것), 라우트만
 * 만들면 아무도 그 URL 을 모르니 만든 의미가 없다. 둘 다 배포된 뒤에야, 그것도
 * 서치콘솔 오류 보고서에서나 드러난다.
 *
 * 런타임에도 로더 누락은 throw 로 막지만(sitemap-sections.ts), 라우트 파일
 * 존재 여부는 런타임에 알 수 없다 — 그건 여기서만 볼 수 있다.
 *
 * 사용: node scripts/check-sitemap-index.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const problems = [];

// ── 1) slug 목록 읽기 ─────────────────────────────────────────
const slugsSrc = read("lib/seo/sitemap-slugs.ts");
const slugBlock = slugsSrc.split("SITEMAP_SECTION_SLUGS")[1]?.split("] as const")[0] ?? "";
const slugs = [...slugBlock.matchAll(/"([a-z][a-z0-9-]*)"/g)].map((m) => m[1]);

if (slugs.length === 0) {
  console.error("✗ lib/seo/sitemap-slugs.ts 에서 slug 를 하나도 읽지 못했습니다 — 형식이 바뀌었는지 확인하세요.");
  process.exit(1);
}

// ── 2) 로더 등록 확인 ─────────────────────────────────────────
const sectionsSrc = read("lib/seo/sitemap-sections.ts");
for (const slug of slugs) {
  if (!new RegExp(`slug:\\s*"${slug}"`).test(sectionsSrc)) {
    problems.push(
      `slug "${slug}" 이 SITEMAP_SECTIONS 에 없습니다 — lib/seo/sitemap-sections.ts 에 로더를 등록하세요.`,
    );
  }
}
// 반대 방향: 등록됐는데 slug 목록에 없으면 인덱스에는 실리지만 robots.txt 에는 안 실린다.
for (const m of sectionsSrc.matchAll(/slug:\s*"([a-z][a-z0-9-]*)"/g)) {
  if (!slugs.includes(m[1])) {
    problems.push(
      `SITEMAP_SECTIONS 의 "${m[1]}" 이 SITEMAP_SECTION_SLUGS 에 없습니다 — robots.txt·캐시 정책이 이 사이트맵을 모릅니다.`,
    );
  }
}

// ── 3) 라우트 파일 확인 ───────────────────────────────────────
for (const slug of slugs) {
  const routePath = `app/sitemap-${slug}.xml/route.ts`;
  if (!existsSync(join(root, routePath))) {
    problems.push(`${routePath} 이 없습니다 — 인덱스가 404 인 사이트맵을 광고하게 됩니다.`);
    continue;
  }
  const src = read(routePath);
  if (!new RegExp(`sitemapSectionRoute\\(\\s*"${slug}"\\s*\\)`).test(src)) {
    problems.push(
      `${routePath} 이 sitemapSectionRoute("${slug}") 를 내보내지 않습니다 — 복사 실수로 남의 유형을 내보내면 그 유형이 두 URL 로, 이 유형은 어디에도 안 나갑니다.`,
    );
  }
  if (!/dynamic\s*=\s*"force-dynamic"/.test(src)) {
    problems.push(
      `${routePath} 에 force-dynamic 이 없습니다 — 생성이 빌드 타임으로 가면 서비스 롤 키가 없어 URL 이 통째로 빕니다(실측 사고 이력).`,
    );
  }
}

// 반대 방향: 라우트 폴더는 있는데 slug 목록에 없는 경우(유형 삭제 후 파일만 남음)
for (const name of readdirSync(join(root, "app"))) {
  const m = /^sitemap-([a-z][a-z0-9-]*)\.xml$/.exec(name);
  if (m && !slugs.includes(m[1])) {
    problems.push(`app/${name} 이 남아 있는데 SITEMAP_SECTION_SLUGS 에는 "${m[1]}" 이 없습니다 — 지우거나 다시 등록하세요.`);
  }
}

// ── 4) 인덱스 라우트가 실제로 인덱스인지 ──────────────────────
const indexSrc = read("app/sitemap.xml/route.ts");
if (!/buildSitemapIndex/.test(indexSrc)) {
  problems.push(
    "app/sitemap.xml/route.ts 가 buildSitemapIndex 를 쓰지 않습니다 — 인덱스가 아니라 단일 사이트맵으로 되돌아간 상태입니다.",
  );
}

// ── 5) robots.txt 가 사이트맵 전부를 싣는지 ───────────────────
const robotsSrc = read("app/robots.ts");
if (!/SITEMAP_PATHS/.test(robotsSrc)) {
  problems.push(
    "app/robots.ts 가 SITEMAP_PATHS 를 쓰지 않습니다 — 자식 사이트맵이 robots.txt 에서 빠집니다.",
  );
}

if (problems.length > 0) {
  console.error("\n✗ 사이트맵 인덱스 배선 검사 실패\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("");
  process.exit(1);
}

console.log(
  `✓ 사이트맵 인덱스 배선 통과 — 유형 ${slugs.length}개 (${slugs.join(" · ")}) 가 slug·로더·라우트 3곳에 모두 있습니다`,
);
