"use client";

/**
 * 클로즈 베타 안내 팝업 (홈 전용).
 *
 * 왜 필요한가 — 지금 누구집은 정식 서비스가 아니다. 화면·기능·데이터 범위가
 * 계속 바뀌는데, 처음 들어온 사람은 그걸 알 방법이 없다. "왜 이 지역은 비어
 * 있지?", "왜 이 숫자가 —로 나오지?" 를 서비스 결함으로 읽고 나가는 대신,
 * 지금이 어떤 단계인지를 먼저 말해 준다.
 *
 * 문구 원칙(사실 우선):
 *   - 정식 출시 시점은 오너가 말한 범위("하반기") 그대로만 적는다. 월·일을
 *     지어내지 않는다. 날짜가 정해지면 이 파일의 문구와 STORAGE_KEY 의 버전을
 *     함께 올려 다시 안내한다.
 *   - "데이터가 곧 채워집니다" 같은 약속은 하지 않는다. 대신 지금 무엇이
 *     확인된 값이고 무엇이 비어 있는지를 말한다.
 *
 * 표시 규칙:
 *   - 브라우저 기본 대화상자(confirm/alert)는 쓰지 않는다 — 공용 Modal 사용.
 *   - 쿠키 동의 배너가 아직 떠 있으면(결정 전) 띄우지 않는다. 오버레이 두 개가
 *     겹치면 둘 다 읽히지 않고 둘 다 닫힌다.
 *   - 닫으면 localStorage 에 시각을 남기고 DISMISS_DAYS 동안 다시 띄우지
 *     않는다. 서버에 저장하지 않으므로 이 브라우저에만 남는 값이다.
 *   - LCP 와 겹치지 않게 마운트 후 잠깐 뒤에 연다.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal, ModalHeader } from "./ui/Modal";
import { useCookieConsent } from "@/components/consent/use-cookie-consent";

/** 문구가 바뀌면 뒤 숫자를 올린다 — 이미 닫은 사람에게도 새 안내가 한 번 더 간다. */
const STORAGE_KEY = "nuguzip:beta-notice-v1";

/** 닫은 뒤 다시 띄우지 않는 기간. 베타 기간 내내 매번 뜨면 그건 공지가 아니라 방해다. */
const DISMISS_DAYS = 30;

/** 첫 화면이 그려진 다음에 연다(ms). */
const OPEN_DELAY_MS = 900;

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const at = Date.parse(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    /* 저장소를 못 읽으면(사생활 보호 모드 등) 안내를 한 번 보여 주는 쪽을 택한다. */
    return false;
  }
}

export function BetaNoticeModal() {
  const [open, setOpen] = useState(false);
  const { state } = useCookieConsent();
  const consentSettled = state.status === "decided";

  useEffect(() => {
    if (!consentSettled) return;
    if (dismissedRecently()) return;
    const t = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [consentSettled]);

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      /* 저장 실패해도 이번 세션 동안은 닫힌 상태가 유지된다. */
    }
  }

  return (
    <Modal open={open} onClose={close} label="클로즈 베타 안내" maxWidth={420}>
      <ModalHeader title="지금은 클로즈 베타입니다" onClose={close} />

      <div className="space-y-3 text-[13px] leading-relaxed text-text-1">
        <p>
          누구집은 아직 클로즈 베타 단계예요. 지금 보이는 화면과 기능은 정식 출시 전까지 바뀔 수
          있습니다.
        </p>
        <p>
          <b className="text-ink">정식 출시는 올해 하반기</b>를 목표로 준비하고 있어요. 날짜가
          정해지면 이 자리에서 다시 안내드릴게요.
        </p>

        <div className="rounded-2xl bg-primary-soft p-3 text-[12.5px] text-text-2">
          <p className="mb-1.5 font-bold text-primary">베타 기간에 알아 두시면 좋은 것</p>
          <p>
            시세·실거래는 공공데이터를 그대로 옮겨 보여 드립니다. 아직 확인되지 않은 값은 채워
            넣지 않고 <b className="text-text-1">—</b> 로 비워 둡니다. 지역에 따라 비어 있는 화면이
            보일 수 있어요.
          </p>
        </div>

        <p className="text-[12.5px] text-text-2">
          쓰다가 이상한 점이나 아쉬운 점이 있으면 알려 주세요. 베타 기간의 의견이 정식 출시 모습을
          정합니다.
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <Link
          href="/support"
          onClick={close}
          className="press flex-1 rounded-xl border border-border bg-surface py-2.5 text-center text-[13px] font-bold text-text-1"
        >
          의견 보내기
        </Link>
        <button
          type="button"
          onClick={close}
          className="press flex-1 rounded-xl bg-primary py-2.5 text-center text-[13px] font-bold text-white"
        >
          확인했어요
        </button>
      </div>
    </Modal>
  );
}
