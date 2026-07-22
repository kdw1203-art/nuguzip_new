/**
 * 노트 템플릿 마켓 — 서버 전용 데이터 접근.
 *
 * `note_templates` 테이블은 RLS deny-all(정책 없음) 이므로 service-role(또는
 * read-only) 클라이언트 경유로만 접근한다.
 *
 * 데이터 정책: "실데이터 우선". 단, 이 템플릿 마켓의 공식(Official) 체크리스트는
 * 더미가 아니라 실제 제품 콘텐츠다 — 항상 노출되며, DB 에 공개 사용자 템플릿이
 * 있으면 공식 뒤에 병합한다. DB 가 비어있거나 미설정이면 공식 템플릿만 반환한다.
 */
import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import type { NoteTemplate, TemplateSection } from "@/lib/note-templates/types";

/** DB 조회 시 select 할 컬럼 목록 */
const COLUMNS =
  "id,author_email,title,description,category,sections,tags,use_count,is_official,is_public,is_sample,created_at,updated_at";

/* ────────────────────────── 좌표 강제 변환 헬퍼 ────────────────────────── */

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  return [];
}

/** jsonb sections → TemplateSection[] (형태가 어긋난 행은 안전하게 무시) */
function toSections(v: unknown): TemplateSection[] {
  if (!Array.isArray(v)) return [];
  const out: TemplateSection[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const title = String(r.title ?? "").trim();
    const items = toStringArray(r.items);
    if (!title && items.length === 0) continue;
    out.push({ title, items });
  }
  return out;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** DB 행(Record<string, unknown>) → NoteTemplate */
function mapRow(r: Record<string, unknown>): NoteTemplate {
  return {
    id: String(r.id ?? ""),
    authorEmail: r.author_email != null ? String(r.author_email) : null,
    title: String(r.title ?? ""),
    description: r.description != null ? String(r.description) : "",
    category: String(r.category ?? "기본"),
    sections: toSections(r.sections),
    tags: toStringArray(r.tags),
    useCount: num(r.use_count),
    isOfficial: r.is_official === true,
    isPublic: r.is_public !== false,
    isSample: r.is_sample === true,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: r.updated_at != null ? String(r.updated_at) : null,
  };
}

/* ───────────────────────── 공식(내장) 템플릿 상수 ───────────────────────── */

/** 공식 템플릿 생성 헬퍼 — 반복되는 필드 기본값 채움 */
function official(
  id: string,
  title: string,
  category: string,
  description: string,
  tags: string[],
  useCount: number,
  sections: TemplateSection[],
): NoteTemplate {
  return {
    id,
    authorEmail: null,
    title,
    description,
    category,
    sections,
    tags,
    useCount,
    isOfficial: true,
    isPublic: true,
    isSample: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: null,
  };
}

/**
 * 공식 내장 템플릿 4종 — 실제로 쓸모 있는 임장 체크리스트(제품 콘텐츠).
 * 더미/플레이스홀더가 아니며 항상 노출된다. id 는 안정적으로 고정한다.
 */
export const OFFICIAL_TEMPLATES: NoteTemplate[] = [
  official(
    "official-basic",
    "기본 임장 체크리스트",
    "기본",
    "아파트·빌라 어디에나 쓰는 표준 임장 체크리스트. 입지부터 하자까지 한 번에 점검하세요.",
    ["아파트", "빌라", "실거주", "표준"],
    1280,
    [
      {
        title: "입지·교통",
        items: [
          "지하철역·버스정류장까지 실제 도보 시간(직접 걸어보기)",
          "출퇴근 동선과 혼잡도, 배차 간격 확인",
          "주변 도로 진출입 편의와 상습 정체 구간 여부",
          "대형마트·병원·관공서 등 생활 인프라 거리",
          "지형(언덕·경사) — 실제 걸을 때 체감 부담",
          "재개발·GTX·신설역 등 개발 호재의 사실 여부(발표 자료 근거 확인)",
        ],
      },
      {
        title: "채광·조망·향",
        items: [
          "세대 향(남향·남동향 등)과 실제 낮 시간 햇빛 유입",
          "앞동·산·건물에 의한 일조 가림 여부",
          "거실·안방 조망(개방감 vs 마주보기)",
          "저층 사생활 노출·그늘 문제",
          "베란다 확장 여부와 결로·곰팡이 흔적",
        ],
      },
      {
        title: "소음·냄새",
        items: [
          "도로·철도·상가로 인한 외부 소음(창문 열고/닫고 비교)",
          "층간소음 — 위·아래·옆세대 생활음 확인",
          "엘리베이터·기계실·주차장 인접 여부",
          "음식점·쓰레기 집하장 등 냄새 유발 시설",
          "환기 상태와 곰팡이·담배 냄새",
        ],
      },
      {
        title: "주차·관리",
        items: [
          "세대당 주차대수와 저녁 시간 실제 주차 여유",
          "이중주차·기계식 주차 여부",
          "관리비 수준과 세부 내역(공용·난방·수도)",
          "장기수선충당금 적립 상태",
          "단지 청결·조경·보안(CCTV·경비) 관리 수준",
          "재활용·분리수거·택배 보관 편의",
        ],
      },
      {
        title: "커뮤니티·편의",
        items: [
          "초·중·고 학군과 통학 안전(초품아 여부)",
          "어린이집·학원가 접근성",
          "공원·산책로·운동시설",
          "단지 내 커뮤니티(헬스장·독서실·게스트하우스)",
          "상가 구성과 편의점·카페 등 생활 밀착도",
        ],
      },
      {
        title: "하자·상태",
        items: [
          "누수·결로·곰팡이(천장·창틀·화장실) 흔적",
          "수압과 온수 나오는 속도",
          "샷시·문·창문 개폐와 방충망 상태",
          "보일러 연식과 난방 방식",
          "도배·장판·싱크대 노후도와 수리 필요 범위",
          "전기·콘센트·인터넷 배선 상태",
        ],
      },
    ],
  ),
  official(
    "official-presale",
    "신축·분양권 체크리스트",
    "신축",
    "분양권·신축 아파트 매수 전 필수 점검 항목. 프리미엄과 계약 조건, 입주 리스크까지.",
    ["분양권", "신축", "청약", "프리미엄"],
    940,
    [
      {
        title: "분양가·프리미엄",
        items: [
          "분양가와 현재 프리미엄(P) 수준, 인근 시세 대비 적정성",
          "발코니 확장·유상옵션 비용 포함 여부",
          "중도금 대출 승계 가능 여부와 이자 조건",
          "실투자금(계약금+P+옵션) 총액 계산",
          "인근 신축·구축 시세와의 비교",
        ],
      },
      {
        title: "입주 시기·전매",
        items: [
          "예상 입주(준공) 시기와 지연 리스크",
          "전매제한 기간·해제 시점 확인",
          "실거주 의무(거주요건) 적용 여부",
          "잔금·입주 시점의 자금 계획",
          "입주장 물량 과다로 인한 전세가 하락 가능성",
        ],
      },
      {
        title: "마감재·평면",
        items: [
          "평면 유형(판상형·타워형)과 향·채광",
          "베이(2bay·3bay·4bay) 구성과 실사용 면적",
          "마감재 등급과 옵션(시스템에어컨·중문 등)",
          "주방·수납·드레스룸 등 공간 활용도",
          "모델하우스와 실제 시공 차이 확인 방법",
        ],
      },
      {
        title: "단지 규모·브랜드",
        items: [
          "총 세대수·동수와 단지 규모(대단지 선호)",
          "시공사 브랜드와 하자 이력·평판",
          "용적률·건폐율·동간 거리",
          "커뮤니티 시설 구성(수영장·GX·독서실)",
          "주차대수(세대당)와 지하주차장 연결",
        ],
      },
      {
        title: "학군·인프라 예정",
        items: [
          "배정 예정 학교와 신설 학교 계획",
          "지하철·도로 등 교통 인프라 개통 예정 시점",
          "상권·병원·공원 등 생활 인프라 조성 계획",
          "인근 개발(택지·업무지구) 진행 상황",
          "예정 호재의 근거(고시·계획) 실제 확인",
        ],
      },
      {
        title: "계약 조건",
        items: [
          "계약서상 매도인·권리관계(전매 적법 여부)",
          "명의변경 절차와 비용, 세금(양도세) 부담 주체",
          "분양계약서 원본·완납 증명 확인",
          "시행사·조합의 자금 상황과 사업 안정성",
          "위약·해제 조건과 특약 사항",
        ],
      },
    ],
  ),
  official(
    "official-jeonse",
    "전·월세 계약 체크리스트",
    "전월세",
    "전세·월세 임차 전 보증금을 지키기 위한 필수 점검. 등기부·권리관계와 특약까지.",
    ["전세", "월세", "보증금", "임차인"],
    1560,
    [
      {
        title: "시세·보증금",
        items: [
          "인근 전·월세 시세와 비교(과도한 보증금 여부)",
          "전세가율(매매가 대비 전세가) — 깡통전세 위험 점검",
          "월세·관리비 포함 실제 월 부담액",
          "보증금 대출 가능 여부·한도(전세보증보험 포함)",
          "전세보증금 반환보증 가입 가능 여부",
        ],
      },
      {
        title: "등기부·권리관계",
        items: [
          "등기부등본 열람 — 소유자와 계약 상대 일치 확인",
          "근저당·가압류·전세권 등 선순위 채권 확인",
          "선순위 보증금+대출이 매매가 대비 과다한지",
          "건축물대장 — 위반건축물·용도 확인",
          "다가구주택이면 기존 임차인 보증금 총액 확인",
        ],
      },
      {
        title: "집 상태·수리",
        items: [
          "누수·곰팡이·결로 흔적(화장실·창틀·베란다)",
          "수압·온수·배수 상태 직접 확인",
          "보일러·냉난방기 작동과 연식",
          "샷시·문·창문 개폐, 방충망 파손 여부",
          "입주 전 도배·수리 범위와 부담 주체 합의",
        ],
      },
      {
        title: "관리비·공과금",
        items: [
          "관리비 항목과 월 평균 금액",
          "수도·전기·가스 계량기 분리 여부와 명의",
          "장기수선충당금 정산(임대인 부담) 확인",
          "인터넷·TV 등 기존 약정 승계 여부",
          "미납 공과금·관리비 존재 여부",
        ],
      },
      {
        title: "특약·계약서",
        items: [
          "잔금일·확정일자·전입신고 순서 특약 명시",
          "임대인 대출 상환·근저당 말소 조건 특약",
          "수리·원상복구 범위와 반려동물·흡연 조건",
          "계약 상대가 대리인이면 위임장·인감증명 확인",
          "특약사항을 계약서에 문서로 남기기",
        ],
      },
      {
        title: "입·퇴거",
        items: [
          "전입신고+확정일자 즉시 처리 계획",
          "입주 당일 하자·집기 상태 사진 기록",
          "관리사무소·이웃 통해 실제 하자 이력 확인",
          "퇴거 시 보증금 반환 시점·정산 방식 합의",
          "장기수선·도배 등 원상복구 기준 사전 협의",
        ],
      },
    ],
  ),
  official(
    "official-redev",
    "재건축·재개발 임장 체크리스트",
    "재건축",
    "정비사업 물건 매수 전 사업 단계·분담금·규제 리스크를 꼼꼼히 점검하는 체크리스트.",
    ["재건축", "재개발", "정비사업", "분담금"],
    720,
    [
      {
        title: "사업 단계",
        items: [
          "현재 진행 단계(조합설립·사업시행인가·관리처분인가 등)",
          "관리처분인가 여부 — 사업 확정성의 핵심 기준",
          "이주·철거·착공·준공 예상 일정",
          "지연·무산 이력과 조합 내 갈등 여부",
          "정비구역 지정·해제 리스크 확인",
        ],
      },
      {
        title: "대지지분·감정가",
        items: [
          "대지지분 크기(권리가액 산정의 기초)",
          "감정평가액과 예상 권리가액",
          "비례율과 조합원 분양가 수준",
          "동일 평형 내 지분·감정가 편차",
          "종전자산 대비 종후자산 가치 상승 여력",
        ],
      },
      {
        title: "조합·분담금",
        items: [
          "예상 추가 분담금과 납부 시기",
          "조합원 분양 평형 선택 우선순위",
          "이주비 대출 조건과 한도",
          "조합 운영·회계 투명성, 총회 자료 확인",
          "시공사 선정·공사비 증액 리스크",
        ],
      },
      {
        title: "규제·실거주 요건",
        items: [
          "투기과열지구·조정지역 등 규제 적용 여부",
          "조합원 지위 양도 제한(전매 가능 여부)",
          "재건축 실거주 의무·거주요건 확인",
          "재당첨 제한·1가구 다물건 규제",
          "취득세·양도세 등 세금 시나리오",
        ],
      },
      {
        title: "입지 잠재력",
        items: [
          "완공 후 입지·브랜드·세대수 경쟁력",
          "인근 정비사업·교통 호재의 시너지",
          "학군·상권 등 완성 시점의 생활 인프라",
          "일반분양 물량과 청약 수요 전망",
          "주변 신축 시세 대비 미래 가치",
        ],
      },
      {
        title: "리스크",
        items: [
          "조합·비대위 간 소송·분쟁 진행 여부",
          "분담금 급증·사업성 악화 가능성",
          "금리·부동산 경기에 따른 사업 지연 위험",
          "매도인 물건의 권리관계·현금청산 대상 여부",
          "장기 투자에 따른 자금 묶임과 기회비용",
        ],
      },
    ],
  ),
];

/** 공식 id → 템플릿 빠른 조회 맵 */
const OFFICIAL_BY_ID = new Map(OFFICIAL_TEMPLATES.map((t) => [t.id, t]));

/* ─────────────────────────────── 공개 API ─────────────────────────────── */

/**
 * 템플릿 목록 — 공식 + DB 공개 템플릿 병합.
 * 선택 카테고리로 필터, 정렬은 공식 우선 → use_count 내림차순.
 */
export async function listTemplates(category?: string): Promise<NoteTemplate[]> {
  const cat = category && category !== "전체" ? category : undefined;

  const dbTemplates = await fetchPublicDbTemplates(cat);

  let merged = [...OFFICIAL_TEMPLATES, ...dbTemplates];
  if (cat) merged = merged.filter((t) => t.category === cat);

  merged.sort((a, b) => {
    if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
    return b.useCount - a.useCount;
  });

  return merged;
}

/** DB 공개 사용자 템플릿만 조회(공식 제외). 미설정·오류 시 빈 배열. */
async function fetchPublicDbTemplates(category?: string): Promise<NoteTemplate[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    let q = sb
      .from("note_templates")
      .select(COLUMNS)
      .eq("is_public", true)
      .eq("is_official", false);
    if (category) q = q.eq("category", category);
    const { data, error } = await q
      .order("use_count", { ascending: false })
      .limit(120);
    if (error || !data) return [];
    return data.map((r) => mapRow(r as Record<string, unknown>));
  } catch (e) {
    logger.warn("[note-templates] fetchPublicDbTemplates", e);
    return [];
  }
}

/** 단건 조회 — 공식 상수 우선, 없으면 DB by id. 없으면 null. */
export async function getTemplate(id: string): Promise<NoteTemplate | null> {
  if (!id) return null;

  const builtIn = OFFICIAL_BY_ID.get(id);
  if (builtIn) return builtIn;

  const sb = getReadOnlySupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("note_templates")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as Record<string, unknown>);
  } catch (e) {
    logger.warn("[note-templates] getTemplate", e);
    return null;
  }
}

/**
 * 사용 횟수 +1 — best-effort. 공식 id 는 스킵(내장 상수라 DB 행이 없음).
 * 원자성 미보장, 실패는 무시.
 */
export async function incrementUseCount(id: string): Promise<void> {
  if (!id || OFFICIAL_BY_ID.has(id)) return;
  const sb = getServiceSupabase();
  if (!sb) return;
  try {
    const { data } = await sb
      .from("note_templates")
      .select("use_count")
      .eq("id", id)
      .maybeSingle();
    const current =
      data && (data as Record<string, unknown>).use_count != null
        ? Number((data as Record<string, unknown>).use_count)
        : 0;
    await sb
      .from("note_templates")
      .update({ use_count: current + 1 })
      .eq("id", id);
  } catch (e) {
    logger.warn("[note-templates] incrementUseCount", e);
  }
}
