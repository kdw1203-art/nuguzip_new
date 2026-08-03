import {
  getBusinessInfo,
  isBusinessDisclosureComplete,
} from "@/lib/brand/business-info";

type Props = {
  className?: string;
  showHours?: boolean;
};

/** 약관·요금제 등에 쓰는 사업자 고지 블록 (구 components/legal/business-disclosure-block.tsx 이식) */
export function BusinessDisclosureBlock({ className = "", showHours = true }: Props) {
  const info = getBusinessInfo();
  const complete = isBusinessDisclosureComplete(info);

  return (
    <div
      className={`space-y-0.5 rounded-[14px] border border-line bg-bg p-3 text-xs text-text-2 ${className}`}
    >
      <p>
        <strong className="text-text-1">상호명</strong>: {info.legalName}
      </p>
      <p>
        <strong className="text-text-1">대표자</strong>: {info.representative || "—"}
      </p>
      <p>
        <strong className="text-text-1">사업자등록번호</strong>:{" "}
        {info.registrationNumber || "—"}
      </p>
      <p>
        <strong className="text-text-1">주소</strong>: {info.address || "—"}
      </p>
      <p>
        <strong className="text-text-1">대표전화</strong>:{" "}
        {info.phone ? (
          <a
            href={`tel:${info.phone.replace(/[^0-9+]/g, "")}`}
            className="text-text-2 underline-offset-2 hover:underline"
          >
            {info.phone}
          </a>
        ) : (
          "—"
        )}
      </p>
      <p>
        <strong className="text-text-1">통신판매업 신고</strong>:{" "}
        {info.mailOrderSalesNumber || "—"}
      </p>
      <p>
        <strong className="text-text-1">고객센터 이메일</strong>: {info.supportEmail}
      </p>
      {/* 사업용 수취 계좌 — 토스뱅크 계좌개설 확인증(소유자 제공)의 실값.
          환불·무통장 입금 안내용이며, 세 값이 모두 있을 때만 표기한다. */}
      {info.depositBank && info.depositAccountNumber && info.depositAccountHolder ? (
        <p>
          <strong className="text-text-1">입금 계좌</strong>: {info.depositBank}{" "}
          {info.depositAccountNumber} (예금주: {info.depositAccountHolder})
        </p>
      ) : null}
      {showHours ? (
        <p>
          <strong className="text-text-1">운영 시간</strong>: 평일 10:00 ~ 18:00 (공휴일
          제외)
        </p>
      ) : null}
      {!complete ? (
        <p className="pt-1 text-[10px] text-danger">
          통신판매업 신고번호가 아직 등록되지 않았습니다. 유료 결제는 고지 완료 후
          열립니다. (NEXT_PUBLIC_MAIL_ORDER_SALES_NUMBER)
        </p>
      ) : null}
    </div>
  );
}
