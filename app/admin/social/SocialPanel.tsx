"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 릴스·쇼츠 큐 패널 — 상태표 + 수동 등록 + 즉시 실행 버튼.
 *
 * "지금 생성"/"지금 집행"은 크론 라우트를 그대로 부른다 — authorizeCron 의
 * 관리자 세션 폴백 덕에 vault 시크릿 없이도 어드민에서 손으로 돌려볼 수 있다.
 * (vault 등록 전 파이프라인 전체를 검증하는 경로이기도 하다.)
 */

type Item = {
  id: string;
  createdAt: string;
  videoUrl: string;
  title: string;
  scheduledAt: string;
  igStatus: string;
  ytStatus: string;
  igMediaId: string | null;
  ytVideoId: string | null;
  igError: string | null;
  ytError: string | null;
  attempts: number;
};

const STATUS_LABEL: Record<string, string> = {
  off: "대상 아님",
  queued: "대기",
  uploading: "집행 중",
  published: "발행됨",
  failed: "실패",
};

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "published"
      ? "text-ai-success"
      : status === "failed"
        ? "text-ai-danger"
        : status === "off"
          ? "text-[#9aa6b8]"
          : "text-ai-accent";
  return <span className={`text-[12px] font-extrabold ${tone}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function SocialPanel() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [configured, setConfigured] = useState<{ instagram: boolean; youtube: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/social-uploads", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setItems(j.items);
      setConfigured(j.configured);
    } catch (e) {
      /* 조회 실패를 빈 목록으로 위장하지 않는다 */
      setItems(null);
      setLoadError(e instanceof Error ? e.message : "조회 실패");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(key: string, url: string, init?: RequestInit) {
    setBusy(key);
    setActionMsg(null);
    try {
      const res = await fetch(url, { method: "POST", ...init });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setActionMsg(`${key} 완료: ${JSON.stringify(j).slice(0, 300)}`);
      await load();
    } catch (e) {
      setActionMsg(`${key} 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const card =
    "flex flex-col gap-3 rounded-[20px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-5";

  return (
    <div className="flex flex-col gap-5">
      {/* 자격 증명 상태 + 즉시 실행 */}
      <div className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[12px] font-extrabold !text-white">연결 상태</span>
          {configured ? (
            <>
              <span className={`text-[12px] font-bold ${configured.instagram ? "text-ai-success" : "text-[#9aa6b8]"}`}>
                인스타그램 {configured.instagram ? "연결됨" : "미설정 (META_IG_* env)"}
              </span>
              <span className={`text-[12px] font-bold ${configured.youtube ? "text-ai-success" : "text-[#9aa6b8]"}`}>
                유튜브 {configured.youtube ? "연결됨" : "미설정 (YT_* env)"}
              </span>
            </>
          ) : (
            <span className="text-[12px] text-[#9aa6b8]">확인 중…</span>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void runAction("소재 생성", "/api/cron/social-autopost")}
              className="rounded-[10px] bg-[rgba(126,162,255,.14)] px-3 py-1.5 text-[12px] font-extrabold text-ai-accent disabled:opacity-50"
            >
              {busy === "소재 생성" ? "생성 중…" : "소재 지금 생성"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void runAction("큐 집행", "/api/cron/social-upload-drain")}
              className="rounded-[10px] bg-[rgba(126,162,255,.14)] px-3 py-1.5 text-[12px] font-extrabold text-ai-accent disabled:opacity-50"
            >
              {busy === "큐 집행" ? "집행 중…" : "큐 지금 집행"}
            </button>
          </div>
        </div>
        {actionMsg && (
          <p className="break-all rounded-[10px] bg-[rgba(255,255,255,.05)] px-3 py-2 text-[12px] text-[#c9d2e0]">
            {actionMsg}
          </p>
        )}
      </div>

      {/* 수동 등록 */}
      <div className={card}>
        <div className="text-[12px] font-extrabold !text-white">수동 등록 (직접 만든 영상)</div>
        <div className="grid gap-2 md:grid-cols-2">
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="영상 공개 URL (https:// — social-videos 버킷 권장)"
            className="rounded-[10px] border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.04)] px-3 py-2 text-[12px] !text-white placeholder:text-[#6b7684]"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (유튜브 제목·100자)"
            className="rounded-[10px] border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.04)] px-3 py-2 text-[12px] !text-white placeholder:text-[#6b7684]"
          />
        </div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="캡션/설명 (수익 보장류 표현 금지 — 영구 미기재 방침)"
          rows={2}
          className="rounded-[10px] border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.04)] px-3 py-2 text-[12px] !text-white placeholder:text-[#6b7684]"
        />
        <button
          type="button"
          disabled={busy !== null || !videoUrl.trim() || !title.trim()}
          onClick={() =>
            void runAction("큐 등록", "/api/admin/social-uploads", {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ videoUrl, title, caption }),
            }).then(() => {
              setVideoUrl("");
              setTitle("");
              setCaption("");
            })
          }
          className="self-start rounded-[10px] bg-[rgba(126,162,255,.14)] px-4 py-2 text-[12px] font-extrabold text-ai-accent disabled:opacity-50"
        >
          큐에 등록
        </button>
      </div>

      {/* 큐 상태표 */}
      <div className={card}>
        <div className="text-[12px] font-extrabold !text-white">큐 (최근 50건)</div>
        {loadError ? (
          <p className="rounded-[10px] bg-[rgba(255,255,255,.05)] px-3 py-4 text-[12px] text-ai-danger">
            조회 실패 — {loadError}
          </p>
        ) : items == null ? (
          <p className="text-[12px] text-[#9aa6b8]">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="text-[12px] text-[#9aa6b8]">
            아직 큐가 비어 있습니다 — 매일 11:00 자동 생성되거나, 위 &quot;소재 지금 생성&quot;으로
            바로 만들 수 있습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex flex-col gap-1.5 rounded-[14px] bg-[rgba(255,255,255,.04)] px-3.5 py-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[12px] font-extrabold !text-white">{it.title}</span>
                  <span className="text-[10px] text-[#9aa6b8]">
                    시도 {it.attempts}회 · 예약 {new Date(it.scheduledAt).toLocaleString("ko-KR")}
                  </span>
                  <a
                    href={it.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-ai-accent underline underline-offset-2"
                  >
                    영상 보기
                  </a>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span className="text-[12px] text-[#c9d2e0]">
                    IG <StatusChip status={it.igStatus} />
                    {it.igMediaId ? ` · ${it.igMediaId}` : ""}
                  </span>
                  <span className="text-[12px] text-[#c9d2e0]">
                    YT <StatusChip status={it.ytStatus} />
                    {it.ytVideoId ? ` · ${it.ytVideoId}` : ""}
                  </span>
                </div>
                {(it.igError || it.ytError) && (
                  <p className="break-all text-[10px] text-[#9aa6b8]">
                    {it.igError ? `IG: ${it.igError}` : ""}
                    {it.igError && it.ytError ? " · " : ""}
                    {it.ytError ? `YT: ${it.ytError}` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
