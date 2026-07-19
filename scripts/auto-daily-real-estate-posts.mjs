#!/usr/bin/env node

import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const KST_TIMEZONE = "Asia/Seoul";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NuguZipNewsBot/2.0 Safari/537.36";

const DEFAULT_DAILY_POST_LIMIT = 5;
const DEFAULT_FETCH_ITEM_LIMIT = 20;
const DEFAULT_LOOKBACK_HOURS = 36;
const DEFAULT_NAVER_PAGES = 2;
const DEFAULT_TREND_LIMIT = 4;

const DEFAULT_RSS_SOURCES = [
  "https://news.google.com/rss/search?q=%EB%B6%80%EB%8F%99%EC%82%B0%20%EB%B6%84%EC%96%91%20when%3A1d&hl=ko&gl=KR&ceid=KR%3Ako",
  "https://news.google.com/rss/search?q=%EC%9E%AC%EA%B1%B4%EC%B6%95%20%EC%9E%AC%EA%B0%9C%EB%B0%9C%20%EC%A0%95%EB%B9%84%EC%82%AC%EC%97%85%20when%3A1d&hl=ko&gl=KR&ceid=KR%3Ako",
  "https://news.google.com/rss/search?q=%EC%B2%AD%EC%95%BD%20%EC%9E%85%EC%A3%BC%EC%9E%90%EB%AA%A8%EC%A7%91%20when%3A1d&hl=ko&gl=KR&ceid=KR%3Ako",
];

const CATEGORY_LABELS = ["분양정보", "정비사업", "시장동향", "부동산뉴스"];

const PRESALE_KEYWORDS = [
  "분양",
  "청약",
  "입주자모집",
  "특별공급",
  "일반공급",
  "모집공고",
  "견본주택",
  "공급",
];

const REDEVELOPMENT_KEYWORDS = [
  "재건축",
  "재개발",
  "정비사업",
  "모아타운",
  "도심복합",
  "신속통합",
  "관리처분",
  "조합설립",
  "시공사",
  "착공",
  "용적률",
  "사업시행",
];

const MARKET_KEYWORDS = [
  "실거래가",
  "거래량",
  "매매",
  "전세",
  "월세",
  "금리",
  "대출",
  "세금",
  "정책",
  "동향",
  "보고서",
  "통계",
  "주택시장",
  "시장",
];

const RELEVANCE_KEYWORDS = [
  "부동산",
  "아파트",
  "분양",
  "청약",
  "재건축",
  "재개발",
  "정비사업",
  "주택",
  "오피스텔",
  "전세",
  "월세",
  "실거래가",
  "입주",
  "공급",
  "도시",
  "단지",
];

const TAG_KEYWORDS = [
  ...PRESALE_KEYWORDS,
  ...REDEVELOPMENT_KEYWORDS,
  ...MARKET_KEYWORDS,
  "아파트",
  "오피스텔",
  "실거주",
  "투자",
];

const CITY_ALIASES = new Map([
  ["서울", "서울특별시"],
  ["서울특별시", "서울특별시"],
  ["경기", "경기도"],
  ["경기도", "경기도"],
  ["인천", "인천광역시"],
  ["인천광역시", "인천광역시"],
  ["부산", "부산광역시"],
  ["부산광역시", "부산광역시"],
  ["대구", "대구광역시"],
  ["대구광역시", "대구광역시"],
  ["대전", "대전광역시"],
  ["대전광역시", "대전광역시"],
  ["광주", "광주광역시"],
  ["광주광역시", "광주광역시"],
  ["울산", "울산광역시"],
  ["울산광역시", "울산광역시"],
  ["세종", "세종특별자치시"],
  ["세종특별자치시", "세종특별자치시"],
  ["강원", "강원특별자치도"],
  ["강원특별자치도", "강원특별자치도"],
  ["충북", "충청북도"],
  ["충청북도", "충청북도"],
  ["충남", "충청남도"],
  ["충청남도", "충청남도"],
  ["전북", "전북특별자치도"],
  ["전북특별자치도", "전북특별자치도"],
  ["전남", "전라남도"],
  ["전라남도", "전라남도"],
  ["경북", "경상북도"],
  ["경상북도", "경상북도"],
  ["경남", "경상남도"],
  ["경상남도", "경상남도"],
  ["제주", "제주특별자치도"],
  ["제주특별자치도", "제주특별자치도"],
]);

const DISTRICT_TO_CITY = new Map([
  ["강남구", "서울특별시"],
  ["강남", "서울특별시"],
  ["서초구", "서울특별시"],
  ["서초", "서울특별시"],
  ["송파구", "서울특별시"],
  ["송파", "서울특별시"],
  ["마포구", "서울특별시"],
  ["마포", "서울특별시"],
  ["용산구", "서울특별시"],
  ["용산", "서울특별시"],
  ["성동구", "서울특별시"],
  ["성동", "서울특별시"],
  ["양천구", "서울특별시"],
  ["양천", "서울특별시"],
  ["강서구", "서울특별시"],
  ["강서", "서울특별시"],
  ["분당구", "경기도"],
  ["분당", "경기도"],
  ["판교", "경기도"],
  ["평촌", "경기도"],
  ["과천", "경기도"],
  ["광명", "경기도"],
  ["하남", "경기도"],
  ["고양", "경기도"],
  ["일산", "경기도"],
  ["용인", "경기도"],
  ["수원", "경기도"],
  ["성남", "경기도"],
  ["화성", "경기도"],
  ["동탄", "경기도"],
  ["의정부", "경기도"],
  ["남양주", "경기도"],
  ["부천", "경기도"],
  ["송도", "인천광역시"],
  ["청라", "인천광역시"],
  ["검단", "인천광역시"],
]);

const REGION_TOKENS = [
  ...CITY_ALIASES.keys(),
  ...DISTRICT_TO_CITY.keys(),
  "수도권",
  "신도시",
];

loadEnvFiles([
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), ".env"),
]);

const args = parseArgs(process.argv.slice(2));
const DAILY_POST_LIMIT =
  args.limit ?? toInt(process.env.DAILY_POST_LIMIT, DEFAULT_DAILY_POST_LIMIT);
const FETCH_ITEM_LIMIT =
  args.fetchLimit ?? toInt(process.env.FETCH_ITEM_LIMIT, DEFAULT_FETCH_ITEM_LIMIT);
const LOOKBACK_HOURS = toInt(process.env.LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS);
const RSS_SOURCES = parseList(process.env.RSS_SOURCES) || DEFAULT_RSS_SOURCES;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const AUTHOR_LABEL =
  process.env.AUTO_POST_AUTHOR_LABEL ||
  process.env.NEWS_BOT_DISPLAY_NAME ||
  "NuguZip AI 편집자";
const DRY_RUN = args.dryRun || process.env.AUTO_POST_DRY_RUN === "true";
const NO_AI = args.noAi || process.env.AUTO_POST_DISABLE_AI === "true";

main().catch((error) => {
  console.error("[NuguZip] daily post job failed");
  console.error(error);
  process.exitCode = 1;
});

function parseArgs(argv) {
  const options = {
    dryRun: false,
    noAi: false,
    limit: null,
    fetchLimit: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--no-ai") {
      options.noAi = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      options.limit = toInt(arg.split("=")[1], DEFAULT_DAILY_POST_LIMIT);
      continue;
    }
    if (arg.startsWith("--fetch-limit=")) {
      options.fetchLimit = toInt(arg.split("=")[1], DEFAULT_FETCH_ITEM_LIMIT);
    }
  }

  return options;
}

function loadEnvFiles(filePaths) {
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) {
      continue;
    }

    const text = readFileSync(filePath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      if (!key || process.env[key]) {
        continue;
      }

      let value = line.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function parseList(value) {
  const list = value
    ?.split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list?.length ? list : null;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL(or NEXT_PUBLIC_SUPABASE_URL)과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  console.log(
    `[NuguZip] daily post job started. rss=${RSS_SOURCES.length}, limit=${DAILY_POST_LIMIT}, dryRun=${DRY_RUN}, noAi=${NO_AI}`
  );

  const candidates = await collectCandidates();
  if (!candidates.length) {
    console.log("[NuguZip] no candidates collected");
    return;
  }

  const deduped = dedupeCandidates(candidates);
  const freshRecent = deduped.filter((candidate) => isRecent(candidate));
  const relevant = freshRecent.filter((candidate) => isRealEstateRelevant(candidate));

  console.log(
    `[NuguZip] collected=${candidates.length}, deduped=${deduped.length}, recent=${freshRecent.length}, relevant=${relevant.length}`
  );

  if (!relevant.length) {
    console.log("[NuguZip] no relevant fresh items. done.");
    return;
  }

  const supabase = createSupabase();
  const existing = await fetchExistingAutomatedPosts(supabase);
  const unpublished = filterAlreadyPublished(relevant, existing);

  if (!unpublished.length) {
    console.log("[NuguZip] all candidates are already published.");
    return;
  }

  const selected = pickBalancedCandidates(unpublished, DAILY_POST_LIMIT);
  if (!selected.length) {
    console.log("[NuguZip] nothing selected after scoring.");
    return;
  }

  console.log(
    `[NuguZip] selected ${selected.length} items: ${selected.map((item) => `${item.category}:${item.title}`).join(" | ")}`
  );

  const results = [];
  for (const item of selected) {
    const summary = await summarizeWithAi(item);
    const row = buildPostRow(item, summary);

    if (DRY_RUN) {
      results.push({ status: "dry_run", title: row.title });
      console.log(`[DRY_RUN] ${row.category} | ${row.title}`);
      continue;
    }

    const { error } = await supabase.from("posts").insert(row);
    if (error) {
      if (error.code === "23505") {
        results.push({ status: "skipped", title: row.title });
        console.log(`[NuguZip] skipped duplicate: ${row.title}`);
        continue;
      }
      throw error;
    }

    results.push({ status: "inserted", title: row.title });
    console.log(`[NuguZip] inserted: ${row.title}`);
  }

  const inserted = results.filter((item) => item.status === "inserted").length;
  const dryRuns = results.filter((item) => item.status === "dry_run").length;
  const skipped = results.filter((item) => item.status === "skipped").length;
  console.log(`[NuguZip] done. inserted=${inserted}, skipped=${skipped}, dryRun=${dryRuns}`);
}

async function fetchExistingAutomatedPosts(supabase) {
  const { data, error } = await supabase
    .from("posts")
    .select("title, source_url, external_key, created_at")
    .eq("is_automated", true)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function collectCandidates() {
  const sources = await Promise.allSettled([
    fetchNaverBreaking(DEFAULT_NAVER_PAGES),
    fetchNaverRegion(DEFAULT_NAVER_PAGES),
    fetchNaverTrendReports(DEFAULT_TREND_LIMIT),
    ...RSS_SOURCES.map((url) => fetchRssFeed(url, "rss")),
  ]);

  const items = [];
  for (const result of sources) {
    if (result.status === "fulfilled") {
      items.push(...result.value.slice(0, FETCH_ITEM_LIMIT));
    } else {
      console.warn("[NuguZip] source failed:", result.reason);
    }
  }

  return items.map((candidate) => enrichCandidate(candidate));
}

async function fetchRssFeed(sourceUrl, kind) {
  const xml = await fetchText(sourceUrl);
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;

  return blocks
    .map((block) => {
      const title = stripTags(pickTag(block, "title"));
      const sourceUrlValue = pickLink(block);
      const summary = stripTags(
        pickTag(block, "description") || pickTag(block, "summary") || pickTag(block, "content")
      );
      const publishedText =
        pickTag(block, "pubDate") || pickTag(block, "published") || pickTag(block, "updated");
      const publishedAt = publishedText ? new Date(publishedText) : null;
      const sourceName = stripTags(pickTag(block, "source")) || getHostname(sourceUrl);

      if (!title || !sourceUrlValue) {
        return null;
      }

      return {
        kind,
        title,
        summary,
        content: summary,
        sourceName,
        sourceUrl: sourceUrlValue,
        canonicalUrl: sourceUrlValue,
        regionHint: inferRegionToken(`${title} ${summary}`),
        publishedText,
        publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt : null,
        externalKey: createStableKey(kind, sourceUrlValue),
      };
    })
    .filter(Boolean);
}

async function fetchNaverBreaking(pages = 1) {
  const items = [];
  const dateParam = formatKstCompact(new Date());

  for (let page = 1; page <= pages; page += 1) {
    const url = new URL("https://land.naver.com/news/breaking.naver");
    url.searchParams.set("listType", "summary");
    url.searchParams.set("bss_ymd", dateParam);
    if (page > 1) {
      url.searchParams.set("page", String(page));
    }

    const html = await fetchText(url.toString());
    items.push(...parseNaverArticleList(html, "breaking"));
  }

  return items;
}

async function fetchNaverRegion(pages = 1) {
  const items = [];

  for (let page = 1; page <= pages; page += 1) {
    const url = new URL("https://land.naver.com/news/region.naver");
    if (page > 1) {
      url.searchParams.set("page", String(page));
    }

    const html = await fetchText(url.toString());
    items.push(...parseNaverArticleList(html, "region"));
  }

  return items;
}

async function fetchNaverTrendReports(limit = 4) {
  const listHtml = await fetchText("https://land.naver.com/news/trendReport.naver");
  const entries = parseNaverTrendList(listHtml).slice(0, limit);
  const items = [];

  for (const entry of entries) {
    try {
      const detailHtml = await fetchText(entry.sourceUrl);
      items.push(parseNaverTrendDetail(detailHtml, entry));
    } catch (error) {
      console.warn(`[NuguZip] trend detail failed: ${entry.sourceUrl}`, error);
    }
  }

  return items;
}

function parseNaverArticleList(html, kind) {
  const listMatch = html.match(/<ul class="headline_list[^"]*">([\s\S]*?)<\/ul>/i);
  if (!listMatch) {
    return [];
  }

  const blocks = listMatch[1].match(/<li(?:\s+tabindex="0")?>[\s\S]*?<\/li>/gi) || [];
  const items = [];

  for (const block of blocks) {
    const anchors = [...block.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((match) => ({
        href: absoluteUrl("https://land.naver.com/news/", match[1]),
        text: stripTags(match[2]),
      }))
      .filter((item) => item.href.includes("n.news.naver.com/article") && item.text);

    const article = anchors[0];
    if (!article) {
      continue;
    }

    const summary = stripTags((block.match(/<dd>([\s\S]*?)<span class="writing">/i) || [null, ""])[1]);
    const sourceName = stripTags((block.match(/<span class="writing">([\s\S]*?)<\/span>/i) || [null, "네이버 뉴스"])[1]);
    const publishedText = stripTags((block.match(/<span class="date">([\s\S]*?)<\/span>/i) || [null, ""])[1]);
    const regionHint =
      kind === "region"
        ? stripTags((block.match(/class="area[^"]*"[^>]*>\s*\[([^\]]+)\]/i) || [null, ""])[1])
        : inferRegionToken(`${article.text} ${summary}`);

    items.push({
      kind,
      title: article.text,
      summary,
      content: summary,
      sourceName,
      sourceUrl: article.href,
      canonicalUrl: article.href,
      regionHint,
      publishedText,
      publishedAt: parseNaverDate(publishedText),
      externalKey: createStableKey(kind, article.href),
    });
  }

  return items;
}

function parseNaverTrendList(html) {
  const rows = [];
  const pattern =
    /<td class="txt"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/td>\s*<td class="num" tabindex="0">([^<]+)<\/td>/gi;

  for (const match of html.matchAll(pattern)) {
    const sourceUrl = absoluteUrl("https://land.naver.com/news/", match[1]);
    const title = stripTags(match[2]);
    const publishedText = stripTags(match[3]);
    rows.push({
      kind: "trend",
      title,
      sourceUrl,
      canonicalUrl: sourceUrl,
      sourceName: "네이버 부동산 동향보고서",
      summary: "",
      content: "",
      regionHint: inferRegionToken(title),
      publishedText,
      publishedAt: parseNaverDate(publishedText),
      externalKey: createStableKey("trend", sourceUrl),
    });
  }

  return rows;
}

function parseNaverTrendDetail(html, entry) {
  const title = stripTags((html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || [null, entry.title])[1]);
  const sourceName = stripTags(
    (html.match(/<span class="write">([\s\S]*?)<\/span>/i) || [null, "네이버 부동산 동향보고서"])[1]
  );
  const publishedText = stripTags(
    (html.match(/<span>\s*(\d{4}\.\d{2}\.\d{2}(?:\s+\d{2}:\d{2})?)\s*<\/span>/i) || [null, entry.publishedText])[1]
  );
  const bodyHtml = (html.match(/<div class="article_body[^"]*" id="report_body"[^>]*>([\s\S]*?)<\/div>/i) || [null, ""])[1];
  const content = clipText(stripTags(bodyHtml), 1400);

  return {
    kind: "trend",
    title,
    summary: extractSummary(content || title, 200),
    content,
    sourceName,
    sourceUrl: entry.sourceUrl,
    canonicalUrl: entry.canonicalUrl,
    regionHint: entry.regionHint,
    publishedText,
    publishedAt: parseNaverDate(publishedText) || entry.publishedAt,
    externalKey: entry.externalKey,
  };
}

function enrichCandidate(candidate) {
  const combined = `${candidate.title} ${candidate.summary} ${candidate.content}`;
  const region = inferRegionParts(candidate.regionHint || inferRegionToken(combined));
  const category = classifyCandidate(candidate);
  return {
    ...candidate,
    category,
    city: region.city,
    district: region.district,
    score: scoreCandidate(candidate, category),
  };
}

function classifyCandidate(candidate) {
  const text = normalizeText(`${candidate.title} ${candidate.summary} ${candidate.content}`);
  const hasLocationSignal = Boolean(candidate.regionHint);

  if (containsAny(text, PRESALE_KEYWORDS)) {
    return "분양정보";
  }

  if (
    containsAny(text, REDEVELOPMENT_KEYWORDS) ||
    (candidate.kind === "region" && hasLocationSignal && /(사업|개발|단지|시공사|착공|구역)/.test(text))
  ) {
    return "정비사업";
  }

  if (candidate.kind === "trend" || containsAny(text, MARKET_KEYWORDS)) {
    return "시장동향";
  }

  return "부동산뉴스";
}

function scoreCandidate(candidate, category) {
  const text = normalizeText(`${candidate.title} ${candidate.summary} ${candidate.content}`);
  let score = 0;

  if (category === "분양정보") score += 8;
  if (category === "정비사업") score += 8;
  if (category === "시장동향") score += 5;
  if (candidate.kind === "trend") score += 2;
  if (candidate.kind === "region") score += 2;
  if (containsAny(text, PRESALE_KEYWORDS)) score += 3;
  if (containsAny(text, REDEVELOPMENT_KEYWORDS)) score += 3;
  if (containsAny(text, MARKET_KEYWORDS)) score += 2;

  if (candidate.publishedAt instanceof Date && Number.isFinite(candidate.publishedAt.getTime())) {
    const ageHours = (Date.now() - candidate.publishedAt.getTime()) / 36e5;
    score += Math.max(0, 12 - ageHours / 4);
  }

  return score;
}

function pickBalancedCandidates(candidates, limit) {
  const sorted = [...candidates].sort((left, right) => right.score - left.score);
  const perCategorySoftLimit = Math.max(1, Math.ceil(limit / 2));
  const counts = new Map(CATEGORY_LABELS.map((category) => [category, 0]));
  const selected = [];
  const selectedKeys = new Set();

  for (const candidate of sorted) {
    const count = counts.get(candidate.category) || 0;
    if (count >= perCategorySoftLimit) {
      continue;
    }
    selected.push(candidate);
    selectedKeys.add(candidate.externalKey);
    counts.set(candidate.category, count + 1);
    if (selected.length >= limit) {
      return selected;
    }
  }

  for (const candidate of sorted) {
    if (selectedKeys.has(candidate.externalKey)) {
      continue;
    }
    selected.push(candidate);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

function dedupeCandidates(candidates) {
  const seenKeys = new Set();
  const seenUrls = new Set();
  const seenTitles = new Set();
  const result = [];

  for (const candidate of candidates) {
    const externalKey = candidate.externalKey || createStableKey(candidate.kind, candidate.canonicalUrl || candidate.title);
    const urlKey = normalizeUrl(candidate.canonicalUrl || candidate.sourceUrl);
    const titleKey = normalizeTitle(candidate.title);

    if (seenKeys.has(externalKey) || (urlKey && seenUrls.has(urlKey)) || (titleKey && seenTitles.has(titleKey))) {
      continue;
    }

    seenKeys.add(externalKey);
    if (urlKey) seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);

    result.push({
      ...candidate,
      externalKey,
    });
  }

  return result;
}

function filterAlreadyPublished(candidates, existingRows) {
  const externalKeys = new Set(existingRows.map((row) => String(row.external_key || "").trim()).filter(Boolean));
  const sourceUrls = new Set(existingRows.map((row) => normalizeUrl(row.source_url)).filter(Boolean));
  const titleKeys = new Set(existingRows.map((row) => normalizeTitle(row.title)).filter(Boolean));

  return candidates.filter((candidate) => {
    const urlKey = normalizeUrl(candidate.canonicalUrl || candidate.sourceUrl);
    const titleKey = normalizeTitle(candidate.title);

    return (
      !externalKeys.has(candidate.externalKey) &&
      !sourceUrls.has(urlKey) &&
      !titleKeys.has(titleKey)
    );
  });
}

function isRecent(candidate) {
  if (!(candidate.publishedAt instanceof Date) || !Number.isFinite(candidate.publishedAt.getTime())) {
    return true;
  }

  const ageHours = (Date.now() - candidate.publishedAt.getTime()) / 36e5;
  const maxAge = candidate.kind === "trend" ? LOOKBACK_HOURS * 8 : LOOKBACK_HOURS;
  return ageHours >= 0 && ageHours <= maxAge;
}

function isRealEstateRelevant(candidate) {
  const text = normalizeText(`${candidate.title} ${candidate.summary} ${candidate.content}`);
  return containsAny(text, RELEVANCE_KEYWORDS);
}

async function summarizeWithAi(candidate) {
  if (NO_AI || !process.env.OPENAI_API_KEY?.trim()) {
    return fallbackSummary(candidate);
  }

  const prompt = [
    "너는 Nuguzip 동네이야기 게시판의 부동산 콘텐츠 편집자다.",
    "공개 기사 제목, 요약, 출처만 바탕으로 짧고 실무적인 한국어 게시글 초안을 만든다.",
    "원문 문장을 길게 복사하지 말고 새 문장으로 요약한다.",
    "확정되지 않은 내용은 '확인 필요'로 표현한다.",
    "반환은 JSON만 한다.",
    "title은 42자 이내, summaryBullets는 3개, whyItMatters는 70자 이내, checkPoints는 3개, tags는 3~5개.",
    `category는 ${CATEGORY_LABELS.join(", ")} 중 하나만 사용한다.`,
    "",
    `제목: ${candidate.title}`,
    `요약: ${candidate.summary || candidate.content || ""}`,
    `출처명: ${candidate.sourceName}`,
    `링크: ${candidate.sourceUrl}`,
    `추정 카테고리: ${candidate.category}`,
    `지역: ${[candidate.city, candidate.district].filter(Boolean).join(" ") || "전국"}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You write concise Korean real-estate community summaries and return strict JSON.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.warn(`[NuguZip] OpenAI failed ${response.status}: ${text.slice(0, 200)}`);
    return fallbackSummary(candidate);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonParse(content);
  if (!parsed) {
    return fallbackSummary(candidate);
  }

  const fallback = fallbackSummary(candidate);
  return {
    ...fallback,
    ...parsed,
    category: CATEGORY_LABELS.includes(parsed.category) ? parsed.category : fallback.category,
    title: clipText(String(parsed.title || fallback.title), 80),
    summaryBullets: normalizeList(parsed.summaryBullets, 3, fallback.summaryBullets),
    whyItMatters: clipText(String(parsed.whyItMatters || fallback.whyItMatters), 120),
    checkPoints: normalizeList(parsed.checkPoints, 3, fallback.checkPoints),
    tags: normalizeTags(parsed.tags).length ? normalizeTags(parsed.tags).slice(0, 5) : fallback.tags,
  };
}

function fallbackSummary(candidate) {
  const category = candidate.category;
  const regionLabel = [candidate.city, candidate.district].filter(Boolean).join(" ") || "전국";
  const cleanSummary = extractSummary(candidate.summary || candidate.content || candidate.title, 120);

  const whyItMatters =
    category === "분양정보"
      ? "분양 일정과 공급 조건을 빠르게 훑어보고 원문 공고 확인 포인트를 잡는 데 도움이 됩니다."
      : category === "정비사업"
        ? "정비사업 진행 단계와 지역 개발 흐름을 파악할 때 먼저 체크할 만한 소식입니다."
        : category === "시장동향"
          ? "정책, 금리, 거래 흐름처럼 의사결정 전에 참고할 시장 신호를 짧게 정리한 내용입니다."
          : "지역과 시장 흐름을 가볍게 훑어보기 좋은 일반 부동산 뉴스입니다.";

  return {
    title: clipText(`[${category}] ${candidate.title}`.replace(/\s+/g, " "), 80),
    category,
    city: candidate.city,
    district: candidate.district,
    summaryBullets: [
      cleanSummary || clipText(candidate.title, 80),
      `${regionLabel} 관점에서 참고할 포인트가 있는 기사입니다.`,
      "세부 조건과 일정은 원문에서 다시 확인해 주세요.",
    ],
    whyItMatters,
    checkPoints: ["원문 기사 확인", "지역 맥락 비교", "정책·일정 재확인"],
    tags: buildTags(candidate),
  };
}

function buildPostRow(candidate, summary) {
  const now = new Date().toISOString();
  const title = clipText(String(summary.title || candidate.title), 90);
  const tags = normalizeTags([
    ...(summary.tags || []),
    summary.category || candidate.category,
    candidate.city,
    candidate.district,
    "AI요약",
    "자동업데이트",
  ]).slice(0, 7);

  return {
    id: crypto.randomUUID(),
    author_label: AUTHOR_LABEL,
    category: summary.category || candidate.category,
    city: summary.city || candidate.city || "전국",
    district: summary.district || candidate.district || "",
    title,
    body: buildBody(summary, candidate),
    tags,
    created_at: now,
    updated_at: now,
    like_count: 0,
    comment_count: 0,
    view_count: 0,
    comments: [],
    visibility: "public",
    notify_comments: false,
    ugc_post_type: "tip",
    source_url: candidate.sourceUrl,
    source_name: candidate.sourceName,
    source_published_at:
      candidate.publishedAt instanceof Date && Number.isFinite(candidate.publishedAt.getTime())
        ? candidate.publishedAt.toISOString()
        : null,
    external_key: candidate.externalKey,
    is_automated: true,
    automation_meta: {
      display_author: AUTHOR_LABEL,
      source_kind: candidate.kind,
      original_title: candidate.title,
      collected_at: now,
      published_text: candidate.publishedText || "",
      region_hint: candidate.regionHint || "",
    },
  };
}

function buildBody(summary, candidate) {
  const bullets = normalizeList(summary.summaryBullets, 3, []).map((item) => `- ${item}`).join("\n");
  const checks = normalizeList(summary.checkPoints, 3, []).map((item) => `- ${item}`).join("\n");
  const published = candidate.publishedAt ? formatAbsoluteKst(candidate.publishedAt) : "게시일 확인 필요";

  return [
    "매일 오전 자동으로 정리되는 부동산 소식입니다.",
    "",
    "### 핵심만 보기",
    bullets,
    "",
    "### 왜 볼 만해?",
    String(summary.whyItMatters || "").trim(),
    "",
    "### 확인할 점",
    checks,
    "",
    `출처: [${candidate.sourceName || "원문"}](${candidate.sourceUrl})`,
    `원문 게시 시각: ${published}`,
    "",
    "※ AI가 공개 기사 정보와 RSS 요약을 바탕으로 재작성했습니다. 청약·투자·계약 판단 전 원문과 공식 공고를 확인하세요.",
  ].join("\n");
}

function buildTags(candidate) {
  const combined = `${candidate.title} ${candidate.summary} ${candidate.content}`;
  const out = [candidate.category, candidate.city, candidate.district];

  for (const keyword of TAG_KEYWORDS) {
    if (combined.includes(keyword)) {
      out.push(keyword);
    }
  }

  return normalizeTags(out).slice(0, 5);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText} ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function pickTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeHtmlEntities(match[1]) : "";
}

function pickLink(xml) {
  const direct = pickTag(xml, "link");
  if (direct) return direct;
  const href = xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return href ? decodeHtmlEntities(href[1]) : "";
}

function stripTags(value = "") {
  return decodeHtmlEntities(
    String(value)
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeHtmlEntities(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)));
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function inferRegionToken(text) {
  const raw = String(text || "");
  const bracketMatch = raw.match(/\[([^\]]+(?:구|시|군|동|읍|면))\]/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }

  for (const token of REGION_TOKENS) {
    if (raw.includes(token)) {
      return token;
    }
  }

  const districtMatch = raw.match(/(?:^|[\s([{"'])([가-힣]{2,12}(?:구|군|동|읍|면))(?:[\s)\]}",'.]|$)/);
  if (districtMatch) {
    return districtMatch[1].trim();
  }

  return "";
}

function inferRegionParts(regionToken) {
  const token = String(regionToken || "").trim();
  if (!token) {
    return { city: "전국", district: "" };
  }

  if (CITY_ALIASES.has(token)) {
    return { city: CITY_ALIASES.get(token), district: "" };
  }

  if (DISTRICT_TO_CITY.has(token)) {
    return { city: DISTRICT_TO_CITY.get(token), district: token.endsWith("구") || token.endsWith("동") ? token : "" };
  }

  if (token.endsWith("시") && token.length >= 2) {
    return { city: token, district: "" };
  }

  if (token.endsWith("구") || token.endsWith("군") || token.endsWith("동") || token.endsWith("읍") || token.endsWith("면")) {
    return { city: "전국", district: token };
  }

  return { city: token, district: "" };
}

function parseNaverDate(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  const match = text.match(/^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour = "09", minute = "00"] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    url.hash = "";
    return url.toString();
  } catch {
    return text;
  }
}

function normalizeTitle(value) {
  return String(value || "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function createStableKey(kind, rawValue) {
  return crypto
    .createHash("sha1")
    .update(`${kind}:${String(rawValue || "").trim()}`)
    .digest("hex");
}

function extractSummary(text, maxLength) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const sentenceBreak = normalized.search(/[.!?]\s|다\.\s/);
  if (sentenceBreak > 0 && sentenceBreak < maxLength) {
    return normalized.slice(0, sentenceBreak + 1).trim();
  }

  return clipText(normalized, maxLength);
}

function clipText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function normalizeList(value, limit, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const list = value
    .map((item) => clipText(String(item || ""), 80))
    .filter(Boolean)
    .slice(0, limit);
  return list.length ? list : fallback;
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function absoluteUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "원문";
  }
}

function formatAbsoluteKst(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return "게시일 확인 필요";
  }

  return date.toLocaleString("ko-KR", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatKstCompact(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return `${values.year}${values.month}${values.day}`;
}
