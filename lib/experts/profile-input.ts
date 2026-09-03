/**
 * 전문가 프로필 수정 입력 정규화 (953) — PATCH /api/experts/[id] 가 원본 body 를
 * 그대로 스토어에 넘기던 것을 고친다(스토어의 컬럼 화이트리스트는 있었지만 값 검증은
 * 없었다: 음수 상담료, 200자 전문 분야, javascript: 카카오 링크가 그대로 저장됐다).
 *
 * 순수 함수 — tests/unit/expert-profile-input.test.ts 가 검증한다.
 */
import { normalizeSpecialties, RESPONSE_TIME_OPTIONS } from "./taxonomy";

export type ExpertProfilePatch = Partial<{
  introduction: string;
  specialties: string[];
  regions: string[];
  experience: string;
  consultationFee: number;
  reportFee: number;
  responseTime: string;
  organization: string | null;
  contactPhone: string | null;
  contactKakao: string | null;
  title: string;
}>;

const FEE_MAX = 10_000_000;

function str(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v).replace(/\s+/g, " ").trim().slice(0, max);
}

function list(v: unknown, max: number, itemMax: number): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  const arr = Array.isArray(v) ? v.map(String) : String(v).split(/[,，]/);
  const out: string[] = [];
  for (const raw of arr) {
    const s = raw.trim().slice(0, itemMax);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function fee(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Math.round(Number(String(v).replace(/[^0-9.]/g, "")));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(FEE_MAX, n));
}

/** 카카오 링크는 https 만, 그리고 카카오 도메인만 — 다른 사이트로 새는 링크는 저장하지 않는다 */
export function sanitizeKakaoLink(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  const s = String(raw ?? "").trim().slice(0, 120);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (!(host === "pf.kakao.com" || host === "open.kakao.com" || host.endsWith(".kakao.com"))) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function sanitizePhone(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  const s = String(raw ?? "").replace(/[^0-9+\-\s]/g, "").trim().slice(0, 20);
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 12) return null;
  return s;
}

export function sanitizeExpertProfilePatch(body: unknown): { patch: ExpertProfilePatch; errors: string[] } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const patch: ExpertProfilePatch = {};

  const intro = str(b.introduction, 1000);
  if (intro !== undefined) patch.introduction = intro;

  const title = str(b.title, 30);
  if (title !== undefined && title) patch.title = title;

  const specialties = list(b.specialties, 8, 20);
  if (specialties !== undefined) patch.specialties = normalizeSpecialties(specialties, 8);

  const regions = list(b.regions, 5, 30);
  if (regions !== undefined) patch.regions = regions;

  const experience = str(b.experience, 30);
  if (experience !== undefined) patch.experience = experience;

  const cf = fee(b.consultationFee);
  if (cf !== undefined) patch.consultationFee = cf;
  const rf = fee(b.reportFee);
  if (rf !== undefined) patch.reportFee = rf;

  const rt = str(b.responseTime, 30);
  if (rt !== undefined) {
    /* 선택지 밖 자유 입력도 허용하되, 숫자·"시간/일/내" 없는 문장은 안내문이 아니다 */
    patch.responseTime = rt && !(RESPONSE_TIME_OPTIONS as readonly string[]).includes(rt) && !/\d|시간|일|당일/.test(rt) ? "" : rt;
  }

  const org = str(b.organization, 60);
  if (org !== undefined) patch.organization = org || null;

  const phone = sanitizePhone(b.contactPhone);
  if (phone !== undefined) {
    if (phone === null && String(b.contactPhone ?? "").trim()) errors.push("전화번호 형식을 확인해 주세요.");
    patch.contactPhone = phone;
  }

  const kakao = sanitizeKakaoLink(b.contactKakao);
  if (kakao !== undefined) {
    if (kakao === null && String(b.contactKakao ?? "").trim()) {
      errors.push("카카오톡 링크는 https://pf.kakao.com 또는 https://open.kakao.com 주소만 저장돼요.");
    }
    patch.contactKakao = kakao;
  }

  return { patch, errors };
}
