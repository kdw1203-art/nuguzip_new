import crypto from "crypto";

/**
 * 토스인증 세션키 생성·개인정보 복호화.
 *
 * 토스 공식 예제(nodejs/src/functions.js)와 동일한 규격:
 * - sessionKey = `v1$<sessionId>$<RSA_OAEP_SHA1(공개키, "AES_GCM$<secretKey>$<iv>")>`
 * - 개인정보 필드 = `v1$<sessionId>$base64(ciphertext || authTag(16B))`, AES-256-GCM, AAD=secretKey(bytes)
 * - 복호화 시에는 우리가 생성한 secretKey/iv 를 그대로 사용합니다.
 */

// 세션키 생성에 사용하는 토스 공개키(테스트/공통). 운영 키가 다르면 TOSS_CERT_PUBLIC_KEY 로 덮어쓰세요.
const DEFAULT_TOSS_PUBLIC_KEY =
  "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAoVdxG0Qi9pip46Jw9ImSlPVD8+L2mM47ey6EZna7D7utgNdh8Tzkjrm1Yl4h6kPJrhdWvMIJGS51+6dh041IXcJEoUquNblUEqAUXBYwQM8PdfnS12SjlvZrP4q6whBE7IV1SEIBJP0gSK5/8Iu+uld2ctJiU4p8uswL2bCPGWdvVPltxAg6hfAG/ImRUKPRewQsFhkFvqIDCpO6aeaR10q6wwENZltlJeeRnl02VWSneRmPqqypqCxz0Y+yWCYtsA+ngfZmwRMaFkXcWjaWnvSqqV33OAsrQkvuBHWoEEkvQ0P08+h9Fy2+FhY9TeuukQ2CVFz5YyOhp25QtWyQI+IaDKk+hLxJ1APR0c3tmV0ANEIjO6HhJIdu2KQKtgFppvqSrZp2OKtI8EZgVbWuho50xvlaPGzWoMi9HSCb+8ARamlOpesxHH3O0cTRUnft2Zk1FHQb2Pidb2z5onMEnzP2xpTqAIVQyb6nMac9tof5NFxwR/c4pmci+1n8GFJIFN18j2XGad1mNyio/R8LabqnzNwJC6VPnZJz5/pDUIk9yKNOY0KJe64SRiL0a4SNMohtyj6QlA/3SGxaEXb8UHpophv4G9wN1CgfyUamsRqp8zo5qDxBvlaIlfkqJvYPkltj7/23FHDjPi8q8UkSiAeu7IV5FTfB5KsiN8+sGSMCAwEAAQ==";

export function getTossPublicKey(): string {
  return process.env.TOSS_CERT_PUBLIC_KEY?.trim() || DEFAULT_TOSS_PUBLIC_KEY;
}

export type TossSession = {
  sessionId: string;
  /** base64(32 bytes) */
  secretKey: string;
  /** base64(12 bytes) */
  iv: string;
  /** API 요청 바디에 넣는 sessionKey */
  sessionKey: string;
};

/** 매 요청마다 새 세션을 생성합니다(재사용 금지). */
export function createTossSession(publicKeyBase64 = getTossPublicKey()): TossSession {
  const sessionId = crypto.randomUUID();
  const secretKey = crypto.randomBytes(32).toString("base64");
  const iv = crypto.randomBytes(12).toString("base64");

  const sessionAesKey = `AES_GCM$${secretKey}$${iv}`;
  const encrypted = crypto.publicEncrypt(
    {
      key: `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(sessionAesKey, "utf-8"),
  );

  return {
    sessionId,
    secretKey,
    iv,
    sessionKey: `v1$${sessionId}$${encrypted.toString("base64")}`,
  };
}

/** 결과조회 응답의 `v1$..$..` 형식 필드를 복호화합니다. */
export function decryptTossField(
  session: Pick<TossSession, "secretKey" | "iv">,
  encryptedData: string | null | undefined,
): string | undefined {
  if (typeof encryptedData !== "string" || !encryptedData) return undefined;
  const part = encryptedData.split("$")[2];
  if (!part) return undefined;

  const parsed = Buffer.from(part, "base64");
  if (parsed.length <= 16) return undefined;
  const ciphertext = parsed.subarray(0, parsed.length - 16);
  const authTag = parsed.subarray(parsed.length - 16);

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(session.secretKey, "base64"),
    Buffer.from(session.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(session.secretKey, "base64"));
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf-8");
}
