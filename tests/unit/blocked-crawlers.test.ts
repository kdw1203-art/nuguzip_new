import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOCKED_CRAWLERS, isBlockedCrawler } from "../../lib/security/blocked-crawlers";

/* [950] 봇 정책 표 — 검색엔진·공유 미리보기·AI 검색 봇은 절대 표에 없어야 한다.
   표에 이름이 잘못 들어가면 색인 유입이 통째로 끊긴다. */
const MUST_ALLOW = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/faq/15/4118.html)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33984",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36",
  "curl/8.5.0",
];

test("검색엔진·공유 미리보기·AI 검색·사람·curl 은 차단하지 않는다", () => {
  for (const ua of MUST_ALLOW) assert.equal(isBlockedCrawler(ua), false, ua);
});

test("표의 모든 봇은 실제 UA 문자열 형태로 차단된다", () => {
  for (const name of BLOCKED_CRAWLERS) {
    assert.equal(isBlockedCrawler(`Mozilla/5.0 (compatible; ${name}/7.0; +http://example.test/bot)`), true, name);
    assert.equal(isBlockedCrawler(name.toLowerCase()), true, `${name} 소문자`);
  }
});

test("빈 UA 는 차단하지 않는다(정상 사용자·프록시 가능성)", () => {
  assert.equal(isBlockedCrawler(null), false);
  assert.equal(isBlockedCrawler(""), false);
});
