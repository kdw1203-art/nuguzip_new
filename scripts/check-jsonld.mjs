#!/usr/bin/env node
/**
 * N8 — 구조화 데이터(JSON-LD) 빌드 검증 게이트.
 *
 * 우리는 스키마를 손으로 짠다. 손으로 짜면 조용히 깨진다: 오타 난 @type,
 * 빈 mainEntity, position 없는 BreadcrumbList, undefined 가 섞여 "undefined"
 * 문자열이 된 필드. 이런 건 화면에선 아무 표시가 없고, 검색엔진에서만 통째로
 * 무시된다 — 즉 **배포된 뒤에도 아무도 모른다**.
 *
 * 그래서 빌드 산출물(.next/server/app/**\/*.html)에서 실제로 나가는 JSON-LD 를
 * 전부 뽑아 파싱하고, 타입별 필수 필드를 확인한다. 소스가 아니라 산출물을
 * 검사하는 이유: 값이 런타임에 채워지는 필드(가격·날짜·집계 수치)는 소스만
 * 봐서는 비어 있는지 알 수 없다.
 *
 * 검사하지 않는 것 1: schema.org 전체 어휘의 유효성. 그건 외부 검증기의 일이고,
 * 여기서 하려면 스키마 덤프를 들고 있어야 한다. 여기서는 "우리가 실제로 쓰는
 * 타입이, 구글이 실제로 요구하는 필드를 갖고 나가는가"만 본다.
 *
 * 검사하지 않는 것 2 — **이 게이트의 사각지대이므로 알고 있을 것**: 빌드 시
 * prerender 되지 않는 라우트. 단지·지역 상세처럼 요청 시 DB 를 읽어 그리는
 * 페이지의 ApartmentComplex·Place·Dataset 스키마는 산출물에 HTML 이 없어
 * 여기서 볼 수 없다. 그런 라우트를 고칠 때는 배포 후 실제 URL 을 리치 결과
 * 테스트에 넣어 확인해야 한다. 이 스크립트의 통과는 "정적 페이지는 깨지지
 * 않았다"는 뜻이지 "사이트 전체가 안전하다"는 뜻이 아니다.
 *
 * 사용: node scripts/check-jsonld.mjs   (next build 이후 실행)
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, ".next/server/app");

if (!existsSync(appDir)) {
  console.log("· .next/server/app 없음 — 빌드 전이므로 검사를 건너뜁니다.");
  process.exit(0);
}

/** 우리가 의도적으로 쓰는 타입. 여기 없는 타입이 나오면 오타를 의심한다. */
const KNOWN_TYPES = new Set([
  "Organization",
  "WebSite",
  "WebPage",
  "BreadcrumbList",
  "FAQPage",
  "Article",
  "NewsArticle",
  "Dataset",
  "DefinedTerm",
  "DefinedTermSet",
  "ItemList",
  "Place",
  "Residence",
  "ApartmentComplex",
  "RealEstateListing",
  "Product",
  "SoftwareApplication",
  "Event",
  "Person",
  "SearchAction",
  "ContactPoint",
  "PostalAddress",
  "ImageObject",
  "ListItem",
  "Question",
  "Answer",
  "PropertyValue",
  "DataCatalog",
  "DataDownload",
  "Offer",
  "AggregateOffer",
  "QuantitativeValue",
  /* N20 — /developers 의 공개 집계 API. schema.org 정식 타입이다
     (https://schema.org/WebAPI, Service 하위). */
  "WebAPI",
  /* /guides/contract — 계약 단계 절차 안내. 화면에 렌더되는 STAGES 배열
     그대로에서 생성한다(lib/seo/jsonld.ts howToJsonLd 주석 참고). */
  "HowTo",
  "HowToStep",
]);

/** 타입별 필수 필드 검사 — 통과 못 하면 검색엔진이 그 블록을 통째로 버린다. */
const REQUIRED = {
  HowTo: (o, err) => {
    const steps = asArray(o.step);
    if (steps.length === 0) return err("step 이 비어 있습니다 (단계 0개)");
    steps.forEach((s, i) => {
      if (s["@type"] !== "HowToStep") err(`step[${i}].@type 이 HowToStep 이 아닙니다`);
      if (!nonEmpty(s.name)) err(`step[${i}].name(단계명)이 비어 있습니다`);
      if (!nonEmpty(s.text)) err(`step[${i}].text(설명)가 비어 있습니다`);
    });
  },
  FAQPage: (o, err) => {
    const list = asArray(o.mainEntity);
    if (list.length === 0) return err("mainEntity 가 비어 있습니다 (질문 0개)");
    list.forEach((q, i) => {
      if (q["@type"] !== "Question") err(`mainEntity[${i}].@type 이 Question 이 아닙니다`);
      if (!nonEmpty(q.name)) err(`mainEntity[${i}].name(질문)이 비어 있습니다`);
      const a = q.acceptedAnswer;
      if (!a || !nonEmpty(a.text)) err(`mainEntity[${i}].acceptedAnswer.text(답)가 비어 있습니다`);
    });
  },
  BreadcrumbList: (o, err) => {
    const list = asArray(o.itemListElement);
    if (list.length === 0) return err("itemListElement 가 비어 있습니다");
    list.forEach((it, i) => {
      if (typeof it.position !== "number") err(`itemListElement[${i}].position 이 숫자가 아닙니다`);
      if (!nonEmpty(it.name)) err(`itemListElement[${i}].name 이 비어 있습니다`);
      const item = it.item;
      const url = typeof item === "string" ? item : item?.["@id"] ?? item?.url;
      if (!nonEmpty(url)) err(`itemListElement[${i}].item(URL)이 비어 있습니다`);
    });
  },
  Article: (o, err) => {
    if (!nonEmpty(o.headline)) err("headline 이 비어 있습니다");
  },
  NewsArticle: (o, err) => {
    if (!nonEmpty(o.headline)) err("headline 이 비어 있습니다");
  },
  Dataset: (o, err) => {
    if (!nonEmpty(o.name)) err("name 이 비어 있습니다");
    if (!nonEmpty(o.description)) err("description 이 비어 있습니다");
  },
  DefinedTerm: (o, err) => {
    if (!nonEmpty(o.name)) err("name(용어)이 비어 있습니다");
    if (!nonEmpty(o.description)) err("description(정의)이 비어 있습니다");
  },
  DefinedTermSet: (o, err) => {
    if (!nonEmpty(o.name)) err("name 이 비어 있습니다");
    const terms = asArray(o.hasDefinedTerm);
    terms.forEach((t, i) => {
      if (!nonEmpty(t.name)) err(`hasDefinedTerm[${i}].name 이 비어 있습니다`);
    });
  },
  Organization: (o, err) => {
    if (!nonEmpty(o.name)) err("name 이 비어 있습니다");
    if (!nonEmpty(o.url)) err("url 이 비어 있습니다");
  },
  WebSite: (o, err) => {
    if (!nonEmpty(o.url)) err("url 이 비어 있습니다");
  },
};

function asArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function nonEmpty(v) {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * 값 어디엔가 undefined/null 이 문자열로 굳어 들어갔는지 — 가장 흔한 사고.
 *
 * 경계 규칙에 주의. 한국어 템플릿에서 실제로 터지는 모양은 `${month}월` 이 비어
 * "undefined월" 이 되는 식이라, 뒤에 공백이나 문장부호가 오지 않는다. 그래서
 * "뒤에 라틴 문자·숫자가 이어지지 않으면" 로 잡는다(= 한글이 붙어도 걸린다).
 * 앞쪽도 같은 기준이라 base64 단지 id 중간의 우연한 "null" 은 걸리지 않는다.
 */
const POISON = /(^|[^A-Za-z0-9_])(undefined|null|NaN|Invalid Date)(?![A-Za-z0-9_])/;

function scanPoison(node, path, err, depth = 0) {
  if (depth > 8) return;
  if (typeof node === "string") {
    if (POISON.test(node)) err(`${path} 에 "${node.slice(0, 60)}" — 채워지지 않은 값이 들어갔습니다`);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanPoison(v, `${path}[${i}]`, err, depth + 1));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      scanPoison(v, path ? `${path}.${k}` : k, err, depth + 1);
    }
  }
}

function walkHtml(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkHtml(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const files = walkHtml(appDir, []);
const problems = [];
let blockCount = 0;
let pageCount = 0;
const typeCounts = new Map();

for (const file of files) {
  const rel = relative(root, file);
  const html = readFileSync(file, "utf8");
  const blocks = [
    ...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ];
  if (blocks.length === 0) continue;
  pageCount += 1;

  blocks.forEach((m, bi) => {
    blockCount += 1;
    const where = `${rel} · 블록 ${bi + 1}`;
    const err = (msg) => problems.push(`${where}: ${msg}`);

    let parsed;
    try {
      parsed = JSON.parse(m[1]);
    } catch (e) {
      err(`JSON 파싱 실패 — ${e.message}`);
      return;
    }

    for (const node of asArray(parsed["@graph"] ?? parsed)) {
      const type = node["@type"];
      if (!nonEmpty(node["@context"]) && !parsed["@context"]) {
        err("@context 가 없습니다");
      }
      if (!nonEmpty(type)) {
        err("@type 이 없습니다");
        continue;
      }
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      if (!KNOWN_TYPES.has(type)) {
        err(`알 수 없는 @type "${type}" — 오타이거나, 의도한 타입이면 KNOWN_TYPES 에 추가하세요`);
      }
      REQUIRED[type]?.(node, err);
      scanPoison(node, "", err);
    }
  });
}

if (problems.length > 0) {
  console.error("\n✗ 구조화 데이터 검사 실패\n");
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
  if (problems.length > 40) console.error(`  … 외 ${problems.length - 40}건`);
  console.error("\n  깨진 JSON-LD 는 화면에 아무 표시도 남기지 않고 검색엔진에서만 무시됩니다.\n");
  process.exit(1);
}

const summary = [...typeCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([t, n]) => `${t} ${n}`)
  .join(" · ");

console.log(
  `✓ 구조화 데이터 검사 통과 — prerender 된 ${pageCount}개 페이지 / ${blockCount}개 블록\n  ${summary}\n` +
    `  (동적 라우트는 산출물에 HTML 이 없어 검사 범위 밖입니다)`,
);
