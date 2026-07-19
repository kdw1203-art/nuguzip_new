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
        <strong className="text-text-1">통신판매업 신고</strong>:{" "}
        {info.mailOrderSalesNumber || "—"}
      </p>
      <p>
        <strong className="text-text-1">고객센터 이메일</strong>: {info.supportEmail}
      </p>
      {showHours ? (
        <p>
          <strong className="text-text-1">운영 시간</strong>: 평일 10:00 ~ 18:00 (공휴일
          제외)
        </p>
      ) : null}
      {!complete && process.env.NODE_ENV === "development" ? (
        <p className="pt-1 text-[10px] text-danger">
          개발 환경: NEXT_PUBLIC_COMPANY_* 환경변수에 사업자·통신판매업 정보를 설정하세요.
        </p>
      ) : null}
    </div>
  );
}
