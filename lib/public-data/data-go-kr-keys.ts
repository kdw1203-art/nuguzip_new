/**
 * 공공데이터포털 인증키 — 용도별 분리
 * - DATA_GO_KR_SERVICE_KEY: odcloud.kr (디코딩 키) — 청약·CSV 등
 * - MOLIT_SERVICE_KEY / DATA_GO_KR_ENCODING_KEY: apis.data.go.kr (인코딩 키) — 국토부·기상·에어
 */
export function getOdcloudServiceKey(): string | null {
  return process.env.DATA_GO_KR_SERVICE_KEY?.trim() || null;
}

export function getDataGoKrEncodingKey(): string | null {
  return (
    process.env.MOLIT_SERVICE_KEY?.trim() ||
    process.env.DATA_GO_KR_ENCODING_KEY?.trim() ||
    null
  );
}

export function isOdcloudConfigured(): boolean {
  return Boolean(getOdcloudServiceKey());
}

export function isDataGoKrEncodingConfigured(): boolean {
  return Boolean(getDataGoKrEncodingKey());
}

/** apis.data.go.kr URL에 붙일 serviceKey (이미 인코딩된 값 그대로) */
export function encodingKeyForUrl(): string | null {
  const key = getDataGoKrEncodingKey();
  return key || null;
}
