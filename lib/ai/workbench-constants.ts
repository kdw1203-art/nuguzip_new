/** AI 워크벤치용 정적 데이터(실거래 API 연동 전 단계). */

export type TxType = "매매" | "전세" | "월세";

export type WorkbenchComplex = {
  id: string;
  name: string;
  districtId: string;
  districtLabel: string;
  dong: string;
  /** 만원/㎡ 환산 기준 매매 호가(만원) */
  priceSaleMan: number;
  priceJeonMan: number;
  /** ㎡ */
  areaSqm: number;
  /** 준공연도 */
  yearBuilt: number;
  /** 세대수 */
  households: number;
  /** 역세권 점수 0-100 */
  transitScore: number;
  /** 학군 점수 */
  schoolScore: number;
  /** 개발호재 점수 */
  devScore: number;
  /** 유동성(거래량 지수) */
  liquidityIdx: number;
  /** AI 내부 등급 */
  aiGrade: "S" | "A" | "B" | "C";
  /** 연별 예측 가정 상승률 % (매매 5년) */
  trendPct5y: number;
};

export const DISTRICT_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "gangnam", label: "강남구" },
  { id: "seocho", label: "서초구" },
  { id: "songpa", label: "송파구" },
  { id: "mapo", label: "마포구" },
  { id: "yongsan", label: "용산구" },
  { id: "seongdong", label: "성동구" },
  { id: "yangcheon", label: "양천구" },
  { id: "yeongdeungpo", label: "영등포구" },
  { id: "dongjak", label: "동작구" },
  { id: "gwanak", label: "관악구" },
  { id: "eunpyeong", label: "은평구" },
  { id: "gangseo", label: "강서구" },
  { id: "nowon", label: "노원구" },
  { id: "jongno", label: "종로구" },
  { id: "jung", label: "중구" },
  { id: "gwangjin", label: "광진구" },
  { id: "gangdong", label: "강동구" },
  { id: "guro", label: "구로구" },
];

export const WORKBENCH_COMPLEXES: WorkbenchComplex[] = [
  {
    id: "c1",
    name: "은마아파트",
    districtId: "gangnam",
    districtLabel: "강남구",
    dong: "대치동",
    priceSaleMan: 250000,
    priceJeonMan: 135000,
    areaSqm: 76,
    yearBuilt: 1979,
    households: 4386,
    transitScore: 88,
    schoolScore: 96,
    devScore: 92,
    liquidityIdx: 82,
    aiGrade: "A",
    trendPct5y: 28,
  },
  {
    id: "c2",
    name: "래미안 원베일리",
    districtId: "seocho",
    districtLabel: "서초구",
    dong: "반포동",
    priceSaleMan: 420000,
    priceJeonMan: 210000,
    areaSqm: 84,
    yearBuilt: 2016,
    households: 3420,
    transitScore: 90,
    schoolScore: 88,
    devScore: 78,
    liquidityIdx: 76,
    aiGrade: "S",
    trendPct5y: 22,
  },
  {
    id: "c3",
    name: "잠실 엘스",
    districtId: "songpa",
    districtLabel: "송파구",
    dong: "잠실동",
    priceSaleMan: 220000,
    priceJeonMan: 120000,
    areaSqm: 59,
    yearBuilt: 2008,
    households: 2890,
    transitScore: 92,
    schoolScore: 82,
    devScore: 70,
    liquidityIdx: 88,
    aiGrade: "A",
    trendPct5y: 18,
  },
  {
    id: "c4",
    name: "마포래미안푸르지오",
    districtId: "mapo",
    districtLabel: "마포구",
    dong: "아현동",
    priceSaleMan: 165000,
    priceJeonMan: 98000,
    areaSqm: 84,
    yearBuilt: 2004,
    households: 1820,
    transitScore: 86,
    schoolScore: 78,
    devScore: 88,
    liquidityIdx: 80,
    aiGrade: "A",
    trendPct5y: 24,
  },
  {
    id: "c5",
    name: "한남 더힐",
    districtId: "yongsan",
    districtLabel: "용산구",
    dong: "한남동",
    priceSaleMan: 480000,
    priceJeonMan: 220000,
    areaSqm: 112,
    yearBuilt: 2012,
    households: 600,
    transitScore: 72,
    schoolScore: 80,
    devScore: 90,
    liquidityIdx: 58,
    aiGrade: "S",
    trendPct5y: 20,
  },
  {
    id: "c6",
    name: "성수 트리마제",
    districtId: "seongdong",
    districtLabel: "성동구",
    dong: "성수동",
    priceSaleMan: 195000,
    priceJeonMan: 105000,
    areaSqm: 59,
    yearBuilt: 2021,
    households: 980,
    transitScore: 84,
    schoolScore: 74,
    devScore: 86,
    liquidityIdx: 90,
    aiGrade: "A",
    trendPct5y: 26,
  },
  {
    id: "c7",
    name: "목동 파크자이",
    districtId: "yangcheon",
    districtLabel: "양천구",
    dong: "목동",
    priceSaleMan: 178000,
    priceJeonMan: 92000,
    areaSqm: 84,
    yearBuilt: 2006,
    households: 2200,
    transitScore: 80,
    schoolScore: 88,
    devScore: 84,
    liquidityIdx: 78,
    aiGrade: "A",
    trendPct5y: 21,
  },
  {
    id: "c8",
    name: "여의도 자이",
    districtId: "yeongdeungpo",
    districtLabel: "영등포구",
    dong: "여의도동",
    priceSaleMan: 310000,
    priceJeonMan: 165000,
    areaSqm: 84,
    yearBuilt: 2008,
    households: 3100,
    transitScore: 94,
    schoolScore: 76,
    devScore: 82,
    liquidityIdx: 72,
    aiGrade: "A",
    trendPct5y: 17,
  },
  {
    id: "c9",
    name: "흑석 아크로리버파크",
    districtId: "dongjak",
    districtLabel: "동작구",
    dong: "흑석동",
    priceSaleMan: 142000,
    priceJeonMan: 78000,
    areaSqm: 59,
    yearBuilt: 2014,
    households: 1500,
    transitScore: 78,
    schoolScore: 80,
    devScore: 80,
    liquidityIdx: 84,
    aiGrade: "B",
    trendPct5y: 19,
  },
  {
    id: "c10",
    name: "신림 푸르지오",
    districtId: "gwanak",
    districtLabel: "관악구",
    dong: "신림동",
    priceSaleMan: 88000,
    priceJeonMan: 52000,
    areaSqm: 59,
    yearBuilt: 2005,
    households: 2600,
    transitScore: 82,
    schoolScore: 70,
    devScore: 62,
    liquidityIdx: 86,
    aiGrade: "B",
    trendPct5y: 14,
  },
  {
    id: "c11",
    name: "불광 롯데캐슬",
    districtId: "eunpyeong",
    districtLabel: "은평구",
    dong: "불광동",
    priceSaleMan: 112000,
    priceJeonMan: 68000,
    areaSqm: 84,
    yearBuilt: 2007,
    households: 1400,
    transitScore: 88,
    schoolScore: 72,
    devScore: 74,
    liquidityIdx: 80,
    aiGrade: "B",
    trendPct5y: 16,
  },
  {
    id: "c12",
    name: "마곡 힐스테이트",
    districtId: "gangseo",
    districtLabel: "강서구",
    dong: "마곡동",
    priceSaleMan: 125000,
    priceJeonMan: 72000,
    areaSqm: 84,
    yearBuilt: 2019,
    households: 1800,
    transitScore: 86,
    schoolScore: 74,
    devScore: 88,
    liquidityIdx: 88,
    aiGrade: "A",
    trendPct5y: 20,
  },
];

export function complexById(id: string): WorkbenchComplex | undefined {
  return WORKBENCH_COMPLEXES.find((c) => c.id === id);
}

/** RTMS/MOLIT 우선 단지 검색 — API 실패 시 로컬 mock 폴백 */
export async function searchWorkbenchComplexes(
  query: string,
  districtLabel?: string,
): Promise<WorkbenchComplex[]> {
  const q = query.trim().toLowerCase();
  if (!q) return WORKBENCH_COMPLEXES.slice(0, 6);
  const local = WORKBENCH_COMPLEXES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (districtLabel ? c.districtLabel.includes(districtLabel) : false) ||
      c.dong.includes(q),
  );
  if (typeof window === "undefined") {
    return local.length ? local : WORKBENCH_COMPLEXES.slice(0, 4);
  }
  try {
    const params = new URLSearchParams({ q: query, limit: "8" });
    if (districtLabel) params.set("district", districtLabel);
    const res = await fetch(`/api/public-data/national/molit-geocoder?${params}`);
    if (res.ok) {
      const json = (await res.json()) as {
        items?: Array<{ aptName?: string; address?: string; district?: string }>;
      };
      const fromApi = (json.items ?? [])
        .filter((it) => it.aptName)
        .map((it, i) => {
          const match = WORKBENCH_COMPLEXES.find((c) => c.name.includes(it.aptName!.slice(0, 4)));
          if (match) return match;
          return {
            id: `rtms-${i}`,
            name: it.aptName!,
            districtId: "unknown",
            districtLabel: it.district ?? districtLabel ?? "—",
            dong: it.address ?? "",
            priceSaleMan: 0,
            priceJeonMan: 0,
            areaSqm: 84,
            yearBuilt: 2000,
            households: 0,
            transitScore: 70,
            schoolScore: 70,
            devScore: 65,
            liquidityIdx: 70,
            aiGrade: "B" as const,
            trendPct5y: 0,
          } satisfies WorkbenchComplex;
        });
      if (fromApi.length) return fromApi;
    }
  } catch {
    /* fallback */
  }
  return local.length ? local : WORKBENCH_COMPLEXES.slice(0, 4);
}

export function jeonseRatio(c: WorkbenchComplex): number {
  if (!c.priceSaleMan) return 0;
  return (c.priceJeonMan / c.priceSaleMan) * 100;
}

export function compositeScore(c: WorkbenchComplex): number {
  return Math.round(
    c.transitScore * 0.22 +
      c.schoolScore * 0.2 +
      c.devScore * 0.22 +
      c.liquidityIdx * 0.18 +
      Math.min(100, jeonseRatio(c) * 1.2) * 0.18,
  );
}

export type TimingRow = {
  districtId: string;
  region: string;
  signal: "BUY" | "HOLD" | "WAIT" | "SELL";
  strength: number;
  priceVs5yAvgPct: number;
  volumeTrendPct: number;
  note: string;
  catalyst: string;
};

export const TIMING_FULL: TimingRow[] = [
  { districtId: "gangnam", region: "강남구", signal: "BUY", strength: 82, priceVs5yAvgPct: -2.1, volumeTrendPct: 22, note: "재건축·학군 이중 모멘텀", catalyst: "대치·개포 재건축 속도" },
  { districtId: "seocho", region: "서초구", signal: "BUY", strength: 76, priceVs5yAvgPct: 1.2, volumeTrendPct: 15, note: "신축 프리미엄 유지", catalyst: "반포 한강뷰 라인" },
  { districtId: "songpa", region: "송파구", signal: "HOLD", strength: 58, priceVs5yAvgPct: 0.4, volumeTrendPct: 8, note: "입주 물량 소화 구간", catalyst: "올림픽파크 일대" },
  { districtId: "mapo", region: "마포구", signal: "BUY", strength: 71, priceVs5yAvgPct: -4.8, volumeTrendPct: 14, note: "재개발·GTX 기대", catalyst: "아현·공덕" },
  { districtId: "yongsan", region: "용산구", signal: "HOLD", strength: 61, priceVs5yAvgPct: 3.5, volumeTrendPct: 5, note: "기대감 선반영", catalyst: "용산정비창" },
  { districtId: "seongdong", region: "성동구", signal: "BUY", strength: 74, priceVs5yAvgPct: -3.2, volumeTrendPct: 19, note: "성수·왕십리 라인", catalyst: "왕십리역세권" },
  { districtId: "yangcheon", region: "양천구", signal: "BUY", strength: 69, priceVs5yAvgPct: -3.9, volumeTrendPct: 12, note: "목동 재건축", catalyst: "목동타운" },
  { districtId: "yeongdeungpo", region: "영등포구", signal: "BUY", strength: 67, priceVs5yAvgPct: -2.8, volumeTrendPct: 11, note: "여의도·신길", catalyst: "재건축 추진" },
  { districtId: "dongjak", region: "동작구", signal: "BUY", strength: 64, priceVs5yAvgPct: -3.5, volumeTrendPct: 10, note: "흑석·노량진", catalyst: "한강 라인" },
  { districtId: "gwanak", region: "관악구", signal: "WAIT", strength: 42, priceVs5yAvgPct: -6.2, volumeTrendPct: -4, note: "수요 둔화 구간", catalyst: "신림선 완만" },
  { districtId: "eunpyeong", region: "은평구", signal: "HOLD", strength: 53, priceVs5yAvgPct: -4.1, volumeTrendPct: 4, note: "GTX 기대 부분 반영", catalyst: "불광·응암" },
  { districtId: "gangseo", region: "강서구", signal: "HOLD", strength: 55, priceVs5yAvgPct: -1.9, volumeTrendPct: 6, note: "마곡 성숙기", catalyst: "업무·주거 혼합" },
  { districtId: "nowon", region: "노원구", signal: "WAIT", strength: 38, priceVs5yAvgPct: -7.1, volumeTrendPct: -5, note: "학군 프리미엄 약화 우려", catalyst: "노후 단지 다수" },
  { districtId: "jongno", region: "종로구", signal: "HOLD", strength: 54, priceVs5yAvgPct: -1.2, volumeTrendPct: 7, note: "도심 재개발 장기", catalyst: "세운상가 일대" },
  { districtId: "jung", region: "중구", signal: "HOLD", strength: 52, priceVs5yAvgPct: -2.0, volumeTrendPct: 6, note: "오피스 밸런스", catalyst: "을지로·명동" },
  { districtId: "gwangjin", region: "광진구", signal: "HOLD", strength: 56, priceVs5yAvgPct: 0.2, volumeTrendPct: 5, note: "한강 접근 대비 적정", catalyst: "자양·구의" },
  { districtId: "gangdong", region: "강동구", signal: "HOLD", strength: 54, priceVs5yAvgPct: -0.8, volumeTrendPct: 5, note: "대단지 입주 물량", catalyst: "고덕·상일" },
  { districtId: "guro", region: "구로구", signal: "WAIT", strength: 41, priceVs5yAvgPct: -5.5, volumeTrendPct: -2, note: "직주근접 한계", catalyst: "디지털단지 인근" },
];

export type EconomyRow = {
  id: string;
  name: string;
  value: string;
  change: string;
  trend: "up" | "down" | "flat";
  impact: "긍정" | "부정" | "중립";
  desc: string;
};

export const ECONOMY_FULL: EconomyRow[] = [
  { id: "e1", name: "기준금리", value: "3.00%", change: "-0.25%p", trend: "down", impact: "긍정", desc: "금리 인하 사이클 진입" },
  { id: "e2", name: "주담대 금리", value: "3.85%", change: "-0.15%p", trend: "down", impact: "긍정", desc: "대출 금리 하락 국면" },
  { id: "e3", name: "CPI(전년)", value: "2.8%", change: "-0.3%p", trend: "down", impact: "긍정", desc: "물가 안정 → 금리 정책 여지" },
  { id: "e4", name: "가계부채 증가율", value: "+5.2%", change: "+0.8%p", trend: "up", impact: "부정", desc: "DSR·가계부담 지표 부담" },
  { id: "e5", name: "서울 아파트 거래량", value: "4,821건", change: "+18.3%", trend: "up", impact: "긍정", desc: "거래 심리 회복 신호" },
  { id: "e6", name: "전국 미분양", value: "68,247호", change: "+2,341", trend: "up", impact: "부정", desc: "지역별 공급 과잉 압력" },
  {
    id: "e_kb",
    name: "KB 선행지수",
    value: "102.8",
    change: "+1.2",
    trend: "up",
    impact: "긍정",
    desc: "부동산 시장 선행 회복 신호",
  },
  { id: "e7", name: "USD/KRW", value: "1,312원", change: "-18원", trend: "down", impact: "중립", desc: "외국인 매수심리 소폭 개선" },
  { id: "e8", name: "국고채 3년", value: "2.91%", change: "-0.08%p", trend: "down", impact: "긍정", desc: "자금조달 비용 하락" },
  { id: "e9", name: "실업률", value: "2.7%", change: "0.0%p", trend: "flat", impact: "중립", desc: "고용 안정" },
  { id: "e10", name: "건설사업 지수", value: "98.2", change: "+0.4", trend: "up", impact: "중립", desc: "분양·착공 소폭 회복" },
  { id: "e11", name: "전국 전세가율", value: "55.2%", change: "-0.6%p", trend: "down", impact: "부정", desc: "갭투자 매력은 있으나 금리 리스크" },
  { id: "e12", name: "KB 매수심리", value: "68.5", change: "+2.1", trend: "up", impact: "긍정", desc: "매수 우위 심화" },
];

/** 경제지표 모니터 상단 그리드(피그마 8카드 순서) */
export const ECONOMY_MONITOR_CARD_IDS = [
  "e1",
  "e6",
  "e_kb",
  "e4",
  "e2",
  "e5",
  "e7",
  "e3",
] as const;

export type EconomyThermometerGauge = {
  id: string;
  label: string;
  value: number;
  caption: string;
  accent: "emerald" | "amber" | "sky" | "indigo";
};

/** 부동산 시장 온도계(샘플 — API 연동 시 갱신) */
export const ECONOMY_THERMOMETER: EconomyThermometerGauge[] = [
  { id: "t1", label: "금리 환경", value: 72, caption: "우호적", accent: "emerald" },
  { id: "t2", label: "수급 균형", value: 48, caption: "공급 과잉", accent: "amber" },
  { id: "t3", label: "투자 심리", value: 65, caption: "회복 중", accent: "sky" },
  { id: "t4", label: "종합 온도", value: 62, caption: "보통+", accent: "indigo" },
];

export function economyRowsByMonitorOrder(): EconomyRow[] {
  const m = new Map(ECONOMY_FULL.map((e) => [e.id, e]));
  return ECONOMY_MONITOR_CARD_IDS.map((id) => m.get(id)).filter(Boolean) as EconomyRow[];
}

export type ChecklistCategory = {
  id: string;
  title: string;
  weight: number;
  items: Array<{ id: string; label: string; weight: number }>;
};

export const CHECKLIST_FULL: ChecklistCategory[] = [
  {
    id: "cat1",
    title: "입지·교통",
    weight: 28,
    items: [
      { id: "i1", label: "지하철 도보 10분 이내(환승역 포함)", weight: 8 },
      { id: "i2", label: "광역버스·GTX 등 광역 교통", weight: 5 },
      { id: "i3", label: "주요 업무지구 30분 이내", weight: 5 },
      { id: "i4", label: "학·병원·마트 생활권", weight: 4 },
      { id: "i36", label: "버스·승용 접근·정류장·IC 거리", weight: 3 },
      { id: "i37", label: "간선도로·철도 소음·미세먼지 거리 검토", weight: 3 },
    ],
  },
  {
    id: "cat2",
    title: "단지·물리",
    weight: 24,
    items: [
      { id: "i5", label: "세대당 주차 1.0대 이상", weight: 5 },
      { id: "i6", label: "난방·누수·외벽 등 하자 이력 낮음", weight: 4 },
      { id: "i7", label: "커뮤니티·보안 시설 충실", weight: 5 },
      { id: "i8", label: "층간소음·일조 검토 완료", weight: 4 },
      { id: "i38", label: "동·층·향 채광·통풍 현장 확인", weight: 3 },
      { id: "i39", label: "발코니·확장·베란다 구조 적법 여부", weight: 3 },
    ],
  },
  {
    id: "cat3",
    title: "학군·거주",
    weight: 24,
    items: [
      { id: "i9", label: "통학 동선·학교 밀집도", weight: 6 },
      { id: "i10", label: "학원가·돌봄 인프라", weight: 5 },
      { id: "i11", label: "공원·저소음 환경", weight: 4 },
      { id: "i12", label: "재난·침수 이력 없음", weight: 3 },
      { id: "i40", label: "배정 학교·학군 정책 변동 리스크", weight: 3 },
      { id: "i41", label: "주차·유모차 동선·엘리베이터 대기", weight: 3 },
    ],
  },
  {
    id: "cat4",
    title: "투자·수익",
    weight: 30,
    items: [
      { id: "i13", label: "전세가율·임대수익률 목표치 충족", weight: 7 },
      { id: "i14", label: "재건축·리모델링 파이프라인", weight: 7 },
      { id: "i15", label: "주변 호재(도시정비·상업) 가시화", weight: 6 },
      { id: "i16", label: "실거래 추세·회전율 양호", weight: 4 },
      { id: "i42", label: "급매·호가 스프레드·협상 여지", weight: 3 },
      { id: "i43", label: "분양·입주 물량 시점과의 겹침", weight: 3 },
    ],
  },
  {
    id: "cat5",
    title: "리스크·대출",
    weight: 23,
    items: [
      { id: "i17", label: "규제지역·LTV·DSR 여유", weight: 6 },
      { id: "i18", label: "금리 상승 시 상환 시나리오", weight: 5 },
      { id: "i19", label: "공급 과잉·분양 물량 점검", weight: 4 },
      { id: "i20", label: "세금(취득세·보유세) 시뮬 완료", weight: 3 },
      { id: "i21", label: "스트레스 금리(+2%p) 상환액 재계산", weight: 3 },
      { id: "i22", label: "중도상환 수수료·만기 구조 확인", weight: 2 },
    ],
  },
  {
    id: "cat6",
    title: "관리비·운영",
    weight: 16,
    items: [
      { id: "i23", label: "관리비 항목·인상 이력 확인", weight: 4 },
      { id: "i24", label: "장기수선충당금·외벽·지붕 공사 계획", weight: 4 },
      { id: "i25", label: "엘리베이터·기계식 주차 유지 상태", weight: 3 },
      { id: "i26", label: "경비·CCTV·출입 통제 운영 방식", weight: 3 },
      { id: "i27", label: "입주민 민원·분쟁 공개 채널 확인", weight: 2 },
    ],
  },
  {
    id: "cat7",
    title: "법률·등기·특약",
    weight: 16,
    items: [
      { id: "i28", label: "등기부등본 근저당·가압류·가처분 여부", weight: 5 },
      { id: "i29", label: "건축물대장 용도·위반·불법 확장 여부", weight: 4 },
      { id: "i30", label: "매도인·임대인 권원 관계(소유권) 확인", weight: 3 },
      { id: "i31", label: "계약서 특약(하자·환불·위약금) 검토", weight: 4 },
    ],
  },
  {
    id: "cat8",
    title: "입주·거래 절차",
    weight: 14,
    items: [
      { id: "i32", label: "잔금일·이사 일정·열쇠 인수 절차", weight: 4 },
      { id: "i33", label: "확정일자·전입신고(전·월세) 일정", weight: 4 },
      { id: "i34", label: "중개보수·실비 정산 범위 확인", weight: 3 },
      { id: "i35", label: "하자 검수 체크리스트·담당 연락처", weight: 3 },
    ],
  },
];

export type RiskBlock = {
  id: string;
  title: string;
  score: number;
  summary: string;
  factors: Array<{ name: string; level: string; note: string; tone: "bad" | "mid" | "good" }>;
};

export const RISK_BLOCKS: RiskBlock[] = [
  {
    id: "r1",
    title: "정책·세제",
    score: 38,
    summary: "DSR·규제지역·보유세 부담이 중간 수준입니다. 거주 목적이면 일부 완화 요인이 있습니다.",
    factors: [
      { name: "DSR 40% 규제", level: "높음", note: "추가 대출 여력 제한", tone: "bad" },
      { name: "규제지역 LTV", level: "보통", note: "실수요 완화 일부 반영", tone: "mid" },
      { name: "보유세(공시가)", level: "보통", note: "고가주택 구간 주의", tone: "mid" },
      { name: "분양가상한제", level: "보통", note: "분양 시장 심리에 영향", tone: "mid" },
    ],
  },
  {
    id: "r2",
    title: "금리·금융",
    score: 28,
    summary: "금리 인하 기대가 유입되나, 가계부채 지표는 여전히 부담 요인입니다.",
    factors: [
      { name: "기준금리", level: "낮음", note: "인하 사이클", tone: "good" },
      { name: "주담대 금리", level: "보통", note: "고정금 전환 검토 가치", tone: "mid" },
      { name: "스트레스 금리", level: "높음", note: "+2%p 상승 시 상환액 점검", tone: "bad" },
      { name: "전세자금 대출", level: "보통", note: "만기 연장 리스크", tone: "mid" },
    ],
  },
  {
    id: "r3",
    title: "공급·시장",
    score: 46,
    summary: "수도권 일부 지역은 입주·미분양 압력이 있으나, 핵심 입지는 흡수력이 유지됩니다.",
    factors: [
      { name: "입주 물량", level: "높음", note: "2026 수도권 다소 집중", tone: "bad" },
      { name: "미분양", level: "보통", note: "지역별 편차 큼", tone: "mid" },
      { name: "거래량 회복", level: "낮음", note: "서울 매수심리 개선", tone: "good" },
      { name: "외국인·기관 수요", level: "낮음", note: "핵심지역 순매수 전환", tone: "good" },
    ],
  },
  {
    id: "r4",
    title: "지역·입지",
    score: 22,
    summary: "선택한 관심 구와 단지 입지 점수를 결합해 산출합니다. (개인화 반영)",
    factors: [
      { name: "직주근접", level: "보통", note: "출퇴근 시간·비용 시뮬", tone: "mid" },
      { name: "학군·생활", level: "낮음", note: "목표 학년·통학거리", tone: "good" },
      { name: "재해·환경", level: "낮음", note: "침수·소음 지도 확인", tone: "good" },
      { name: "개발 호재 현황", level: "보통", note: "사업 타임라인 검증", tone: "mid" },
    ],
  },
];

export type RiskTierKey = "safe" | "normal" | "caution" | "danger";

export function riskScoreTier(score: number): { key: RiskTierKey; label: string } {
  if (score <= 28) return { key: "safe", label: "안전" };
  if (score <= 42) return { key: "normal", label: "보통" };
  if (score <= 50) return { key: "caution", label: "주의" };
  return { key: "danger", label: "위험" };
}

export type RiskDashboardAxis = {
  id: string;
  label: string;
  score: number;
  block: RiskBlock;
};

/** 피그마 5축 스코어 — RISK_BLOCKS 기반 + 조건·프로필 보정 */
export function computeRiskDashboardScores(opts: {
  riskModifier: number;
  txType: TxType;
  horizonYears: number;
  regionLabels: string[];
}): { axes: RiskDashboardAxis[]; composite: number } {
  const byId = Object.fromEntries(RISK_BLOCKS.map((b) => [b.id, b])) as Record<string, RiskBlock>;
  const r1 = byId.r1.score;
  const r2 = byId.r2.score;
  const r3 = byId.r3.score;
  const r4 = byId.r4.score;

  const bases: Record<string, number> = {
    policy: Math.max(0, r1 - 3),
    supply: Math.min(56, r3 + 2),
    rates: Math.max(0, r2 - 3),
    market: Math.max(26, r3 - 8),
    region: Math.max(12, r4 - 2),
  };

  const axisDefs: Array<{ id: string; label: string; block: RiskBlock }> = [
    { id: "policy", label: "정책 리스크", block: byId.r1 },
    { id: "supply", label: "공급 리스크", block: byId.r3 },
    { id: "rates", label: "금리 리스크", block: byId.r2 },
    { id: "market", label: "시장 리스크", block: byId.r3 },
    { id: "region", label: "지역 리스크", block: byId.r4 },
  ];

  const labels = opts.regionLabels.map((s) => s.trim()).filter(Boolean);
  const count = labels.length;
  const premium = labels.some((l) => /강남|서초/.test(l));

  const axes: RiskDashboardAxis[] = axisDefs.map((d) => {
    let s = bases[d.id]! + opts.riskModifier;
    if (d.id === "supply" || d.id === "market") {
      s += (opts.horizonYears - 1) * 2;
    }
    if (opts.txType === "전세") {
      if (d.id === "policy") s += 4;
      if (d.id === "rates") s -= 6;
    }
    if (opts.txType === "월세") {
      if (d.id === "rates") s += 3;
    }
    if (d.id === "region") {
      if (premium) s = Math.max(10, s - 8);
      if (count === 0) s += 3;
      if (count > 3) s += 5;
    }
    if (d.id === "market" && premium) s += 4;
    if (d.id === "supply" && count > 2) s += 2;
    s = Math.round(Math.min(100, Math.max(0, s)));
    return { id: d.id, label: d.label, score: s, block: d.block };
  });

  const composite = Math.round(axes.reduce((acc, a) => acc + a.score, 0) / axes.length);
  return { axes, composite };
}
