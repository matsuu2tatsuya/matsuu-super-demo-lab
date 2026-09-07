import { GoogleGenAI, MediaResolution, ThinkingLevel } from "@google/genai";
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_ITEM_LABEL_LENGTH,
  GEMINI_RESPONSE_JSON_SCHEMA,
  deriveVerdict,
  normalizeGeminiOut,
  type ApiError,
  type ConfigResponse,
  type ImageMimeType,
  type InspectRequest,
  type InspectRequestImage,
  type InspectResponse,
} from "../shared/contract";
import { SYSTEM_PROMPT, buildUserPrompt } from "../shared/prompt";

/** wrangler.jsonc の vars と、secret で入れる値。secret は `wrangler secret put` で登録する。 */
type DemoEnv = Env & {
  GEMINI_API_KEY?: string;
  DEMO_PASSCODE?: string;
  ASSETS?: Fetcher;
};

const DEFAULT_MODEL = "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 60_000;
const PASSCODE_HEADER = "x-demo-passcode";
/** base64 は元バイト数の約 4/3。JSON 全体の上限はそこに余裕を足す。 */
const MAX_BODY_BYTES = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) * MAX_IMAGES + 64 * 1024;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function error(status: number, error: string, messageJa: string): Response {
  return json({ error, messageJa } satisfies ApiError, status);
}

function rawEnv(env: DemoEnv): Record<string, unknown> {
  return env as unknown as Record<string, unknown>;
}

function resolveModel(env: DemoEnv): string {
  const v = rawEnv(env).GEMINI_MODEL;
  return typeof v === "string" && v.trim() ? v.trim() : DEFAULT_MODEL;
}

function resolveThinkingLevel(env: DemoEnv): ThinkingLevel {
  const v = String(rawEnv(env).GEMINI_THINKING_LEVEL ?? "").toUpperCase();
  if (v === "MINIMAL") return ThinkingLevel.MINIMAL;
  if (v === "HIGH") return ThinkingLevel.HIGH;
  if (v === "MEDIUM") return ThinkingLevel.MEDIUM;
  return ThinkingLevel.LOW;
}

function resolveMediaResolution(env: DemoEnv): MediaResolution {
  const v = String(rawEnv(env).GEMINI_MEDIA_RESOLUTION ?? "").toUpperCase();
  if (v === "MEDIUM") return MediaResolution.MEDIA_RESOLUTION_MEDIUM;
  if (v === "LOW") return MediaResolution.MEDIA_RESOLUTION_LOW;
  return MediaResolution.MEDIA_RESOLUTION_HIGH;
}

function passcodeOk(request: Request, env: DemoEnv): boolean {
  const required = env.DEMO_PASSCODE?.trim();
  if (!required) return true;
  return request.headers.get(PASSCODE_HEADER)?.trim() === required;
}

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function validateImage(raw: unknown, index: number): InspectRequestImage | string {
  if (!raw || typeof raw !== "object") return `images[${index}] が不正です`;
  const { mimeType, dataBase64 } = raw as Record<string, unknown>;
  if (typeof mimeType !== "string" || !IMAGE_MIME_TYPES.includes(mimeType as ImageMimeType)) {
    return `images[${index}] の形式は JPEG / PNG / WebP のみ対応です`;
  }
  if (typeof dataBase64 !== "string" || dataBase64.length === 0) return `images[${index}] のデータが空です`;
  const approxBytes = Math.floor((dataBase64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) return `images[${index}] が大きすぎます(上限 ${Math.round(MAX_IMAGE_BYTES / 1000)}KB)`;
  if (!BASE64_RE.test(dataBase64)) return `images[${index}] は base64 ではありません`;
  return { mimeType: mimeType as ImageMimeType, dataBase64 };
}

/** 例外メッセージに API キーや URL が混ざることがあるので、ログには種類と status だけ出す。 */
function describeError(e: unknown): { name: string; status?: number } {
  if (e && typeof e === "object") {
    const anyErr = e as { name?: unknown; status?: unknown; code?: unknown };
    const status = typeof anyErr.status === "number" ? anyErr.status : typeof anyErr.code === "number" ? anyErr.code : undefined;
    return { name: typeof anyErr.name === "string" ? anyErr.name : "Error", status };
  }
  return { name: "Error" };
}

export interface InspectDeps {
  apiKey: string;
  model: string;
  thinkingLevel: ThinkingLevel;
  mediaResolution: MediaResolution;
  timeoutMs?: number;
}

/**
 * Gemini を呼んで観察結果を取り、固定ポリシーで判定を付ける。
 * Worker からも、ローカルの動作確認スクリプトからも同じ関数を使う。
 */
export async function inspectImages(req: InspectRequest, deps: InspectDeps): Promise<InspectResponse> {
  const ai = new GoogleGenAI({ apiKey: deps.apiKey, httpOptions: { timeout: deps.timeoutMs ?? GEMINI_TIMEOUT_MS } });
  const parts = [
    ...req.images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } })),
    { text: buildUserPrompt(req.images.length, req.itemLabel) },
  ];

  const startedAt = Date.now();
  const response = await ai.models.generateContent({
    model: deps.model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseJsonSchema: GEMINI_RESPONSE_JSON_SCHEMA,
      mediaResolution: deps.mediaResolution,
      thinkingConfig: { thinkingLevel: deps.thinkingLevel },
    },
  });
  const latencyMs = Date.now() - startedAt;

  const text = response.text;
  if (!text) throw new Error("gemini_empty_response");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("gemini_invalid_json");
  }

  const { images, overallCommentJa } = normalizeGeminiOut(parsed, req.images.length);
  const { verdict, reasonJa } = deriveVerdict(images);
  return { verdict, reasonJa, images, overallCommentJa, latencyMs, model: deps.model };
}

async function handleInspect(request: Request, env: DemoEnv): Promise<Response> {
  if (!passcodeOk(request, env)) return error(401, "passcode_required", "合言葉が違います。");
  if (!env.GEMINI_API_KEY) return error(500, "server_not_configured", "サーバーに API キーが設定されていません。");

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return error(413, "payload_too_large", "写真が大きすぎます。枚数を減らすか撮り直してください。");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "invalid_json", "リクエストの形式が不正です。");
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(raw.images) || raw.images.length === 0) return error(400, "no_images", "写真を1枚以上送ってください。");
  if (raw.images.length > MAX_IMAGES) return error(400, "too_many_images", `写真は最大 ${MAX_IMAGES} 枚までです。`);

  const images: InspectRequestImage[] = [];
  for (let i = 0; i < raw.images.length; i += 1) {
    const v = validateImage(raw.images[i], i);
    if (typeof v === "string") return error(400, "invalid_image", v);
    images.push(v);
  }
  const itemLabel = typeof raw.itemLabel === "string" ? raw.itemLabel.slice(0, MAX_ITEM_LABEL_LENGTH) : undefined;

  try {
    const result = await inspectImages(
      { itemLabel, images },
      {
        apiKey: env.GEMINI_API_KEY,
        model: resolveModel(env),
        thinkingLevel: resolveThinkingLevel(env),
        mediaResolution: resolveMediaResolution(env),
      },
    );
    return json(result);
  } catch (e) {
    const info = describeError(e);
    console.error("inspect_failed", JSON.stringify(info));
    if (info.status === 429) return error(429, "rate_limited", "混み合っています。少し待ってからもう一度お試しください。");
    if (e instanceof Error && e.message === "gemini_invalid_json") return error(502, "gemini_invalid_json", "判定結果を読み取れませんでした。もう一度お試しください。");
    return error(502, "gemini_failed", "判定に失敗しました。時間を置いてもう一度お試しください。");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/config" && request.method === "GET") {
      const body: ConfigResponse = { passcodeRequired: Boolean(env.DEMO_PASSCODE?.trim()), model: resolveModel(env), maxImages: MAX_IMAGES };
      return json(body);
    }
    if (url.pathname === "/api/inspect") {
      if (request.method !== "POST") return error(405, "method_not_allowed", "POST のみ対応です。");
      return handleInspect(request, env);
    }
    if (url.pathname.startsWith("/api/")) return error(404, "not_found", "存在しないエンドポイントです。");

    // SPA: 静的アセットに無いパスは index.html にフォールバックさせる(not_found_handling)。
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<DemoEnv>;
