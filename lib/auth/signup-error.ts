/* server-only 를 일부러 안 건다 — 비밀도 DB 도 없는 순수 매핑 함수라 서버 전용일
   이유가 없고, 걸면 노드에서 직접 불러 단위검증하는 길이 막힌다(이 검증이 이
   파일의 존재 이유다). */

/**
 * Supabase Auth signUp 거절(4xx)을 사람이 고칠 수 있는 안내로 매핑한다.
 *
 * 왜 별도 파일인가: 이 매핑은 2026-08-10 실사용자 장애의 재발 방지 코드다 —
 * 유출 비밀번호 보호(HIBP)가 422 "Password is known to be weak and easy to
 * guess" 로 거절했는데 라우트가 일괄 "(서버 오류 — 잠시 후 다시 시도해
 * 주세요.)" 를 보여줬다. 재시도로는 절대 성공할 수 없는 오류를 재시도하라고
 * 안내한 것이다. 라우트 파일은 HTTP 핸들러 외 export 가 금지라(Next 라우트
 * 타입 검사) 여기서 export 해야 실제 거절 응답 그대로 단위검증을 할 수 있다.
 *
 * 반환 null = 매핑할 수 없는 오류 (호출부가 5xx/기본 분기 처리).
 */

export type AuthRejection = {
  status?: number;
  code?: string;
  message?: string;
};

export type MappedRejection = {
  status: number;
  body: {
    error: string;
    detail?: string;
    code?: string;
  };
  headers?: Record<string, string>;
};

export function mapSignUpRejection(err: AuthRejection): MappedRejection | null {
  const status = err.status;
  const code = err.code ?? "";
  const msg = err.message ?? "";

  /* 업스트림 장애(5xx·무응답)는 여기서 다루지 않는다 — 호출부의 503 분기 몫 */
  if (status === undefined || status === 0 || status >= 500) return null;

  if (code === "weak_password" || /weak and easy to guess/i.test(msg)) {
    return {
      status: 400,
      body: {
        error: "이 비밀번호는 사용할 수 없어요.",
        detail:
          "유출된 적 있거나 너무 흔한 비밀번호예요. 다른 문자를 섞은 새 비밀번호로 다시 시도해 주세요.",
        code: "weak_password",
      },
    };
  }
  if (code === "email_address_invalid" || /invalid.*email|email.*invalid/i.test(msg)) {
    return {
      status: 400,
      body: { error: "이메일 주소 형식을 확인해 주세요.", code: "email_address_invalid" },
    };
  }
  if (status === 429 || code.startsWith("over_")) {
    return {
      status: 429,
      body: {
        error: "요청이 잠시 몰려 가입 처리를 할 수 없어요.",
        detail: "몇 분 뒤 다시 시도해 주세요.",
        code: code || "rate_limited",
      },
      headers: { "Retry-After": "120" },
    };
  }
  if (code === "signup_disabled") {
    return {
      status: 503,
      body: { error: "지금은 새 가입을 받지 않도록 설정돼 있어요.", code },
    };
  }
  if (code === "captcha_failed" || /captcha/i.test(msg)) {
    /* 서버(설정) 쪽 문제다 — 사용자가 재시도해서 풀리지 않는다. */
    return {
      status: 500,
      body: {
        error: "가입 보안 설정에 문제가 있어 지금은 가입할 수 없어요.",
        detail: "운영자가 확인해야 하는 문제예요.",
        code,
      },
    };
  }
  /* 모르는 4xx — 지어내지 않고 업스트림 사유를 그대로 보여준다.
     ("서버 오류 — 잠시 후 다시 시도해 주세요" 는 모르는 원인에 대한 지어낸
     진단이었다. 영어 원문이 예쁘진 않지만 틀린 한국어보다 낫다.) */
  return {
    status: 400,
    body: {
      error: "가입 처리 중 오류가 발생했습니다.",
      detail: msg || undefined,
      code: code || undefined,
    },
  };
}
