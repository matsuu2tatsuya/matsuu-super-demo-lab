import type { ApiError, ConfigResponse, InspectRequest, InspectResponse } from "../../shared/contract";

export class ApiClientError extends Error {
  status: number;
  code: string;
  messageJa: string;
  constructor(status: number, code: string, messageJa: string) {
    super(`${status} ${code}`);
    this.status = status;
    this.code = code;
    this.messageJa = messageJa;
  }
}

const PASSCODE_HEADER = "x-demo-passcode";

async function toClientError(res: Response): Promise<ApiClientError> {
  let body: Partial<ApiError> = {};
  try {
    body = (await res.json()) as Partial<ApiError>;
  } catch {
    /* 非 JSON */
  }
  return new ApiClientError(res.status, body.error ?? "unknown", body.messageJa ?? `通信に失敗しました(${res.status})。`);
}

export async function fetchConfig(): Promise<ConfigResponse> {
  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) throw await toClientError(res);
  return (await res.json()) as ConfigResponse;
}

export async function inspect(request: InspectRequest, passcode: string | null): Promise<InspectResponse> {
  // multipart で送る。base64 は端末側で作り、Worker 側は文字列をそのまま Gemini に渡す(CPU 節約)。
  const form = new FormData();
  if (request.itemLabel) form.append("itemLabel", request.itemLabel);
  for (const img of request.images) {
    form.append("image", img.dataBase64);
    form.append("mimeType", img.mimeType);
  }
  const headers: Record<string, string> = {};
  if (passcode) headers[PASSCODE_HEADER] = passcode;
  const res = await fetch("/api/inspect", { method: "POST", headers, body: form });
  if (!res.ok) throw await toClientError(res);
  return (await res.json()) as InspectResponse;
}

export function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.messageJa;
  if (e instanceof TypeError) return "ネットワークに接続できませんでした。電波状況を確認してください。";
  return "判定に失敗しました。もう一度お試しください。";
}
