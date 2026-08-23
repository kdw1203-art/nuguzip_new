import { expect, test } from "@playwright/test";
import {
  clusterNews,
  relatedInCluster,
  sameEventTitles,
} from "../../lib/news/cluster";

/* [#67] 뉴스 클러스터링 순수 함수 회귀 — 서버 불필요(페이지를 열지 않는다).
   실측 유형의 제목 변형(조사·괄호·어순)이 묶이고, 무관 기사는 묶이지 않아야 한다. */

const H = 3600_000;
const t0 = Date.parse("2026-08-20T00:00:00Z");

test("같은 발표의 제목 변형은 같은 사건", () => {
  expect(
    sameEventTitles(
      "정부, 9·7 공급대책 발표…수도권 13만가구",
      "'9·7 대책' 발표에 수도권 공급 13만가구 풀린다",
    ),
  ).toBe(true);
  expect(
    sameEventTitles(
      "[단독] 강남 재건축 초과이익 환수 완화 검토",
      "강남 재건축 초과이익 환수제 완화 검토 착수",
    ),
  ).toBe(true);
});

test("무관·유사 주제는 다른 사건", () => {
  expect(
    sameEventTitles(
      "정부, 9·7 공급대책 발표…수도권 13만가구",
      "8월 서울 아파트 거래량 두 달 연속 감소",
    ),
  ).toBe(false);
  // 겹침 3토큰("서울 아파트 거래량")짜리 유사 주제 — 묶이면 안 됨 (임계 근거)
  expect(
    sameEventTitles(
      "서울 아파트 거래량 두 달 연속 감소",
      "서울 아파트 전세 거래량 급증",
    ),
  ).toBe(false);
});

test("클러스터: 변형 3건 묶임 + 무관 1건 분리 + 최신이 대표", () => {
  const items = [
    { id: "a", title: "정부, 9·7 공급대책 발표…수도권 13만가구", timeMs: t0 },
    { id: "b", title: "'9·7 대책' 발표에 수도권 공급 13만가구 풀린다", timeMs: t0 + 2 * H },
    { id: "c", title: "9·7 공급대책 발표 — 수도권 13만가구 공급", timeMs: t0 + 5 * H },
    { id: "d", title: "8월 서울 아파트 거래량 두 달 연속 감소", timeMs: t0 + H },
  ];
  const clusters = clusterNews(items);
  expect(clusters).toHaveLength(2);
  const big = clusters.find((c) => c.related.length > 0)!;
  expect(big.primary.id).toBe("c"); // 최신 기사가 대표
  expect(new Set(big.related.map((r) => r.id))).toEqual(new Set(["a", "b"]));
});

test("시간창(72h) 밖이면 같은 제목도 다른 사건", () => {
  const items = [
    { id: "a", title: "국토부 전세 사기 대책 발표", timeMs: t0 },
    { id: "b", title: "국토부 전세 사기 대책 발표", timeMs: t0 + 80 * H },
  ];
  expect(clusterNews(items)).toHaveLength(2);
});

test("relatedInCluster: 구성원 기준으로 나머지를 돌려준다", () => {
  const items = [
    { id: "a", title: "정부, 9·7 공급대책 발표…수도권 13만가구", timeMs: t0 },
    { id: "b", title: "'9·7 대책' 발표에 수도권 공급 13만가구 풀린다", timeMs: t0 + 2 * H },
  ];
  const relFromOlder = relatedInCluster(items, "a");
  expect(relFromOlder.map((r) => r.id)).toEqual(["b"]);
  const relFromPrimary = relatedInCluster(items, "b");
  expect(relFromPrimary.map((r) => r.id)).toEqual(["a"]);
});
