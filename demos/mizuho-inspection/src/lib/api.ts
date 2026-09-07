import type { ApiError, ConfigResponse, ImageMimeType, InspectRequestImage, InspectResponse, ReferenceMeta } from "../../shared/contract";

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

function authHeaders(passcode: string | null): Record<string, string> {
  return passcode ? { [PASSCODE_HEADER]: passcode } : {};
}

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

export interface InspectInput {
  itemLabel?: string;
  images: InspectRequestImage[];
  useReference: boolean;
}

export async function inspect(input: InspectInput, passcode: string | null): Promise<InspectResponse> {
  // multipart で送る。base64 は端末側で作り、Worker 側は文字列をそのまま Gemini に渡す(CPU 節約)。
  const form = new FormData();
  if (input.itemLabel) form.append("itemLabel", input.itemLabel);
  if (input.useReference) form.append("useReference", "1");
  for (const img of input.images) {
    form.append("image", img.dataBase64);
    form.append("mimeType", img.mimeType);
  }
  const res = await fetch("/api/inspect", { method: "POST", headers: authHeaders(passcode), body: form });
  if (!res.ok) throw await toClientError(res);
  return (await res.json()) as InspectResponse;
}

export async function listReferences(passcode: string | null): Promise<ReferenceMeta[]> {
  const res = await fetch("/api/references", { cache: "no-store", headers: authHeaders(passcode) });
  if (!res.ok) throw await toClientError(res);
  return ((await res.json()) as { references: ReferenceMeta[] }).references;
}

export interface ReferenceImageInput {
  mimeType: ImageMimeType;
  dataBase64: string;
  thumbnailDataUrl: string;
}

export async function saveReference(
  label: string,
  criteria: string,
  images: ReferenceImageInput[],
  passcode: string | null,
  options: { keepImages?: boolean } = {},
): Promise<ReferenceMeta> {
  const form = new FormData();
  form.append("criteria", criteria);
  if (options.keepImages && images.length === 0) form.append("keepImages", "1");
  for (const img of images) {
    form.append("image", img.dataBase64);
    form.append("mimeType", img.mimeType);
    form.append("thumbnail", img.thumbnailDataUrl);
  }
  const res = await fetch(`/api/references/${encodeURIComponent(label)}`, { method: "PUT", headers: authHeaders(passcode), body: form });
  if (!res.ok) throw await toClientError(res);
  return (await res.json()) as ReferenceMeta;
}

export async function deleteReference(label: string, passcode: string | null): Promise<void> {
  const res = await fetch(`/api/references/${encodeURIComponent(label)}`, { method: "DELETE", headers: authHeaders(passcode) });
  if (!res.ok) throw await toClientError(res);
}

export function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.messageJa;
  if (e instanceof TypeError) return "ネットワークに接続できませんでした。電波状況を確認してください。";
  return "判定に失敗しました。もう一度お試しください。";
}

/** 型番の一致判定は Worker 側のキー正規化と同じ規則で行う */
export function normalizeLabel(label: string): string {
  return label.trim().normalize("NFKC").toLowerCase();
}
