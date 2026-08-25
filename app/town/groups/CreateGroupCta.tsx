"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";
import { useMoment } from "@/app/components/motion/MomentProvider";

/* "모임 만들기" — POST /api/groups(createMeeting) 실배선.
   성공 시 새 모임 상세로 이동. 엔드포인트가 게스트도 허용하므로 별도 로그인 강제는 안 함. */

const TYPES = ["임장 모임", "투자 스터디", "세미나/강의", "네트워킹", "청약 스터디"] as const;

/* 시/도는 자유 입력 대신 표준 목록에서 고른다 — "경기"·"경기도"·"경기 도" 가
   뒤섞이면 목록의 지역 필터 칩이 같은 지역을 서로 다른 칩으로 쪼갠다. */
const CITIES = [
  "서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산", "세종",
  "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;

/** datetime-local min 값 — 지난 날짜의 모임은 만들 수 없다 */
function nowLocalMinute(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function CreateGroupCta() {
  const router = useRouter();
  const { showMoment } = useMoment();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [meetType, setMeetType] = useState<(typeof TYPES)[number]>("임장 모임");
  const [city, setCity] = useState<(typeof CITIES)[number]>("서울");
  const [district, setDistrict] = useState("");
  const [nextAt, setNextAt] = useState("");
  const [maxMembers, setMaxMembers] = useState("8");
  const [fee, setFee] = useState("0");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setCity("서울");
    setDistrict("");
    setNextAt("");
    setFee("0");
    setDescription("");
    setTags("");
    setError(null);
    setStatus("idle");
  };

  const submit = async () => {
    if (title.trim().length < 2) return setError("모임 제목을 2자 이상 입력해 주세요.");
    if (!district.trim()) return setError("시·군·구를 입력해 주세요.");
    if (description.trim().length < 10) return setError("모임 소개를 10자 이상 입력해 주세요.");
    if (nextAt && new Date(nextAt).getTime() < Date.now()) {
      return setError("모임 일시가 이미 지났어요. 앞으로의 일시를 선택해 주세요.");
    }
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          city,
          district: district.trim(),
          meetType,
          nextAt: nextAt ? new Date(nextAt).toISOString() : null,
          maxMembers: Number(maxMembers) || 8,
          fee: Math.max(0, Number(fee) || 0),
          tags: tags.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        group?: { id?: string };
      };
      if (res.status === 401) {
        /* [2026-08-22] 로그인 없이 7칸을 다 채운 뒤에야 빨간 오류 한 줄이 나오던
           경로 — 로그인으로 보내고, 돌아오면 이 목록이다(작성 내용 복구까지는
           안 되지만 "왜 안 되는지 모른 채 끝"보다는 낫다). */
        window.location.href = `/login?callbackUrl=${encodeURIComponent("/town/groups")}`;
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "모임을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
        setStatus("idle");
        return;
      }
      setOpen(false);
      reset();
      showMoment({
        title: "모임이 만들어졌어요",
        subtitle: `${city} ${district.trim()} · ${meetType}`,
        kind: "celebrate",
      });
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
        className="btn-primary btn-cta rounded-xl px-[18px] py-2.5 t-body"
      >
        + 모임 만들기
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        label="임장 모임 만들기"
        dismissOnBackdrop={status !== "sending"}
      >
        <ModalHeader title="임장 모임 만들기" onClose={() => setOpen(false)} />

        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1.5 t-sub font-bold text-text-2">모임 유형</div>
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
            className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
          />

          <div className="flex gap-2">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value as (typeof CITIES)[number])}
              aria-label="시/도"
              className="w-[110px] shrink-0 rounded-xl border border-line bg-bg p-3 t-body font-bold text-ink outline-none focus:border-primary"
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              maxLength={40}
              placeholder="시·군·구 (예: 과천시)"
              className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
            />
          </div>

          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 t-sub font-bold text-text-2">
              일시
              <input
                type="datetime-local"
                value={nextAt}
                min={nowLocalMinute()}
                onChange={(e) => setNextAt(e.target.value)}
                className="w-full rounded-xl border border-line bg-bg p-2.5 t-body text-ink outline-none focus:border-primary"
              />
            </label>
            <label className="flex w-[80px] flex-col gap-1 t-sub font-bold text-text-2">
              정원
              <input
                type="number"
                min={2}
                max={200}
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                className="w-full rounded-xl border border-line bg-bg p-2.5 t-body text-ink outline-none focus:border-primary"
              />
            </label>
            <label className="flex w-[110px] flex-col gap-1 t-sub font-bold text-text-2">
              참가비(원)
              <input
                type="number"
                min={0}
                step={1000}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className="w-full rounded-xl border border-line bg-bg p-2.5 t-body text-ink outline-none focus:border-primary"
              />
            </label>
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="모임 소개·코스·준비물을 적어주세요 (10자 이상)"
            className="w-full resize-none rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
          />

          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            maxLength={60}
            placeholder="태그 (쉼표로 구분 · 예: 초보환영, 재건축)"
            className="w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
          />

          {error && <div className="t-sub font-semibold text-danger">{error}</div>}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={status === "sending"}
            className="btn-primary rounded-xl p-3 t-body disabled:opacity-60"
          >
            {status === "sending" ? "만드는 중…" : "모임 만들기"}
          </button>
          <p className="t-caption text-text-3">
            개인정보(전화번호·계좌)는 적지 마세요 · 모임 생성 시 채팅방이 함께 열립니다
          </p>
        </div>
      </Modal>
    </>
  );
}
