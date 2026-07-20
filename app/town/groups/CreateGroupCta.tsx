"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/* "모임 만들기" — POST /api/groups(createMeeting) 실배선.
   성공 시 새 모임 상세로 이동. 엔드포인트가 게스트도 허용하므로 별도 로그인 강제는 안 함. */

const TYPES = ["임장 모임", "투자 스터디", "세미나/강의", "네트워킹", "청약 스터디"] as const;

export function CreateGroupCta() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [meetType, setMeetType] = useState<(typeof TYPES)[number]>("임장 모임");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [nextAt, setNextAt] = useState("");
  const [maxMembers, setMaxMembers] = useState("8");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setCity("");
    setDistrict("");
    setNextAt("");
    setDescription("");
    setTags("");
    setError(null);
    setStatus("idle");
  };

  const submit = async () => {
    if (title.trim().length < 2) return setError("모임 제목을 2자 이상 입력해 주세요.");
    if (!district.trim()) return setError("시·군·구를 입력해 주세요.");
    if (description.trim().length < 10) return setError("모임 소개를 10자 이상 입력해 주세요.");
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          city: city.trim() || "서울특별시",
          district: district.trim(),
          meetType,
          nextAt: nextAt ? new Date(nextAt).toISOString() : null,
          maxMembers: Number(maxMembers) || 8,
          tags: tags.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        group?: { id?: string };
      };
      if (!res.ok) {
        setError(data.error ?? "모임을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
        setStatus("idle");
        return;
      }
      setOpen(false);
      reset();
      if (data.group?.id) router.push(`/town/groups/${data.group.id}`);
      else router.refresh();
    } catch {
      setError("모임을 만들지 못했어요. 네트워크를 확인해 주세요.");
      setStatus("idle");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary btn-cta rounded-xl px-[18px] py-2.5 text-[13px]"
      >
        + 모임 만들기
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(16,24,40,.4)] backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="임장 모임 만들기"
        >
          <div className="max-h-[90vh] w-full max-w-[460px] overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-extrabold text-ink">임장 모임 만들기</span>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setOpen(false)}
                className="text-[15px] text-text-3"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1.5 text-[11px] font-bold text-text-2">모임 유형</div>
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMeetType(t)}
                      className={`chip px-3 py-1.5 text-[12px] font-bold ${
                        meetType === t ? "chip-active" : "border border-line bg-bg text-text-2"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                placeholder="모임 제목 (예: 과천지식정보타운 같이 봐요)"
                className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
              />

              <div className="flex gap-2">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  maxLength={20}
                  placeholder="시/도 (예: 경기)"
                  className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                />
                <input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  maxLength={40}
                  placeholder="시·군·구 (예: 과천시)"
                  className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                />
              </div>

              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-[11px] font-bold text-text-2">
                  일시
                  <input
                    type="datetime-local"
                    value={nextAt}
                    onChange={(e) => setNextAt(e.target.value)}
                    className="w-full rounded-xl border border-line bg-bg p-2.5 text-[13px] text-ink outline-none focus:border-primary"
                  />
                </label>
                <label className="flex w-[110px] flex-col gap-1 text-[11px] font-bold text-text-2">
                  정원
                  <input
                    type="number"
                    min={2}
                    max={200}
                    value={maxMembers}
                    onChange={(e) => setMaxMembers(e.target.value)}
                    className="w-full rounded-xl border border-line bg-bg p-2.5 text-[13px] text-ink outline-none focus:border-primary"
                  />
                </label>
              </div>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="모임 소개·코스·준비물을 적어주세요 (10자 이상)"
                className="w-full resize-none rounded-xl border border-line bg-bg p-3 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-text-3 focus:border-primary"
              />

              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                maxLength={60}
                placeholder="태그 (쉼표로 구분 · 예: 초보환영, 재건축)"
                className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
              />

              {error && <div className="text-[11px] font-semibold text-danger">{error}</div>}

              <button
                type="button"
                onClick={() => void submit()}
                disabled={status === "sending"}
                className="btn-primary rounded-xl p-3 text-[13px] disabled:opacity-60"
              >
                {status === "sending" ? "만드는 중…" : "모임 만들기"}
              </button>
              <p className="text-[10px] leading-[1.5] text-text-3">
                개인정보(전화번호·계좌)는 적지 마세요 · 모임 생성 시 채팅방이 함께 열립니다
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
