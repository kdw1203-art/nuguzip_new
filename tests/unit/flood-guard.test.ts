import { strict as assert } from "node:assert";
import test from "node:test";

import {
  DUPE_WINDOW_MS,
  FLOOD_MAX_IN_WINDOW,
  FLOOD_WINDOW_MS,
  judgeFlood,
  normalizeForDupe,
  type RecentPost,
} from "../../lib/community/flood-guard";

const NOW = Date.UTC(2026, 7, 27, 3, 0, 0); // 고정 시각 — 시스템 시계에 의존하지 않는다
const ago = (ms: number) => new Date(NOW - ms).toISOString();

test("최근 글이 없으면 통과", () => {
  assert.deepEqual(judgeFlood({ title: "안녕", body: "동네 이야기" }, [], NOW), {
    ok: true,
  });
});

test("제목·본문이 둘 다 같으면 중복으로 막는다", () => {
  const recent: RecentPost[] = [
    { title: "관양동 시세", body: "요즘 어떤가요?", createdAt: ago(60_000) },
  ];
  const v = judgeFlood({ title: "관양동 시세", body: "요즘 어떤가요?" }, recent, NOW);
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.equal(v.reason, "duplicate");
  assert.match(v.message, /같은 내용/);
});

test("공백·문장부호만 다른 재게시도 같은 글로 본다", () => {
  const recent: RecentPost[] = [
    { title: "관양동 시세", body: "요즘 어떤가요?", createdAt: ago(60_000) },
  ];
  const v = judgeFlood(
    { title: " 관양동  시세 ", body: "요즘 어떤가요!!" },
    recent,
    NOW,
  );
  assert.equal(v.ok, false);
});

test("제목만 같은 것은 막지 않는다 — 흔한 제목이 있다", () => {
  const recent: RecentPost[] = [
    { title: "오늘 시세", body: "강남은 올랐어요", createdAt: ago(60_000) },
  ];
  const v = judgeFlood({ title: "오늘 시세", body: "송파는 내렸어요" }, recent, NOW);
  assert.equal(v.ok, true);
});

test("중복 판정 창(24시간)을 벗어난 같은 글은 다시 쓸 수 있다", () => {
  const recent: RecentPost[] = [
    { title: "봄맞이", body: "산책 좋아요", createdAt: ago(DUPE_WINDOW_MS + 1_000) },
  ];
  assert.equal(judgeFlood({ title: "봄맞이", body: "산책 좋아요" }, recent, NOW).ok, true);
});

test(`10분 안에 ${FLOOD_MAX_IN_WINDOW}건이면 다음 글을 막는다`, () => {
  const recent: RecentPost[] = Array.from({ length: FLOOD_MAX_IN_WINDOW }, (_, i) => ({
    title: `글 ${i}`,
    body: `본문 ${i}`,
    createdAt: ago((i + 1) * 60_000),
  }));
  const v = judgeFlood({ title: "새 글", body: "새 본문" }, recent, NOW);
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.equal(v.reason, "too_many");
  assert.match(v.message, /분 뒤에 다시/);
  assert.ok(v.retryAfterSec > 0);
});

test("창을 벗어난 글은 빈도 계산에서 빠진다", () => {
  const recent: RecentPost[] = [
    { title: "a", body: "1", createdAt: ago(FLOOD_WINDOW_MS + 1_000) },
    { title: "b", body: "2", createdAt: ago(FLOOD_WINDOW_MS + 2_000) },
    { title: "c", body: "3", createdAt: ago(60_000) },
  ];
  assert.equal(judgeFlood({ title: "d", body: "4" }, recent, NOW).ok, true);
});

test("재시도 시각은 가장 오래된 글이 창을 벗어나는 시점이다", () => {
  const oldestAgoMs = 9 * 60_000; // 9분 전 → 1분 뒤 해제
  const recent: RecentPost[] = [
    { title: "a", body: "1", createdAt: ago(oldestAgoMs) },
    { title: "b", body: "2", createdAt: ago(3 * 60_000) },
    { title: "c", body: "3", createdAt: ago(60_000) },
  ];
  const v = judgeFlood({ title: "d", body: "4" }, recent, NOW);
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.equal(v.retryAfterSec, 60);
});

test("ms epoch 로 들어온 시각도 읽는다", () => {
  const recent: RecentPost[] = [
    { title: "x", body: "y", createdAt: NOW - 60_000 },
  ];
  assert.equal(judgeFlood({ title: "x", body: "y" }, recent, NOW).ok, false);
});

test("정규화는 대소문자·제로폭 공백까지 흡수한다", () => {
  assert.equal(normalizeForDupe("Hello  World"), normalizeForDupe("helloworld"));
  assert.equal(normalizeForDupe("가​나"), "가나");
});
