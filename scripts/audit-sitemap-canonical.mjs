#!/usr/bin/env node
/**
 * 사이트맵 ↔ canonical 정합성 감사
 * ---------------------------------------------------------------------------
 * 사이트맵에 제출한 URL 과 그 페이지가 선언하는 <link rel="canonical"> 이
 * 다르면, 구글은 제출 URL 을 "대체 페이지"로 처리하고 색인하지 않는다.
 * 이 스크립트는 그 불일치율과 noindex 비율을 표본으로 실측한다.
 *
 * 사용:
 *   node scripts/audit-sitemap-canonical.mjs                 # 기본 표본 40
 *   node scripts/audit-sitemap-canonical.mjs --n 100         # 표본 수 지정
 *   node scripts/audit-sitemap-canonical.mjs --map complexes,regions,pairs
 *   node scripts/audit-sitemap-canonical.mjs --origin http://localhost:3000
 *
 * 종료코드: 불일치가 하나라도 있으면 1 → CI 게이트로 쓸 수 있다.
 */

const args = process.argv.slice(2)
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}

const ORIGIN = (opt('origin', 'https://nuguzip.com')).replace(/\/$/, '')
const SAMPLE = parseInt(opt('n', '40'), 10)
const MAPS = opt('map', 'complexes,regions,pairs,tx,temperature,glossary,pages')
  .split(',').map((s) => s.trim()).filter(Boolean)
const CONCURRENCY = parseInt(opt('c', '6'), 10)

const UA = 'nuguzip-seo-audit/1.0 (+https://nuguzip.com)'

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' })
  return { status: res.status, finalUrl: res.url, body: await res.text() }
}

function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
}

function pick(arr, n) {
  if (arr.length <= n) return arr
  const step = arr.length / n
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)])
}

const canonicalOf = (html) =>
  (html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
   html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i) || [])[1] || null

const robotsOf = (html) =>
  (html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["']/i) || [])[1] || ''

const norm = (u) => { try { return decodeURIComponent(new URL(u).toString()) } catch { return u } }

async function pool(items, worker) {
  const out = []
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (i < items.length) out.push(await worker(items[i++]))
    }),
  )
  return out
}

const results = []

for (const map of MAPS) {
  const smUrl = `${ORIGIN}/sitemap-${map}.xml`
  let urls
  try {
    const { status, body } = await get(smUrl)
    if (status !== 200) { console.log(`\n[${map}] 사이트맵 HTTP ${status} — 건너뜀`); continue }
    urls = locs(body)
  } catch (e) {
    console.log(`\n[${map}] 사이트맵 요청 실패: ${e.message}`); continue
  }

  const sample = pick(urls, SAMPLE)
  process.stdout.write(`\n[${map}] 전체 ${urls.length}개 중 ${sample.length}개 표본 검사 `)

  const rows = await pool(sample, async (u) => {
    try {
      const { status, body } = await get(u)
      const can = canonicalOf(body)
      const robots = robotsOf(body)
      process.stdout.write('.')
      return {
        map, url: u, status, canonical: can, robots,
        mismatch: !!can && norm(can) !== norm(u),
        noindex: /noindex/i.test(robots),
        missingCanonical: !can,
      }
    } catch (e) {
      process.stdout.write('x')
      return { map, url: u, status: 0, error: e.message }
    }
  })

  const mis = rows.filter((r) => r.mismatch)
  const ni = rows.filter((r) => r.noindex)
  const nc = rows.filter((r) => r.missingCanonical)
  const err = rows.filter((r) => r.status !== 200)

  console.log(
    `\n  총 ${urls.length.toLocaleString()}개 / 표본 ${rows.length}` +
    `\n  canonical 불일치 : ${mis.length} (${(mis.length / rows.length * 100).toFixed(0)}%)` +
    (mis.length ? `  → 추정 영향 약 ${Math.round(urls.length * mis.length / rows.length).toLocaleString()}개 URL` : '') +
    `\n  noindex          : ${ni.length}` +
    `\n  canonical 없음   : ${nc.length}` +
    `\n  비200 응답       : ${err.length}`,
  )

  mis.slice(0, 3).forEach((r) => {
    console.log(`   ✗ 제출 : ${r.url}\n     표준 : ${r.canonical}`)
  })

  results.push(...rows)
}

const totalMis = results.filter((r) => r.mismatch).length
console.log(`\n${'─'.repeat(60)}`)
console.log(`표본 합계 ${results.length}건 중 canonical 불일치 ${totalMis}건`)
console.log(totalMis === 0
  ? '✅ 통과 — 사이트맵과 canonical 이 일치합니다.'
  : '❌ 실패 — 사이트맵이 비표준 URL 을 제출하고 있습니다. lib/seo/complex-url.ts 로 일원화하세요.')

process.exit(totalMis === 0 ? 0 : 1)
