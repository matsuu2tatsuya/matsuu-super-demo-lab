import {
  IMAGE_MIME_TYPES,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_ITEM_LABEL_LENGTH,
  type ApiError,
  type ConfigResponse,
  type ImageMimeType,
  type InspectRequestImage,
} from "../shared/contract";
import { GeminiError, inspectImages, type MediaResolution, type ThinkingLevel } from "../shared/gemini";

/** wrangler.jsonc の vars と、secret で入れる値。secret は `wrangler secret put` で登録する。 */
type DemoEnv = Env & {
  GEMINI_API_KEY?: string;
  DEMO_PASSCODE?: string;
  ASSETS?: Fetcher;
};

const DEFAULT_MODEL = "gemini-3.6-flash";
const PASSCODE_HEADER = "x-demo-passcode";
/** base64 は元バイト数の約 4/3。multipart の境界やフィールド分の余裕を足す。 */
const MAX_BODY_BYTES = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) * MAX_IMAGES + 64 * 1024;
const MAX_IMAGE_BASE64_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4;

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
  return v === "MINIMAL" || v === "MEDIUM" || v === "HIGH" ? v : "LOW";
}

function resolveMediaResolution(env: DemoEnv): MediaResolution {
  const v = String(rawEnv(env).GEMINI_MEDIA_RESOLUTION ?? "").toUpperCase();
  if (v === "MEDIUM") return "MEDIA_RESOLUTION_MEDIUM";
  if (v === "LOW") return "MEDIA_RESOLUTION_LOW";
  return "MEDIA_RESOLUTION_HIGH";
}

function passcodeOk(request: Request, env: DemoEnv): boolean {
  const required = env.DEMO_PASSCODE?.trim();
  if (!required) return true;
  return request.headers.get(PASSCODE_HEADER)?.trim() === required;
}

/**
 * multipart/form-data:
 *   itemLabel (任意) / image (base64 文字列、最大 MAX_IMAGES 個) / mimeType (image と同じ順・同じ数)
 * base64 は端末側で作らせ、Worker では走査も再エンコードもしない。
 */
async function parseInspectForm(request: Request): Promise<{ itemLabel?: string; images: InspectRequestImage[] } | Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, "invalid_form", "リクエストの形式が不正です。");
  }
  const rawImages = form.getAll("image");
  const rawMimes = form.getAll("mimeType");
  if (rawImages.length === 0) return error(400, "no_images", "写真を1枚以上送ってください。");
  if (rawImages.length > MAX_IMAGES) return error(400, "too_many_images", `写真は最大 ${MAX_IMAGES} 枚までです。`);

  const images: InspectRequestImage[] = [];
  for (let i = 0; i < rawImages.length; i += 1) {
    const data = rawImages[i];
    const mime = typeof rawMimes[i] === "string" ? (rawMimes[i] as string).trim() : rawMimes[i];
    if (typeof data !== "string" || typeof mime !== "string") return error(400, "invalid_image", `images[${i}] が不正です`);
    if (!IMAGE_MIME_TYPES.includes(mime as ImageMimeType)) return error(400, "invalid_image", `images[${i}] の形式は JPEG / PNG / WebP のみ対応です`);
    if (data.length > MAX_IMAGE_BASE64_LENGTH) return error(413, "image_too_large", `images[${i}] が大きすぎます(上限 ${Math.round(MAX_IMAGE_BYTES / 1000)}KB)`);
    if (data.length === 0 || data.length % 4 !== 0) return error(400, "invalid_image", `images[${i}] は base64 ではありません`);
    // 中身の走査はしない(CPU 節約)。JSON 化は shared/gemini.ts が JSON.stringify で安全に行う。
    images.push({ mimeType: mime as ImageMimeType, dataBase64: data });
  }
  const label = form.get("itemLabel");
  const itemLabel = typeof label === "string" ? label.slice(0, MAX_ITEM_LABEL_LENGTH) : undefined;
  return { itemLabel, images };
}

async function handleInspect(request: Request, env: DemoEnv): Promise<Response> {
  if (!passcodeOk(request, env)) return error(401, "passcode_required", "合言葉が違います。");
  if (!env.GEMINI_API_KEY) return error(500, "server_not_configured", "サーバーに API キーが設定されていません。");

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return error(413, "payload_too_large", "写真が大きすぎます。枚数を減らすか撮り直してください。");

  const parsed = await parseInspectForm(request);
  if (parsed instanceof Response) return parsed;

  try {
    const result = await inspectImages(parsed, {
      apiKey: env.GEMINI_API_KEY,
      model: resolveModel(env),
      thinkingLevel: resolveThinkingLevel(env),
      mediaResolution: resolveMediaResolution(env),
    });
    return json(result);
  } catch (e) {
    // 例外メッセージに URL やヘッダが混ざる可能性を考え、ログは種類と status だけ
    const status = e instanceof GeminiError ? e.status : undefined;
    const name = e instanceof Error ? e.name : "Error";
    console.error("inspect_failed", JSON.stringify({ name, status }));
    if (status === 429) return error(429, "rate_limited", "混み合っています。少し待ってからもう一度お試しください。");
    if (e instanceof GeminiError && e.message === "gemini_invalid_json") return error(502, "gemini_invalid_json", "判定結果を読み取れませんでした。もう一度お試しください。");
    if (name === "TimeoutError") return error(504, "gemini_timeout", "判定に時間がかかりすぎました。写真を減らしてもう一度お試しください。");
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
