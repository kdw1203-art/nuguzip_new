import { strict as assert } from "node:assert";
import test from "node:test";

import { MAX_POST_IMAGES, postAttachments } from "../../lib/community/attachments";

const withMeta = (attachments: unknown) =>
  ({ automationMeta: { attachments } }) as Parameters<typeof postAttachments>[0];

test("첨부가 없으면 빈 배열", () => {
  assert.deepEqual(postAttachments(null), []);
  assert.deepEqual(postAttachments(undefined), []);
  assert.deepEqual(postAttachments({ automationMeta: undefined }), []);
  assert.deepEqual(postAttachments(withMeta(undefined)), []);
});

test("배열이 아닌 값은 무시한다 — jsonb 라 무엇이든 들어올 수 있다", () => {
  assert.deepEqual(postAttachments(withMeta("https://a.co/x.jpg")), []);
  assert.deepEqual(postAttachments(withMeta({ 0: "https://a.co/x.jpg" })), []);
});

test("https 절대주소와 우리 도메인 상대경로만 남긴다", () => {
  const out = postAttachments(
    withMeta([
      "https://cdn.supabase.co/a.jpg",
      "/storage/b.jpg",
      "http://insecure.example/c.jpg",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "//evil.example/d.jpg",
      "",
      null,
    ]),
  );
  assert.deepEqual(out, ["https://cdn.supabase.co/a.jpg", "/storage/b.jpg"]);
});

test("같은 사진을 두 번 그리지 않는다", () => {
  const out = postAttachments(
    withMeta(["https://a.co/x.jpg", "https://a.co/x.jpg", "https://a.co/y.jpg"]),
  );
  assert.deepEqual(out, ["https://a.co/x.jpg", "https://a.co/y.jpg"]);
});

test(`최대 ${MAX_POST_IMAGES}장에서 자른다`, () => {
  const many = Array.from({ length: 20 }, (_, i) => `https://a.co/${i}.jpg`);
  assert.equal(postAttachments(withMeta(many)).length, MAX_POST_IMAGES);
});

test("앞뒤 공백은 다듬어서 쓴다", () => {
  assert.deepEqual(postAttachments(withMeta(["  https://a.co/x.jpg  "])), [
    "https://a.co/x.jpg",
  ]);
});
