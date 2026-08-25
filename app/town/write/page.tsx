"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { COMMUNITY_SUBCATEGORIES } from "@/lib/subcategories";
import { CITY_OPTIONS, DISTRICTS } from "@/lib/regions";
import { complexHrefFromId } from "@/lib/seo/complex-slug";

/* ============================================================
   동네이야기 글쓰기 — POST /api/community/posts 실연동
   필수 필드: title(2자+), body(5자+), city, district, category
   401 → 인라인 로그인 안내, 성공 → /town 이동
   ============================================================ */

type CityOption = (typeof CITY_OPTIONS)[number];

const CATEGORIES = COMMUNITY_SUBCATEGORIES.filter((c) => c.id !== "all");

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none placeholder:text-text-3 focus:border-primary";

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
  const [city, setCity] = useState<CityOption>("서울특별시");
  const [district, setDistrict] = useState(DISTRICTS["서울특별시"][0] ?? "");
  const [title, setTitle] = useState(topic);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 모더레이션(금칙어) 위반으로 반려된 경우 — 안내 문구 강화 (#84) */
  const [blockedWord, setBlockedWord] = useState<string | null>(null);

  const districts = DISTRICTS[city] ?? [];

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
          <div className="text-right t-sub text-text-3">
            {content.trim().length}자
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
