/**
 * Gemini generateContent を fetch で直接叩く。
 * SDK を使わない理由: Workers 無料枠は CPU 10ms/リクエストで、SDK が画像入りの本文を
 * 作り直す処理だけで 4 枚 1.7MB のとき 26ms かかった(2026-09-07 本番 tail で実測)。
 * ここでは base64 文字列を一切走査・再エンコードせず、文字列連結(V8 のロープ)で本文を組む。
 * リクエストの形は SDK(@google/genai 2.21)が送るものをローカルで横取りして確認済み。
 */
import { GEMINI_RESPONSE_JSON_SCHEMA, deriveVerdict, normalizeGeminiOut, type InspectRequest, type InspectResponse } from "./contract";
import { SYSTEM_PROMPT, buildReferenceIntro, buildTargetIntro, buildUserPrompt } from "./prompt";

export type ThinkingLevel = "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
export type MediaResolution = "MEDIA_RESOLUTION_LOW" | "MEDIA_RESOLUTION_MEDIUM" | "MEDIA_RESOLUTION_HIGH";

export interface InspectDeps {
  apiKey: string;
  model: string;
  thinkingLevel: ThinkingLevel;
  mediaResolution: MediaResolution;
  timeoutMs?: number;
  baseUrl?: string;
}

export class GeminiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_TIMEOUT_MS = 60_000;

function imagePart(img: { mimeType: string; dataBase64: string }): string {
  // JSON.stringify は 1 回のネイティブ走査で JSON 安全性を保証する。base64 として不正なら Gemini が 400 を返す。
  return `{"inlineData":{"mimeType":${JSON.stringify(img.mimeType)},"data":` + JSON.stringify(img.dataBase64) + `}}`;
}

function buildBody(req: InspectRequest, deps: InspectDeps): string {
  let parts = "";
  const ref = req.reference;
  if (ref && ref.images.length > 0) {
    parts += JSON.stringify({ text: buildReferenceIntro(ref.images.length, ref.label) }) + ",";
    for (const img of ref.images) parts += imagePart(img) + ",";
    parts += JSON.stringify({ text: buildTargetIntro(req.images.length) }) + ",";
  }
  for (const img of req.images) parts += imagePart(img) + ",";
  parts += JSON.stringify({ text: buildUserPrompt(req.images.length, req.itemLabel, ref?.criteria) });

  const systemInstruction = JSON.stringify({ parts: [{ text: SYSTEM_PROMPT }], role: "user" });
  const generationConfig = JSON.stringify({
    temperature: 0.2,
    maxOutputTokens: 4096,
    responseMimeType: "application/json",
    responseJsonSchema: GEMINI_RESPONSE_JSON_SCHEMA,
    mediaResolution: deps.mediaResolution,
    thinkingConfig: { thinkingLevel: deps.thinkingLevel },
  });

  return `{"contents":[{"role":"user","parts":[` + parts + `]}],"systemInstruction":` + systemInstruction + `,"generationConfig":` + generationConfig + `}`;
}

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

export async function inspectImages(req: InspectRequest, deps: InspectDeps): Promise<InspectResponse> {
  const url = `${deps.baseUrl ?? DEFAULT_BASE_URL}/v1beta/models/${encodeURIComponent(deps.model)}:generateContent`;
  const body = buildBody(req, deps);

  const startedAt = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": deps.apiKey },
    body,
    signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const latencyMs = Date.now() - startedAt;

  if (!res.ok) {
    // 本文にキーは含まれないが、念のため status とメッセージ先頭だけ持つ
    let detail = "";
    try {
      const j = (await res.json()) as GenerateContentResponse;
      detail = j.error?.message?.slice(0, 200) ?? "";
    } catch {
      /* 非 JSON */
    }
    throw new GeminiError(res.status, `gemini_http_${res.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = (await res.json()) as GenerateContentResponse;
  if (data.promptFeedback?.blockReason) throw new GeminiError(422, `gemini_blocked_${data.promptFeedback.blockReason}`);
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new GeminiError(502, "gemini_empty_response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError(502, "gemini_invalid_json");
  }

  const { images, overallCommentJa } = normalizeGeminiOut(parsed, req.images.length);
  const { verdict, reasonJa } = deriveVerdict(images);
  const referenceUsed = req.reference && (req.reference.images.length > 0 || req.reference.criteria.trim())
    ? { label: req.reference.label, imageCount: req.reference.images.length, hasCriteria: Boolean(req.reference.criteria.trim()) }
    : null;
  return { verdict, reasonJa, images, overallCommentJa, latencyMs, model: deps.model, referenceUsed };
}
