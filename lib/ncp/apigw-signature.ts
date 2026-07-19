import { createHmac } from "node:crypto";

/**
 * NCP API Gateway Signature v2
 * @see https://api.ncloud-docs.com/docs/common-ncpapi
 */
export function makeNcpApigwSignature(
  method: string,
  urlPath: string,
  timestamp: string,
  accessKey: string,
  secretKey: string,
): string {
  const message = [method, " ", urlPath, "\n", timestamp, "\n", accessKey].join("");
  return createHmac("sha256", secretKey).update(message).digest("base64");
}

export function ncpApigwHeaders(
  method: string,
  urlPath: string,
  accessKey: string,
  secretKey: string,
): Record<string, string> {
  const timestamp = Date.now().toString();
  return {
    "Content-Type": "application/json; charset=utf-8",
    "x-ncp-apigw-timestamp": timestamp,
    "x-ncp-iam-access-key": accessKey,
    "x-ncp-apigw-signature-v2": makeNcpApigwSignature(
      method,
      urlPath,
      timestamp,
      accessKey,
      secretKey,
    ),
  };
}

export function getNcpAccessKey(): string {
  return process.env.NCP_ACCESS_KEY?.trim() ?? "";
}

export function getNcpSecretKey(): string {
  return process.env.NCP_SECRET_KEY?.trim() ?? "";
}
