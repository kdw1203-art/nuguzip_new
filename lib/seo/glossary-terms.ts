/**
 * N14 — 부동산 용어사전 데이터 (개별 URL 승격용).
 *
 * 왜 모듈로 뺐나: 정의형 롱테일("전세가율이란", "전용면적 뜻")은 URL 단위로
 * 수확해야 한다. 한 페이지 안의 앵커(#jeonse-ratio)는 검색 결과에서 독립
 * 페이지 취급을 받지 못한다. 허브(/glossary)와 개별 페이지(/glossary/[term])가
 * **같은 배열**을 읽어야 둘이 어긋나지 않으므로 여기 한 곳에 둔다.
 *
 * 작성 원칙:
 * 1) 각 def 는 **발췌해도 완결되는 한 문단**이다(G12). AI 가 문단만 떼어가도
 *    "무엇에 대한 설명인지"가 문단 안에 있어야 한다.
 * 2) **시점에 따라 바뀌는 수치를 정의에 박지 않는다.** LTV 한도·DSR 상한·세율은
 *    규제 개편으로 수시로 바뀐다. 여기에 "40%"를 적어 두면 그 순간부터 틀린
 *    문서가 되고, 우리가 그걸 갱신했는지 아무도 확인하지 않는다. 그래서 제도
 *    수치가 필요한 자리는 "규제 지역·주택 수에 따라 달라집니다"로 서술한다.
 * 3) 누구집 고유 지표(시장 온도)는 방법론 페이지의 정의를 원문으로 링크한다.
 */

export type GlossaryCategory =
  | "거래·시세"
  | "면적·구조"
  | "임대차"
  | "대출·상환"
  | "세금·공시"
  | "청약·분양"
  | "정비사업"
  | "경매·공매"
  | "권리·등기"
  | "누구집 지표";

export const GLOSSARY_CATEGORY_ORDER: GlossaryCategory[] = [
  "거래·시세",
  "면적·구조",
  "임대차",
  "대출·상환",
  "세금·공시",
  "청약·분양",
  "정비사업",
  "경매·공매",
  "권리·등기",
  "누구집 지표",
];

export type GlossaryTerm = {
  /** URL 슬러그 — /glossary/{slug} */
  slug: string;
  term: string;
  /** 목록·메타 설명용 1문장 요약 */
  short: string;
  /** 본문 정의 — 발췌해도 완결되는 한 문단 */
  def: string;
  /** 보충 문단 (선택) */
  extra?: string;
  category: GlossaryCategory;
  /** 관련 용어 슬러그 */
  related?: string[];
  /** 누구집 화면 링크 (선택) */
  href?: string;
  hrefLabel?: string;
};

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  /* ── 거래·시세 ─────────────────────────────────────────── */
  {
    slug: "silgeoraega",
    term: "실거래가",
    short: "실제 체결돼 국토교통부에 신고된 계약의 거래 금액.",
    def: "실거래가는 실제로 체결돼 국토교통부에 신고된 계약의 거래 금액입니다. 부동산 포털에 올라오는 매물 호가(부르는 값)와 달리, 신고 기한(계약 후 30일) 안에 신고된 실제 계약만 집계됩니다. 누구집의 모든 시세는 실거래가 기준입니다.",
    extra: "신고 기한이 30일이므로 최근 1~2개월 수치는 아직 신고가 다 들어오지 않은 잠정치입니다. 누구집은 해당 기간의 리포트에 잠정 표시를 붙입니다.",
    category: "거래·시세",
    related: ["hoga", "haejegeorae", "sigogonggae"],
    href: "/tx",
    hrefLabel: "지역별 실거래 보기",
  },
  {
    slug: "hoga",
    term: "호가",
    short: "매도인이 부르는 희망 가격. 실제 계약 금액이 아니다.",
    def: "호가는 매도인이 부르는 희망 가격입니다. 실제 계약 금액이 아니므로 실거래가와 차이가 날 수 있으며, 시장이 꺾일 때는 호가와 실거래가의 간격이 커지는 경향이 있습니다.",
    category: "거래·시세",
    related: ["silgeoraega"],
    href: "/tx",
    hrefLabel: "호가가 아닌 실거래 기준 시세 보기",
  },
  {
    slug: "haejegeorae",
    term: "해제거래",
    short: "체결 신고 후 취소된 계약. 시세 집계에서 제외한다.",
    def: "해제거래는 체결 신고 후 취소된 계약입니다. 해제거래를 시세 평균에 포함하면 단지 평균가가 크게 왜곡될 수 있어, 누구집은 해제 신고분을 시세 집계에서 제외합니다.",
    category: "거래·시세",
    related: ["silgeoraega"],
    href: "/methodology",
    hrefLabel: "누구집의 해제거래 처리 방식",
  },
  {
    slug: "pyeongdanga",
    term: "평당가",
    short: "거래 금액을 전용면적 평수로 나눈 값(3.3㎡당 가격).",
    def: "평당가는 거래 금액을 전용면적의 평수(1평 = 3.3058㎡)로 나눈 값입니다. 면적이 다른 아파트끼리 가격 수준을 비교할 때 씁니다. 같은 단지라도 소형 평형의 평당가가 대형보다 높게 나오는 것이 일반적입니다.",
    category: "거래·시세",
    href: "/tx",
    hrefLabel: "지역별 실거래 보기",
    related: ["jeonyongmyeonjeok", "silgeoraega"],
  },
  {
    slug: "maemae-gagyeok-jisu",
    term: "매매가격지수",
    short: "기준 시점을 100으로 둔 지역 매매가격의 상대 변화 지수.",
    def: "매매가격지수는 특정 시점을 기준(100)으로 지역 주택 매매가격의 상대적 변화를 나타낸 지수입니다. 개별 단지가 아닌 지역 전체의 가격 흐름을 볼 때 씁니다.",
    category: "거래·시세",
    related: ["sijang-ondo"],
    href: "/analysis/timing",
    hrefLabel: "지역 지수 추세 보기",
  },
  {
    slug: "sigogonggae",
    term: "실거래가 공개시스템",
    short: "국토교통부가 신고된 부동산 거래를 공개하는 시스템.",
    def: "실거래가 공개시스템은 국토교통부가 신고된 부동산 거래 내역을 일반에 공개하는 시스템입니다. 아파트·연립다세대·단독다가구의 매매와 전월세 자료가 공개되며, 누구집은 이 자료를 공공데이터포털(data.go.kr) API 로 받아 집계합니다.",
    category: "거래·시세",
    related: ["silgeoraega"],
    href: "/methodology",
    hrefLabel: "집계 방법론",
  },
  {
    slug: "geoRae-ryang",
    term: "거래량",
    short: "일정 기간 체결·신고된 거래 건수.",
    def: "거래량은 일정 기간에 체결돼 신고된 거래 건수입니다. 가격보다 먼저 움직이는 경우가 많아 시장의 활력을 보는 지표로 쓰이지만, 신고 지연 때문에 최근 달의 거래량은 실제보다 적게 보인다는 점을 감안해야 합니다.",
    category: "거래·시세",
    related: ["silgeoraega", "sijang-ondo"],
    href: "/reports",
    hrefLabel: "월간 리포트 보기",
  },
  {
    slug: "gap-tuja",
    term: "갭투자",
    short: "전세 보증금을 끼고 매매가와 전세가의 차액만 들여 사는 방식.",
    def: "갭투자는 전세 보증금을 끼고 매매가와 전세가의 차액(갭)만 들여 주택을 사는 방식입니다. 전세가율이 높을수록 필요한 자기 자금이 줄지만, 전세가 하락 시 보증금 반환 부담이 커지는 위험이 있습니다.",
    category: "거래·시세",
    related: ["jeonse-garyul", "jeonse"],
    href: "/analysis/gap",
    hrefLabel: "전세가율·갭 스크리너에서 지역별 실측 보기",
  },
  {
    slug: "imjang",
    term: "임장",
    short: "검토 중인 집과 동네를 직접 방문해 확인하는 일.",
    def: "임장은 매수·임차를 검토하는 집과 동네를 직접 방문해 확인하는 일입니다. 시세표에 나오지 않는 소음·채광·경사·생활 동선을 확인하는 과정으로, 누구집은 임장 기록(임장노트)을 판단 근거로 쌓는 것을 돕는 서비스입니다.",
    category: "거래·시세",
    related: ["silgeoraega"],
    href: "/notes/new",
    hrefLabel: "임장노트 쓰기",
  },

  /* ── 면적·구조 ─────────────────────────────────────────── */
  {
    slug: "jeonyongmyeonjeok",
    term: "전용면적",
    short: "현관 안쪽, 세대가 독점 사용하는 면적.",
    def: "전용면적은 현관 안쪽에서 세대가 독점적으로 사용하는 면적입니다. 계단·복도 등을 포함한 공급면적과 다르며, 실거래 신고와 누구집의 면적대 구분은 모두 전용면적 기준입니다. 흔히 말하는 '84㎡(국민평형)'가 전용면적 표기입니다.",
    category: "면적·구조",
    href: "/tx",
    hrefLabel: "전용면적 기준 실거래 보기",
    related: ["gonggeupmyeonjeok", "gongyongmyeonjeok", "jeonyongryul"],
  },
  {
    slug: "gonggeupmyeonjeok",
    term: "공급면적",
    short: "전용면적 + 주거 공용면적(계단·복도 등).",
    def: "공급면적은 전용면적에 계단·복도·엘리베이터 홀 같은 주거 공용면적을 더한 면적입니다. 분양 광고에서 '몇 평'이라고 부르는 수치는 대개 공급면적 기준이라, 같은 '32평'이라도 전용면적은 단지마다 다를 수 있습니다.",
    category: "면적·구조",
    related: ["jeonyongmyeonjeok", "gongyongmyeonjeok", "gyeyakmyeonjeok"],
  },
  {
    slug: "gongyongmyeonjeok",
    term: "공용면적",
    short: "여러 세대가 함께 쓰는 면적. 주거 공용과 기타 공용으로 나뉜다.",
    def: "공용면적은 여러 세대가 함께 사용하는 면적입니다. 계단·복도처럼 건물 안에 있는 주거 공용면적과, 주차장·관리사무소·경로당처럼 건물 밖에 있는 기타 공용면적으로 나뉩니다.",
    category: "면적·구조",
    related: ["gonggeupmyeonjeok", "gyeyakmyeonjeok"],
  },
  {
    slug: "gyeyakmyeonjeok",
    term: "계약면적",
    short: "공급면적 + 기타 공용면적. 계약서에 적히는 총면적.",
    def: "계약면적은 공급면적에 주차장·관리사무소 같은 기타 공용면적까지 더한 면적으로, 분양 계약서에 적히는 총면적입니다. 세 가지 면적(전용·공급·계약) 중 가장 큰 값이라, 광고 문구에서 어느 기준인지 확인하지 않으면 실제 사용 공간을 과대평가하기 쉽습니다.",
    category: "면적·구조",
    related: ["gonggeupmyeonjeok", "gongyongmyeonjeok"],
  },
  {
    slug: "jeonyongryul",
    term: "전용률",
    short: "공급면적 대비 전용면적의 비율(%).",
    def: "전용률은 공급면적 대비 전용면적의 비율(%)입니다. 전용률이 높을수록 같은 공급면적에서 실제로 쓰는 공간이 넓다는 뜻입니다. 일반적으로 계단식 아파트가 복도식보다, 그리고 타워형보다 판상형이 전용률이 높게 나오는 경향이 있습니다.",
    category: "면적·구조",
    related: ["jeonyongmyeonjeok", "gonggeupmyeonjeok"],
  },
  {
    slug: "gukmin-pyeonghyeong",
    term: "국민평형",
    short: "전용면적 84㎡ 안팎의 주택형을 부르는 관용어.",
    def: "국민평형은 전용면적 84㎡ 안팎의 주택형을 가리키는 관용적인 표현입니다. 법률 용어는 아니며, 공급면적 기준으로는 대략 33~34평에 해당해 흔히 '34평형'이라고도 불립니다. 공급 물량이 많아 시세 비교의 기준으로 자주 쓰입니다.",
    category: "면적·구조",
    related: ["jeonyongmyeonjeok", "gonggeupmyeonjeok"],
    href: "/tx",
    hrefLabel: "면적대별 실거래 랜딩에서 시세 보기",
  },
  {
    slug: "panshanghyeong",
    term: "판상형 / 타워형",
    short: "아파트 동의 배치·평면 형태를 구분하는 말.",
    def: "판상형은 성냥갑처럼 일자로 배치돼 앞뒤로 창이 뚫리는 평면이고, 타워형은 중앙 코어를 중심으로 여러 세대가 둘러싼 탑 모양 평면입니다. 판상형은 맞통풍과 남향 배치가 유리하고, 타워형은 조망과 단지 배치의 자유도가 큰 편이라 같은 단지 안에서도 선호와 가격이 갈립니다.",
    category: "면적·구조",
    related: ["jeonyongryul"],
  },

  /* ── 임대차 ────────────────────────────────────────────── */
  {
    slug: "jeonse",
    term: "전세",
    short: "보증금을 맡기고 월세 없이 거주하는 한국 특유의 임대차.",
    def: "전세는 큰 보증금을 집주인에게 맡기고 월 임대료 없이 거주한 뒤, 계약이 끝나면 보증금을 돌려받는 한국 특유의 임대차 방식입니다. 임차인에게는 월 주거비가 없다는 장점이, 집주인에게는 목돈을 활용할 수 있다는 이점이 있습니다.",
    category: "임대차",
    related: ["wolse", "banjeonse", "jeonse-garyul", "bojeunggeum"],
    href: "/analysis/gap",
    hrefLabel: "지역별 전세 시세·전세가율 보기",
  },
  {
    slug: "wolse",
    term: "월세",
    short: "보증금과 함께 매달 임대료를 내는 임대차.",
    def: "월세는 일정 보증금을 맡기고 매달 임대료를 내는 임대차 방식입니다. 보증금 규모에 따라 월 임대료가 달라지며, 보증금이 큰 형태를 흔히 반전세라고 부릅니다.",
    category: "임대차",
    related: ["jeonse", "banjeonse", "jeonwolse-jeonhwanyul"],
    href: "/analysis/gap",
    hrefLabel: "월세 환산 수익률 열 보기",
  },
  {
    slug: "banjeonse",
    term: "반전세",
    short: "전세에 가까운 큰 보증금 + 소액 월세 형태.",
    def: "반전세는 전세에 가까운 큰 보증금을 두고 그에 더해 소액의 월세를 내는 형태입니다. 법률상 별도 계약 유형은 아니며 보증부 월세의 한 형태로, 전세 물량이 줄고 월세 전환이 늘어날 때 많이 나타납니다.",
    category: "임대차",
    related: ["jeonse", "wolse", "jeonwolse-jeonhwanyul"],
  },
  {
    slug: "bojeunggeum",
    term: "보증금",
    short: "임대차 계약에서 임차인이 맡기는 돈. 계약 종료 시 반환된다.",
    def: "보증금은 임대차 계약에서 임차인이 임대인에게 맡기는 돈으로, 계약이 끝나면 밀린 임대료·손해배상액을 뺀 나머지를 돌려받습니다. 보증금을 안전하게 돌려받기 위한 장치가 대항력·확정일자·전세권 등입니다.",
    category: "임대차",
    related: ["daehangryeok", "hwakjeong-ilja", "jeonsegwon"],
    href: "/calculator/jeonse-monthly",
    hrefLabel: "보증금·월세 전환 계산기",
  },
  {
    slug: "jeonse-garyul",
    term: "전세가율",
    short: "매매가 대비 전세가의 비율(%).",
    def: "전세가율은 매매가 대비 전세가의 비율(%)입니다. 예를 들어 매매가 10억 아파트의 전세가 6억이면 전세가율은 60%입니다. 전세가율이 높을수록 매매가와 전세가의 차이(갭)가 작다는 뜻입니다.",
    category: "임대차",
    related: ["jeonse", "gap-tuja"],
    href: "/analysis/gap",
    hrefLabel: "지역별 전세가율 랭킹 실측 보기",
  },
  {
    slug: "jeonwolse-jeonhwanyul",
    term: "전월세전환율",
    short: "전세 보증금을 월세로 바꿀 때 적용하는 연 환산 비율.",
    def: "전월세전환율은 전세 보증금의 일부를 월세로 바꿀 때 적용하는 연 환산 비율입니다. 예를 들어 보증금 1억을 월세로 돌릴 때 전환율이 연 5%라면 연 500만원, 월 약 41만원이 됩니다. 주택임대차보호법은 기존 계약을 전환할 때 적용할 수 있는 상한을 두고 있으며, 그 기준은 법령 개정에 따라 달라집니다.",
    category: "임대차",
    related: ["jeonse", "wolse", "banjeonse"],
    href: "/calculator/jeonse-monthly",
    hrefLabel: "전월세 전환 계산기로 직접 계산",
  },
  {
    slug: "gyeyaks-gaengsin-cheonggugwon",
    term: "계약갱신요구권",
    short: "임차인이 한 차례 계약 연장을 요구할 수 있는 권리.",
    def: "계약갱신요구권은 주택임대차보호법에 따라 임차인이 계약 만료 전 정해진 기간 안에 한 차례 계약 연장을 요구할 수 있는 권리입니다. 임대인이 실제 거주하려는 경우 등 법이 정한 사유가 있으면 거절할 수 있습니다. 요구 가능 기간과 예외 사유는 법령에 정해져 있으므로 계약 전 최신 조문을 확인해야 합니다.",
    category: "임대차",
    related: ["bojeunggeum", "daehangryeok"],
  },

  /* ── 대출·상환 ─────────────────────────────────────────── */
  {
    slug: "ltv",
    term: "LTV (주택담보대출비율)",
    short: "주택 가격 대비 대출 금액의 비율.",
    def: "LTV 는 주택 가격 대비 대출 금액의 비율입니다. 예를 들어 10억 주택에 4억을 대출받으면 LTV 는 40%입니다. 한도는 규제 지역 지정 여부·보유 주택 수·주택 가격대에 따라 달라지며, 정책 개편으로 자주 바뀝니다.",
    category: "대출·상환",
    related: ["dsr", "dti", "wonligeum-gyundeung"],
    href: "/analysis/scenario",
    hrefLabel: "내 조건으로 시뮬레이션",
  },
  {
    slug: "dsr",
    term: "DSR (총부채원리금상환비율)",
    short: "연 소득 대비 모든 대출의 연간 원리금 상환액 비율.",
    def: "DSR 은 연 소득 대비 보유한 모든 대출의 연간 원리금 상환액 비율입니다. 소득 7,000만원에 연 원리금 상환액이 2,100만원이면 DSR 은 30%입니다. 주택담보대출뿐 아니라 신용대출·할부금까지 합산하기 때문에, 실무에서 대출 한도를 실제로 결정하는 지표인 경우가 많습니다.",
    category: "대출·상환",
    related: ["ltv", "dti"],
    href: "/analysis/scenario",
    hrefLabel: "내 조건으로 시뮬레이션",
  },
  {
    slug: "dti",
    term: "DTI (총부채상환비율)",
    short: "연 소득 대비 주담대 원리금 + 기타 대출 이자의 비율.",
    def: "DTI 는 연 소득 대비 주택담보대출의 원리금과 그 밖의 대출 이자를 더한 금액의 비율입니다. 기타 대출의 원금까지 합산하는 DSR 보다 범위가 좁아, 같은 차주라도 DTI 보다 DSR 이 높게 계산되는 것이 보통입니다.",
    category: "대출·상환",
    related: ["dsr", "ltv"],
    href: "/calculator",
    hrefLabel: "대출 계산기에서 한도 가늠",
  },
  {
    slug: "wonligeum-gyundeung",
    term: "원리금균등상환",
    short: "매달 같은 금액(원금+이자)을 갚는 상환 방식.",
    def: "원리금균등상환은 대출 기간 내내 매달 같은 금액(원금+이자)을 갚는 방식입니다. 초기에는 상환액 중 이자 비중이 크고 갈수록 원금 비중이 커집니다. 누구집 시나리오 계산기는 30년 원리금균등을 기본으로 계산합니다.",
    category: "대출·상환",
    related: ["wongeum-gyundeung", "geochi-gigan"],
    href: "/analysis/scenario",
    hrefLabel: "상환 시뮬레이션",
  },
  {
    slug: "wongeum-gyundeung",
    term: "원금균등상환",
    short: "매달 같은 원금 + 남은 잔액의 이자를 갚는 방식.",
    def: "원금균등상환은 매달 같은 금액의 원금에 남은 대출 잔액의 이자를 더해 갚는 방식입니다. 초기 상환 부담이 원리금균등보다 크지만 잔액이 빨리 줄어 총 이자는 적게 나옵니다.",
    category: "대출·상환",
    related: ["wonligeum-gyundeung"],
  },
  {
    slug: "geochi-gigan",
    term: "거치기간",
    short: "원금 상환 없이 이자만 내는 기간.",
    def: "거치기간은 대출 초기에 원금을 갚지 않고 이자만 내는 기간입니다. 당장의 월 상환 부담은 줄지만 원금이 그대로 남아 총 이자 부담은 늘고, 거치가 끝나는 시점에 월 상환액이 크게 올라갑니다.",
    category: "대출·상환",
    related: ["wonligeum-gyundeung"],
  },
  {
    slug: "junggangeum-daechul",
    term: "중도금대출",
    short: "분양 계약 후 중도금 납부를 위해 받는 집단대출.",
    def: "중도금대출은 분양 계약 뒤 중도금 납부 시점에 맞춰 실행되는 집단대출입니다. 보통 시행사·시공사가 은행과 협약해 단지 단위로 취급하며, 입주 시점에 주택담보대출로 전환(대환)하는 것이 일반적입니다.",
    category: "대출·상환",
    related: ["bunyanggwon", "janggeum"],
    href: "/calculator",
    hrefLabel: "대출 계산기로 상환액 계산",
  },

  /* ── 세금·공시 ─────────────────────────────────────────── */
  {
    slug: "gongsi-gagyeok",
    term: "공시가격",
    short: "정부가 매년 공시하는 부동산의 적정 가격.",
    def: "공시가격은 정부가 매년 조사·산정해 공시하는 부동산의 적정 가격으로, 재산세·종합부동산세·건강보험료 산정 등 여러 제도의 기준이 됩니다. 시장 거래가와는 다른 개념이라 실거래가보다 낮게 형성되는 것이 일반적입니다.",
    category: "세금·공시",
    related: ["jaesanse", "jongbuse", "silgeoraega"],
  },
  {
    slug: "chwideukse",
    term: "취득세",
    short: "부동산을 취득할 때 내는 지방세.",
    def: "취득세는 부동산을 사거나 상속·증여받아 취득할 때 내는 지방세입니다. 세율은 주택 가격대·보유 주택 수·조정대상지역 여부 등에 따라 달라지며, 제도 개편이 잦아 계약 전에 최신 기준을 확인해야 합니다.",
    category: "세금·공시",
    related: ["yangdo-sodeukse", "jaesanse"],
  },
  {
    slug: "jaesanse",
    term: "재산세",
    short: "보유한 부동산에 매년 부과되는 지방세.",
    def: "재산세는 매년 6월 1일 기준으로 부동산을 보유한 사람에게 부과되는 지방세입니다. 과세 기준일이 6월 1일이므로, 그 직전에 사고파는 경우 누가 그해 재산세를 부담하는지가 실무상 자주 문제가 됩니다.",
    category: "세금·공시",
    related: ["gongsi-gagyeok", "jongbuse"],
  },
  {
    slug: "jongbuse",
    term: "종합부동산세",
    short: "일정 기준을 넘는 부동산 보유자에게 부과되는 국세.",
    def: "종합부동산세는 보유한 부동산의 공시가격 합계가 일정 기준을 넘을 때 재산세와 별도로 부과되는 국세입니다. 공제 기준액과 세율은 법 개정에 따라 바뀌므로 해당 연도의 기준을 확인해야 합니다.",
    category: "세금·공시",
    related: ["gongsi-gagyeok", "jaesanse"],
  },
  {
    slug: "yangdo-sodeukse",
    term: "양도소득세",
    short: "부동산을 팔아 생긴 차익에 부과되는 국세.",
    def: "양도소득세는 부동산을 양도해 생긴 차익에 부과되는 국세입니다. 보유·거주 기간, 보유 주택 수, 조정대상지역 여부에 따라 세율과 공제가 크게 달라지고 비과세 요건도 별도로 정해져 있어, 매도 시점을 정하기 전에 세무 전문가 확인이 필요한 항목입니다.",
    category: "세금·공시",
    related: ["chwideukse", "gongsi-gagyeok"],
  },

  /* ── 청약·분양 ─────────────────────────────────────────── */
  {
    slug: "cheongyak",
    term: "청약",
    short: "새 아파트 분양을 신청하는 절차.",
    def: "청약은 새로 공급되는 아파트의 분양을 신청하는 절차입니다. 청약통장 가입 기간·납입 횟수·무주택 기간 등 자격 요건을 갖춘 사람이 신청하며, 경쟁이 있으면 가점제와 추첨제로 당첨자를 가립니다.",
    category: "청약·분양",
    related: ["cheongyak-gajeom", "teukbyeol-gonggeup", "bunyanggwon"],
    href: "/supply",
    hrefLabel: "청약·입주 예정 물량",
  },
  {
    slug: "cheongyak-gajeom",
    term: "청약가점",
    short: "무주택 기간·부양가족·통장 가입 기간을 점수로 환산한 값.",
    def: "청약가점은 무주택 기간, 부양가족 수, 청약통장 가입 기간을 항목별 점수로 환산해 합산한 값으로, 가점제 물량의 당첨 순서를 정하는 기준입니다. 항목별 배점과 만점은 법령에 정해져 있습니다.",
    category: "청약·분양",
    href: "/apply",
    hrefLabel: "청약 정보 보기",
    related: ["cheongyak", "teukbyeol-gonggeup"],
  },
  {
    slug: "teukbyeol-gonggeup",
    term: "특별공급",
    short: "정책 대상자에게 우선 배정되는 별도 공급 물량.",
    def: "특별공급은 신혼부부·생애최초·다자녀·노부모 부양 등 정책 대상자에게 일반공급과 별도로 배정하는 물량입니다. 유형별로 소득·자산·무주택 요건이 각각 다르고, 일반공급보다 경쟁률이 낮은 경우가 많습니다.",
    category: "청약·분양",
    href: "/apply",
    hrefLabel: "청약 정보 보기",
    related: ["cheongyak", "cheongyak-gajeom"],
  },
  {
    slug: "bunyanggwon",
    term: "분양권",
    short: "완공 전 아파트를 분양받을 수 있는 권리.",
    def: "분양권은 청약에 당첨돼 분양 계약을 체결한 사람이 완공 후 그 아파트를 소유할 수 있는 권리입니다. 아직 등기 대상 건물이 없는 상태의 권리라, 전매 제한 기간과 양도 시 과세가 별도로 정해져 있습니다.",
    category: "청약·분양",
    related: ["ipjugwon", "junggangeum-daechul", "cheongyak"],
    href: "/apply/calendar",
    hrefLabel: "이번 주 청약 접수·마감 일정",
  },
  {
    slug: "mibunyang",
    term: "미분양",
    short: "분양했지만 계약되지 않고 남은 물량.",
    def: "미분양은 분양 공고 후 계약이 이뤄지지 않아 남은 물량입니다. 준공 후에도 남은 물량은 '준공 후 미분양'으로 따로 집계하며, 공급 대비 수요가 약하다는 신호로 해석되는 지표입니다.",
    category: "청약·분양",
    related: ["ipju-mulryang", "cheongyak"],
    href: "/supply",
    hrefLabel: "입주 예정 물량에서 공급 흐름 보기",
  },
  {
    slug: "ipju-mulryang",
    term: "입주물량",
    short: "일정 기간 실제 입주가 시작되는 신축 세대 수.",
    def: "입주물량은 일정 기간에 실제 입주가 시작되는 신축 주택의 세대 수입니다. 분양 시점이 아니라 준공·입주 시점 기준이며, 특정 지역에 입주가 몰리면 그 시기 전세 가격에 영향을 주는 것으로 알려져 있습니다.",
    category: "청약·분양",
    related: ["mibunyang", "jeonse"],
    href: "/supply",
    hrefLabel: "입주 예정 물량 보기",
  },

  /* ── 정비사업 ─────────────────────────────────────────── */
  {
    slug: "jeongbisaeop",
    term: "정비사업",
    short: "노후 주거지를 정비하는 사업의 총칭(재개발·재건축 등).",
    def: "정비사업은 노후·불량 건축물이 밀집한 지역의 주거 환경을 정비하는 사업의 총칭으로, 재개발·재건축·주거환경개선사업 등이 포함됩니다. 단계가 길고 각 단계마다 사업이 멈출 수 있어, 진행 단계를 확인하는 것이 중요합니다.",
    category: "정비사업",
    related: ["jaegaebal", "jaegeonchuk", "anjeon-jindan"],
    href: "/redevelopment",
    hrefLabel: "정비사업 단계 보기",
  },
  {
    slug: "jaegaebal",
    term: "재개발",
    short: "기반시설이 열악한 노후 지역 전체를 정비하는 사업.",
    def: "재개발은 도로·상하수도 같은 기반시설이 열악하고 노후 건축물이 밀집한 지역을 대상으로, 구역 전체의 주거 환경을 새로 정비하는 사업입니다. 대상이 단지가 아니라 구역이라는 점에서 재건축과 구분됩니다.",
    category: "정비사업",
    href: "/redevelopment",
    hrefLabel: "정비사업 현황 보기",
    related: ["jaegeonchuk", "jeongbisaeop", "ipjugwon"],
  },
  {
    slug: "jaegeonchuk",
    term: "재건축",
    short: "기반시설은 양호하나 건물이 노후한 단지를 다시 짓는 사업.",
    def: "재건축은 기반시설은 양호하지만 건축물이 노후한 공동주택 단지를 헐고 다시 짓는 사업입니다. 안전진단 통과가 사업의 관문이 되며, 조합원 분담금 규모에 따라 사업성이 크게 달라집니다.",
    category: "정비사업",
    href: "/redevelopment",
    hrefLabel: "정비사업 현황 보기",
    related: ["jaegaebal", "anjeon-jindan", "ipjugwon"],
  },
  {
    slug: "anjeon-jindan",
    term: "안전진단",
    short: "재건축 추진을 위해 건물의 노후·안전 상태를 평가하는 절차.",
    def: "안전진단은 재건축을 추진하기 위해 건축물의 구조 안전성과 노후도를 평가하는 절차입니다. 평가 결과 등급에 따라 재건축 추진 가능 여부가 갈리기 때문에, 재건축 기대가 반영된 단지에서는 진단 결과가 가격에 크게 영향을 줍니다.",
    category: "정비사업",
    related: ["jaegeonchuk", "jeongbisaeop"],
  },
  {
    slug: "ipjugwon",
    term: "입주권",
    short: "정비사업 조합원이 새 주택을 받을 수 있는 권리.",
    def: "입주권은 재개발·재건축 조합원이 사업 완료 후 새 주택을 취득할 수 있는 권리입니다. 청약 당첨으로 생기는 분양권과 달리 기존 부동산 소유에서 비롯된 권리이며, 세금과 전매 규제의 적용도 분양권과 다릅니다.",
    category: "정비사업",
    related: ["bunyanggwon", "jaegaebal", "jaegeonchuk"],
    href: "/supply",
    hrefLabel: "입주 예정 물량 캘린더 보기",
  },

  /* ── 경매·공매 ─────────────────────────────────────────── */
  {
    slug: "gyeongmae",
    term: "부동산 경매",
    short: "법원이 채권 회수를 위해 부동산을 강제로 매각하는 절차.",
    def: "부동산 경매는 채권자가 채권을 회수할 수 있도록 법원이 채무자의 부동산을 강제로 매각하는 절차입니다. 시세보다 낮은 가격에 살 수 있는 대신, 낙찰자가 떠안는 권리(대항력 있는 임차인 등)를 사전에 분석해야 하는 위험이 있습니다.",
    category: "경매·공매",
    related: ["gongmae", "gwolli-bunseok", "daehangryeok"],
    href: "/auctions",
    hrefLabel: "경매·공매 물건 보기",
  },
  {
    slug: "gongmae",
    term: "공매",
    short: "국가·공공기관이 압류 재산 등을 온비드에서 매각하는 절차.",
    def: "공매는 세금 체납으로 압류된 재산이나 공공기관이 보유한 자산을 한국자산관리공사(캠코)의 온비드 시스템을 통해 매각하는 절차입니다. 법원이 진행하는 경매와 달리 온라인 입찰로 진행되는 것이 특징입니다.",
    category: "경매·공매",
    related: ["gyeongmae"],
    href: "/auctions",
    hrefLabel: "공매 물건 보기",
  },
  {
    slug: "gwolli-bunseok",
    term: "권리분석",
    short: "낙찰 후 인수해야 할 권리가 있는지 확인하는 작업.",
    def: "권리분석은 경매·공매 물건을 낙찰받았을 때 낙찰자가 떠안게 되는 권리가 있는지 확인하는 작업입니다. 말소기준이 되는 권리보다 앞선 임차권·전세권·가등기 등은 낙찰 후에도 남을 수 있어, 이를 놓치면 낙찰가 외에 추가 비용이 발생합니다.",
    category: "경매·공매",
    related: ["gyeongmae", "daehangryeok", "geunjeodang"],
  },

  /* ── 권리·등기 ─────────────────────────────────────────── */
  {
    slug: "deunggibu-deungbon",
    term: "등기부등본",
    short: "부동산의 소유권과 권리관계가 기록된 공적 장부.",
    def: "등기부등본(등기사항전부증명서)은 부동산의 소재·면적과 소유권, 그리고 저당권·가압류 같은 권리관계가 기록된 공적 장부입니다. 표제부·갑구(소유권)·을구(소유권 외 권리)로 구성되며, 계약 전과 잔금 전에 각각 확인하는 것이 원칙입니다.",
    category: "권리·등기",
    related: ["geunjeodang", "jeonsegwon", "gwolli-bunseok"],
  },
  {
    slug: "geunjeodang",
    term: "근저당권",
    short: "장래의 채권을 담보하기 위해 설정하는 저당권.",
    def: "근저당권은 앞으로 발생할 채권까지 일정 한도(채권최고액) 안에서 담보하기 위해 부동산에 설정하는 권리로, 주택담보대출을 받으면 등기부 을구에 기록됩니다. 채권최고액은 보통 실제 대출액보다 크게 설정되므로, 그 금액이 곧 남은 빚은 아닙니다.",
    category: "권리·등기",
    related: ["deunggibu-deungbon", "gwolli-bunseok"],
  },
  {
    slug: "jeonsegwon",
    term: "전세권",
    short: "등기로 설정하는 전세 관련 물권.",
    def: "전세권은 전세금을 내고 타인의 부동산을 사용·수익할 수 있는 권리를 등기로 설정한 물권입니다. 등기가 필요해 임대인의 동의가 있어야 하지만, 설정되면 별도의 확정일자 없이도 순위에 따른 우선변제를 받을 수 있습니다.",
    category: "권리·등기",
    related: ["hwakjeong-ilja", "bojeunggeum", "daehangryeok"],
  },
  {
    slug: "hwakjeong-ilja",
    term: "확정일자",
    short: "임대차계약서에 공적으로 받는 날짜 도장.",
    def: "확정일자는 임대차계약서에 공신력 있는 기관이 찍어 주는 날짜 표시로, 그 날짜에 계약서가 존재했음을 증명합니다. 주택의 인도와 전입신고로 얻는 대항력에 확정일자가 더해지면, 보증금을 후순위 권리자보다 먼저 돌려받을 수 있는 우선변제권이 생깁니다.",
    category: "권리·등기",
    related: ["daehangryeok", "usun-byeonjegwon", "bojeunggeum"],
  },
  {
    slug: "daehangryeok",
    term: "대항력",
    short: "집이 팔려도 새 주인에게 임차권을 주장할 수 있는 힘.",
    def: "대항력은 임차인이 주택을 인도받고 전입신고를 마치면 다음 날 0시부터 생기는 힘으로, 이후 그 집이 팔리더라도 새 소유자에게 임대차 관계를 주장할 수 있게 해 줍니다. 대항력 발생 시점이 다음 날이라는 점 때문에, 잔금 당일 설정된 근저당권보다 순위가 밀릴 수 있다는 점을 주의해야 합니다.",
    category: "권리·등기",
    related: ["hwakjeong-ilja", "usun-byeonjegwon", "bojeunggeum"],
  },
  {
    slug: "usun-byeonjegwon",
    term: "우선변제권",
    short: "보증금을 후순위 권리자보다 먼저 변제받을 권리.",
    def: "우선변제권은 대항력을 갖춘 임차인이 확정일자를 받으면 생기는 권리로, 경매·공매가 진행될 때 후순위 권리자보다 먼저 보증금을 변제받을 수 있게 합니다. 대항력과 확정일자 중 하나라도 빠지면 성립하지 않습니다.",
    category: "권리·등기",
    related: ["daehangryeok", "hwakjeong-ilja", "gyeongmae"],
  },

  /* ── 누구집 고유 지표 ──────────────────────────────────── */
  {
    slug: "sijang-ondo",
    term: "시장 온도",
    short: "누구집이 정의한 0~100 합성 지표(50 중립).",
    def: "시장 온도는 누구집이 지역 시장의 가격·거래 활동을 0~100으로 요약한 합성 지표입니다. 50이 중립이며, 매매가격지수 모멘텀과 실거래 거래량 추이라는 두 실측치에서만 계산합니다. 매수·매도 추천이 아니라 시장 상태의 서술이며, 공식 통계가 아닌 누구집 고유 지표이므로 인용 시 출처를 함께 밝혀 주세요.",
    category: "누구집 지표",
    related: ["maemae-gagyeok-jisu", "geoRae-ryang"],
    href: "/methodology",
    hrefLabel: "계산 공식 보기",
  },
];

const BY_SLUG = new Map(GLOSSARY_TERMS.map((t) => [t.slug, t]));

export function findGlossaryTerm(slug: string): GlossaryTerm | null {
  return BY_SLUG.get(slug) ?? null;
}

export function glossaryTermsByCategory(): Array<{
  category: GlossaryCategory;
  terms: GlossaryTerm[];
}> {
  return GLOSSARY_CATEGORY_ORDER.map((category) => ({
    category,
    terms: GLOSSARY_TERMS.filter((t) => t.category === category),
  })).filter((g) => g.terms.length > 0);
}

/** 사이트맵용 경로 목록. */
export function glossaryPaths(): string[] {
  return GLOSSARY_TERMS.map((t) => `/glossary/${t.slug}`);
}
