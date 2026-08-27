"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { COMMUNITY_SUBCATEGORIES } from "@/lib/subcategories";
import { CITY_OPTIONS, DISTRICTS } from "@/lib/regions";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { compressImage } from "@/lib/client/image-compress";
import { MAX_POST_IMAGES } from "@/lib/community/attachments";

/* ============================================================
   동네이야기 글쓰기 — POST /api/community/posts 실연동
   필수 필드: title(2자+), body(5자+), city, district, category
   401 → 인라인 로그인 안내, 성공 → /town 이동
   ============================================================ */

type CityOption = (typeof CITY_OPTIONS)[number];

const CATEGORIES = COMMUNITY_SUBCATEGORIES.filter((c) => c.id !== "all");

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none placeholder:text-text-3 focus:border-primary";

/* ============================================================
   [B30] 임시저장 — 길게 쓴 글을 잃지 않는다.

   왜: 이 폼은 로그인 없이도 열린다. 다 쓰고 "등록하기"를 눌러야 401 이 뜨고,
   로그인하러 나갔다 오면 폼은 빈 화면으로 되돌아와 있었다. 모더레이션 반려나
   실수로 뒤로가기를 눌러도 마찬가지다 — 이 서비스에서 가장 비싼 입력(본문)이
   가장 쉽게 사라졌다.

   저장 위치는 이 브라우저(localStorage)다. 서버로 보내지 않는다 — 아직 올리지
   않기로 한 글을 우리 DB 에 남기는 건 사용자가 시킨 일이 아니다.
   ============================================================ */
const DRAFT_KEY = "nz:town-draft:v1";
/** 이보다 오래된 임시저장은 되살리지 않는다 — 한 달 전 문장을 다시 들이밀지 않는다. */
const DRAFT_TTL_MS = 7 * 24 * 60 * 60_000;

type Draft = {
  title: string;
  content: string;
  category: string;
  city: string;
  district: string;
  savedAt: number;
};

function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    const savedAt = Number(d.savedAt ?? 0);
    if (!savedAt || Date.now() - savedAt > DRAFT_TTL_MS) return null;
    const title = String(d.title ?? "");
    const content = String(d.content ?? "");
    if (!title.trim() && !content.trim()) return null;
    return {
      title,
      content,
      category: String(d.category ?? ""),
      city: String(d.city ?? ""),
      district: String(d.district ?? ""),
      savedAt,
    };
  } catch {
    /* JSON 깨짐·저장소 차단(사파리 프라이빗) — 임시저장이 없는 것으로 본다 */
    return null;
  }
}

function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 저장소 차단 — 지울 것도 없다 */
  }
}

function savedAgoLabel(savedAt: number): string {
  const sec = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (sec < 60) return "방금";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.round(hour / 24)}일 전`;
}

/* useSearchParams 는 렌더 시점에 URL 을 읽어 이 페이지를 CSR 경계로 만든다.
   Suspense 로 감싸지 않으면 정적 프리렌더가 통째로 깨지므로, 껍데기만 서버에서
   미리 그리고 폼은 경계 안에서 붙인다. */
export default function TownWritePage() {
  return (
    <Suspense
      fallback={
        <PageShell breadcrumb="동네이야기 › 글쓰기">
          <div className="mx-auto w-full max-w-[640px] px-1 py-10 t-body text-text-3">
            글쓰기 화면을 준비하고 있어요…
          </div>
        </PageShell>
      }
    >
      <TownWriteForm />
    </Suspense>
  );
}

function TownWriteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { promptSignup } = useSoftSignup();
  /* /complex/[id] 의 "이 단지 이야기 쓰기"에서 넘어온 값. 이름은 화면 표시용일
     뿐이고, 저장되는 연결 키는 complexId 하나다(서버가 다시 검증한다). */
  const complexId = (searchParams.get("complex") ?? "").trim();
  const complexName = (searchParams.get("complexName") ?? "").trim();
  /* [3차·#63] 오늘의 동네 글감(/town 프롬프트 카드)에서 넘어온 제목 프리필 + 글감 인덱스 */
  const topic = (searchParams.get("topic") ?? "").trim().slice(0, 120);
  const promptIndex = (searchParams.get("pi") ?? "").trim();

  const [category, setCategory] = useState(CATEGORIES[0]?.label ?? "정보/소식");
  /* 지역을 URL 로 받아 미리 채운다. (B22)
     "글쓰기" 가 아니라 "관양동에 글쓰기" 로 시작해야 한다 — 어느 동네 이야기인지가
     이 서비스의 축인데, 매번 서울특별시/강남구부터 다시 고르게 하고 있었다.
     ?city=경기도&district=안양시 동안구 또는 ?region=안양시 동안구 둘 다 받는다. */
  const initialCity = ((): CityOption => {
    const q = (searchParams.get("city") ?? "").trim();
    return (CITY_OPTIONS as readonly string[]).includes(q) ? (q as CityOption) : "서울특별시";
  })();
  const initialDistrict = ((): string => {
    const list = DISTRICTS[initialCity] ?? [];
    const raw = (searchParams.get("district") ?? searchParams.get("region") ?? "").trim();
    if (!raw) return list[0] ?? "";
    /* 표기 차이 흡수. 목록의 세밀도가 지역마다 다르다 —
       서울은 "강남구"(구 단위)인데 경기는 "안양시"(시 단위)라,
       관심지역이 "안양시 동안구" 로 와도 "안양시" 를 찾아야 한다.
       정확 → 접미 → 접두 → 부분 포함 순으로 좁힌다. */
    const norm = raw.replace(/\s+/g, "");
    const N = (d: string) => d.replace(/\s+/g, "");
    const hit =
      list.find((d) => N(d) === norm) ??
      list.find((d) => norm.endsWith(N(d)) || N(d).endsWith(norm)) ??
      list.find((d) => norm.startsWith(N(d)) || N(d).startsWith(norm)) ??
      list.find((d) => norm.includes(N(d)) || N(d).includes(norm));
    /* 못 찾으면 첫 항목으로 두되, 그건 "이 지역이 목록에 없다" 는 뜻이다 —
       조용히 엉뚱한 지역을 고르는 것보다 사용자가 직접 고르게 하는 편이 낫지만,
       select 는 빈 값을 가질 수 없어 첫 항목이 기본이 된다. */
    return hit ?? list[0] ?? "";
  })();

  const [city, setCity] = useState<CityOption>(initialCity);
  const [district, setDistrict] = useState(initialDistrict);
  const [title, setTitle] = useState(topic);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 모더레이션(금칙어) 위반으로 반려된 경우 — 안내 문구 강화 (#84) */
  const [blockedWord, setBlockedWord] = useState<string | null>(null);
  /* [B31] 첨부 사진 — 업로드가 끝난 URL 만 담는다(실패한 것은 남기지 않는다) */
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /* [B30] 임시저장 — 되살릴 초안(제안 배너용) / 마지막 저장 시각(표시용) */
  const [restorable, setRestorable] = useState<Draft | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const districts = DISTRICTS[city] ?? [];

  /* 마운트 때 한 번 — 되살릴 초안이 있으면 **묻고** 되살린다.
     조용히 덮어쓰면 "단지에서 이야기 쓰기"로 들어온 사람이 엉뚱한 옛 글을 보게 된다. */
  useEffect(() => {
    const d = readDraft();
    if (!d) return;
    /* 지금 폼에 이미 URL 프리필(글감 제목 등)이 들어와 있어도 제안만 한다 */
    setRestorable(d);
  }, []);

  /* 입력이 멈추면 800ms 뒤 저장 — 타이핑마다 쓰면 긴 글에서 눈에 띄게 버벅인다 */
  useEffect(() => {
    if (!title.trim() && !content.trim()) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const now = Date.now();
      try {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ title, content, category, city, district, savedAt: now } satisfies Draft),
        );
        setSavedAt(now);
      } catch {
        /* 저장소 차단(프라이빗 모드·용량 초과) — 표시를 켜지 않는다.
           "임시저장됨"이라고 적어 두고 실제로는 저장이 안 되는 게 최악이다. */
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, content, category, city, district]);

  /* [B31] 사진 고르기 → 브라우저에서 줄이기 → 업로드.
     원본을 그대로 올리면 폰 사진 한 장이 4~8MB 라 셀룰러에서 몇십 초가 걸리고
     업로드 상한(10MB)에도 걸린다. 줄이지 못하는 형식(HEIC 등)은 원본으로 간다. */
  const onPickImages = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploadError(null);
      const room = MAX_POST_IMAGES - images.length;
      if (room <= 0) {
        setUploadError(`사진은 최대 ${MAX_POST_IMAGES}장까지 올릴 수 있어요.`);
        return;
      }
      const picked = Array.from(files).slice(0, room);
      setUploading((n) => n + picked.length);
      for (const raw of picked) {
        try {
          const file = await compressImage(raw);
          const fd = new FormData();
          fd.append("file", file);
          fd.append("folder", "town");
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          if (res.status === 401) {
            promptSignup({
              action: "community_post",
              title: "사진을 올리려면 로그인이 필요해요",
              benefit: "로그인하면 사진과 함께 동네 이야기를 남길 수 있어요.",
            });
            break;
          }
          const data = (await res.json().catch(() => null)) as
            | { url?: string; error?: string }
            | null;
          if (!res.ok || !data?.url) {
            /* 실패를 조용히 넘기면 "올라간 줄 알았는데 없는" 사진이 생긴다 */
            setUploadError(data?.error ?? "사진 업로드에 실패했어요. 다시 시도해 주세요.");
            continue;
          }
          setImages((prev) =>
            prev.includes(data.url!) ? prev : [...prev, data.url!].slice(0, MAX_POST_IMAGES),
          );
        } catch {
          setUploadError("사진 업로드 중 오류가 났어요. 잠시 후 다시 시도해 주세요.");
        } finally {
          setUploading((n) => Math.max(0, n - 1));
        }
      }
    },
    [images.length, promptSignup],
  );

  const applyDraft = useCallback((d: Draft) => {
    setTitle(d.title);
    setContent(d.content);
    if (d.category) setCategory(d.category);
    if (d.city && (CITY_OPTIONS as readonly string[]).includes(d.city)) {
      setCity(d.city as CityOption);
      const list = DISTRICTS[d.city as CityOption] ?? [];
      setDistrict(list.includes(d.district) ? d.district : (list[0] ?? ""));
    }
    setRestorable(null);
    setSavedAt(d.savedAt);
  }, []);

  const onCityChange = (next: CityOption) => {
    setCity(next);
    setDistrict(DISTRICTS[next]?.[0] ?? "");
  };

  const onSubmit = async () => {
    setError(null);
    setBlockedWord(null);
    if (title.trim().length < 2) {
      setError("제목은 2글자 이상 입력해 주세요.");
      return;
    }
    if (content.trim().length < 5) {
      setError("본문은 5글자 이상 입력해 주세요.");
      return;
    }
    if (!city || !district) {
      setError("시·도와 시·군·구를 선택해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: content.trim(),
          category,
          city,
          district,
          ...(complexId ? { complexId } : {}),
          ...(promptIndex ? { promptIndex } : {}),
          ...(images.length ? { imageUrls: images } : {}),
        }),
      });
      if (res.status === 401) {
        promptSignup({
          action: "community_post",
          title: "글을 올리려면 로그인이 필요해요",
          benefit: "로그인하면 동네 이야기가 내 계정에 남고, 나중에 수정·신고 대응이 가능해요.",
        });
        return;
      }
      if (!res.ok) {
        // 서버측 검사(금칙어 포함)는 /api/community/posts 가 수행 —
        // 여기서는 응답의 안내 문구를 그대로 보여주고, 금칙어 반려면 강조 표시
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          blockedWord?: string;
        } | null;
        if (data?.blockedWord) setBlockedWord(data.blockedWord);
        setError(
          data?.error ?? "게시글 등록에 실패했어요. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      /* 올라갔으면 초안은 역할이 끝났다 — 남겨 두면 다음에 글쓰기를 열 때
         이미 올린 글을 "이어서 쓸까요?"라고 다시 묻는다. */
      clearDraft();
      setSavedAt(null);
      // 단지에서 넘어왔으면 그 단지로 돌려보낸다 — 방금 쓴 글이 붙은 자리다.
      router.push(complexId ? `/complex/${encodeURIComponent(complexId)}` : "/town");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell breadcrumb="동네이야기 › 글쓰기">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
        <div className="rise-in px-1">
          <h1 className="t-title text-ink">글쓰기</h1>
          <p className="mt-1 t-body text-text-2">
            우리 동네 이야기·질문을 이웃과 나눠보세요
          </p>
        </div>

        {/* [B30] 되살릴 초안 제안 — 자동으로 덮지 않고 사용자가 고른다 */}
        {restorable && (
          <div className="rise-in flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-text-1">
            {/* 좁은 화면에서 미리보기가 버튼을 밀어내면 "언제 저장됐는지"가 잘린다 —
                본문 줄을 통째로 내려 두 줄로 가른다(390px 실측). */}
            <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
              <span className="t-body font-extrabold text-primary">작성 중이던 글</span>
              <span className="ml-1.5 t-sub text-text-3">
                {savedAgoLabel(restorable.savedAt)} 저장
              </span>
              <div className="truncate t-sub text-text-2">
                “{restorable.title.trim() || restorable.content.trim().slice(0, 40)}”
              </div>
            </div>
            <div className="ml-auto flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => applyDraft(restorable)}
                className="btn-primary rounded-[9px] px-3 py-1.5 t-sub"
              >
                이어 쓰기
              </button>
              <button
                type="button"
                onClick={() => {
                  clearDraft();
                  setRestorable(null);
                }}
                className="btn-secondary rounded-[9px] px-3 py-1.5 t-sub"
              >
                지우기
              </button>
            </div>
          </div>
        )}

        {complexId && (
          <div className="rise-in flex flex-wrap items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 t-body text-text-1">
            <span className="font-extrabold text-primary">
              {complexName || "선택한 단지"}
            </span>
            <span>이야기로 등록돼요 — 이 단지 페이지의 노트 탭에 함께 보여요.</span>
            <Link
              href={complexHrefFromId(complexId)}
              className="font-bold text-primary underline"
            >
              단지 보기
            </Link>
          </div>
        )}

        {/* 카테고리 선택 */}
        <div className="rise-in-1 card flex flex-col gap-2.5 rounded-[18px] p-5">
          <div className="t-body font-extrabold text-ink">게시판 선택</div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.label)}
                className={`chip px-3 py-[7px] text-xs ${
                  category === c.label
                    ? "chip-active"
                    : "border border-line bg-surface text-text-2"
                }`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 지역 선택 */}
        <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[18px] p-5">
          <div className="t-body font-extrabold text-ink">지역</div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={city}
              onChange={(e) => onCityChange(e.target.value as CityOption)}
              className={inputClass}
              aria-label="시·도"
            >
              {CITY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className={inputClass}
              aria-label="시·군·구"
            >
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 제목 · 본문 */}
        <div className="rise-in-3 card flex flex-col gap-3 rounded-[18px] p-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="제목을 입력하세요 (2글자 이상)"
            className={inputClass}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={9}
            placeholder="이웃과 나누고 싶은 이야기를 적어주세요 (5글자 이상)"
            className={`${inputClass} min-h-[200px] resize-y leading-[1.6]`}
          />
          {/* [B31] 사진 — 피드가 사진 우선 격자인데 이야기 글은 늘 그라디언트 상자였다.
              (API 는 imageUrls 를 이미 받고 있었고, 고르는 UI 만 없었다) */}
          <div className="flex flex-col gap-2 border-t border-divider pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-soft cursor-pointer rounded-[10px] px-3 py-2 t-sub font-bold">
                사진 추가
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void onPickImages(e.target.files);
                    e.target.value = ""; // 같은 파일을 다시 고를 수 있게
                  }}
                />
              </label>
              <span className="t-sub text-text-3">
                {uploading > 0
                  ? `올리는 중… ${uploading}장`
                  : `${images.length}/${MAX_POST_IMAGES}장 · 자동으로 줄여서 올려요`}
              </span>
            </div>
            {uploadError && (
              <div className="t-sub font-semibold text-danger">{uploadError}</div>
            )}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((url) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="h-[72px] w-[72px] rounded-[10px] border border-line object-cover"
                    />
                    <button
                      type="button"
                      aria-label="사진 빼기"
                      onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                      className="absolute -right-1.5 -top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink t-caption font-extrabold text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between t-sub text-text-3">
            {/* 저장이 **실제로** 된 뒤에만 적는다 — 저장소가 막힌 브라우저에서
                "임시저장됨"이 거짓말이 되지 않도록 setSavedAt 을 성공 경로에만 둔다. */}
            <span>{savedAt ? `임시저장됨 · ${savedAgoLabel(savedAt)}` : ""}</span>
            <span>{content.trim().length}자</span>
          </div>
        </div>

        {/* 오류 안내 */}
        {error && (
          <div className="card rounded-[14px] border-l-[3px] border-l-danger px-[15px] py-3">
            <div className="t-body font-semibold text-danger">{error}</div>
            {blockedWord && (
              <div className="mt-1.5 t-sub text-text-2">
                누구집 커뮤니티는 이웃 모두가 안심하고 이용할 수 있도록 일부
                표현의 게시를 제한하고 있어요. 제목·본문에서{" "}
                <span className="font-bold text-danger">
                  &quot;{blockedWord}&quot;
                </span>{" "}
                표현을 지우거나 바꾼 뒤 다시 등록해 주세요.
              </div>
            )}
          </div>
        )}

        {/* 액션 */}
        <div className="flex gap-2">
          <Link
            href="/town"
            className="btn-secondary flex-1 rounded-[11px] p-3 text-center t-body"
          >
            취소
          </Link>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="btn-primary btn-cta flex-[2] rounded-[11px] p-3 text-center t-body disabled:opacity-60"
          >
            {submitting ? "등록 중…" : "등록하기"}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
