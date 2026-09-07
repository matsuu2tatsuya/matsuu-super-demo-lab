import {
  IMAGE_MIME_TYPES,
  MAX_CRITERIA_LENGTH,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_ITEM_LABEL_LENGTH,
  MAX_REFERENCES,
  MAX_REFERENCE_IMAGES,
  type ApiError,
  type ConfigResponse,
  type ImageMimeType,
  type InspectRequestImage,
  type ReferenceData,
  type ReferenceMeta,
} from "../shared/contract";
import { GeminiError, inspectImages, type MediaResolution, type ThinkingLevel } from "../shared/gemini";

/** wrangler.jsonc の vars / kv_namespaces と、secret で入れる値。secret は `wrangler secret put` で登録する。 */
type DemoEnv = Env & {
  GEMINI_API_KEY?: string;
  DEMO_PASSCODE?: string;
  ASSETS?: Fetcher;
  REFERENCES?: KVNamespace;
};

const DEFAULT_MODEL = "gemini-3.6-flash";
const PASSCODE_HEADER = "x-demo-passcode";
/** base64 は元バイト数の約 4/3。multipart の境界やフィールド分の余裕を足す。 */
const MAX_IMAGE_BASE64_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4;
const MAX_INSPECT_BODY_BYTES = MAX_IMAGE_BASE64_LENGTH * MAX_IMAGES + 64 * 1024;
const MAX_THUMBNAIL_LENGTH = 60_000;
const MAX_REFERENCE_BODY_BYTES = (MAX_IMAGE_BASE64_LENGTH + MAX_THUMBNAIL_LENGTH) * MAX_REFERENCE_IMAGES + MAX_CRITERIA_LENGTH * 4 + 64 * 1024;

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

function formString(form: FormData, name: string): string | undefined {
  const v = form.get(name);
  return typeof v === "string" ? v : undefined;
}

/** multipart の image / mimeType の組を検証して返す。中身の走査はしない(CPU 節約)。 */
function readImages(form: FormData, max: number): InspectRequestImage[] | Response {
  const rawImages = form.getAll("image");
  const rawMimes = form.getAll("mimeType");
  if (rawImages.length > max) return error(400, "too_many_images", `写真は最大 ${max} 枚までです。`);
  const images: InspectRequestImage[] = [];
  for (let i = 0; i < rawImages.length; i += 1) {
    const data = rawImages[i];
    const mime = typeof rawMimes[i] === "string" ? (rawMimes[i] as string).trim() : rawMimes[i];
    if (typeof data !== "string" || typeof mime !== "string") return error(400, "invalid_image", `images[${i}] が不正です`);
    if (!IMAGE_MIME_TYPES.includes(mime as ImageMimeType)) return error(400, "invalid_image", `images[${i}] の形式は JPEG / PNG / WebP のみ対応です`);
    if (data.length > MAX_IMAGE_BASE64_LENGTH) return error(413, "image_too_large", `images[${i}] が大きすぎます(上限 ${Math.round(MAX_IMAGE_BYTES / 1000)}KB)`);
    if (data.length === 0 || data.length % 4 !== 0) return error(400, "invalid_image", `images[${i}] は base64 ではありません`);
    images.push({ mimeType: mime as ImageMimeType, dataBase64: data });
  }
  return images;
}

/* ---------- 見本と基準 (KV) ---------- */

function referenceKey(label: string): string | null {
  const norm = label.trim().normalize("NFKC");
  if (!norm || norm.length > MAX_ITEM_LABEL_LENGTH) return null;
  return norm.toLowerCase();
}
const metaKey = (k: string) => `ref:${k}:meta`;
const imageKey = (k: string, i: number) => `ref:${k}:img:${i}`;

async function loadReference(env: DemoEnv, label: string | undefined): Promise<ReferenceData | null> {
  if (!env.REFERENCES || !label) return null;
  const k = referenceKey(label);
  if (!k) return null;
  const metaRaw = await env.REFERENCES.get(metaKey(k));
  if (!metaRaw) return null;
  const meta = JSON.parse(metaRaw) as ReferenceMeta;
  const datas = await Promise.all(Array.from({ length: meta.imageCount }, (_, i) => env.REFERENCES!.get(imageKey(k, i))));
  const images: InspectRequestImage[] = [];
  datas.forEach((d, i) => {
    if (d) images.push({ mimeType: meta.mimeTypes[i] ?? "image/jpeg", dataBase64: d });
  });
  return { label: meta.label, criteria: meta.criteria, images };
}

async function listReferences(env: DemoEnv): Promise<ReferenceMeta[]> {
  if (!env.REFERENCES) return [];
  const listed = await env.REFERENCES.list({ prefix: "ref:", limit: 1000 });
  const metaKeys = listed.keys.map((k) => k.name).filter((n) => n.endsWith(":meta")).slice(0, MAX_REFERENCES);
  const raws = await Promise.all(metaKeys.map((n) => env.REFERENCES!.get(n)));
  const metas: ReferenceMeta[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    try {
      metas.push(JSON.parse(raw) as ReferenceMeta);
    } catch {
      /* 壊れた行は飛ばす */
    }
  }
  metas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return metas;
}

async function handleSaveReference(request: Request, env: DemoEnv, label: string): Promise<Response> {
  if (!env.REFERENCES) return error(501, "references_disabled", "見本の保存は無効です。");
  const k = referenceKey(label);
  if (!k) return error(400, "invalid_label", "型番を入力してください。");
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REFERENCE_BODY_BYTES) return error(413, "payload_too_large", "見本の写真が大きすぎます。");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, "invalid_form", "リクエストの形式が不正です。");
  }
  const images = readImages(form, MAX_REFERENCE_IMAGES);
  if (images instanceof Response) return images;
  const criteria = (formString(form, "criteria") ?? "").slice(0, MAX_CRITERIA_LENGTH);
  const keepImages = formString(form, "keepImages") === "1" && images.length === 0;
  const thumbnails = form
    .getAll("thumbnail")
    .filter((t): t is string => typeof t === "string" && t.startsWith("data:image/") && t.length <= MAX_THUMBNAIL_LENGTH)
    .slice(0, images.length);

  const prevRaw = await env.REFERENCES.get(metaKey(k));
  const prev = prevRaw ? (JSON.parse(prevRaw) as ReferenceMeta) : null;
  const prevCount = prev?.imageCount ?? 0;

  if (keepImages && prev) {
    // 基準だけ更新。写真はそのまま残す
    if (prevCount === 0 && !criteria.trim()) return error(400, "empty_reference", "見本の写真か品質基準のどちらかは必要です。");
    const meta: ReferenceMeta = { ...prev, criteria, updatedAt: new Date().toISOString() };
    await env.REFERENCES.put(metaKey(k), JSON.stringify(meta));
    return json(meta);
  }
  if (images.length === 0 && !criteria.trim()) return error(400, "empty_reference", "見本の写真か品質基準のどちらかは必要です。");

  const meta: ReferenceMeta = {
    label: label.trim().normalize("NFKC"),
    criteria,
    imageCount: images.length,
    mimeTypes: images.map((img) => img.mimeType),
    thumbnails,
    updatedAt: new Date().toISOString(),
  };
  // 新しい写真を書き、前の登録で余った分は消す(枚数が減った場合)
  await Promise.all([
    ...images.map((img, i) => env.REFERENCES!.put(imageKey(k, i), img.dataBase64)),
    ...Array.from({ length: Math.max(0, prevCount - images.length) }, (_, j) => env.REFERENCES!.delete(imageKey(k, images.length + j))),
  ]);
  await env.REFERENCES.put(metaKey(k), JSON.stringify(meta));
  return json(meta);
}

async function handleDeleteReference(env: DemoEnv, label: string): Promise<Response> {
  if (!env.REFERENCES) return error(501, "references_disabled", "見本の保存は無効です。");
  const k = referenceKey(label);
  if (!k) return error(400, "invalid_label", "型番を入力してください。");
  const raw = await env.REFERENCES.get(metaKey(k));
  if (!raw) return error(404, "not_found", "この型番の見本は登録されていません。");
  const count = (JSON.parse(raw) as ReferenceMeta).imageCount ?? 0;
  await Promise.all([env.REFERENCES.delete(metaKey(k)), ...Array.from({ length: count }, (_, i) => env.REFERENCES!.delete(imageKey(k, i)))]);
  return json({ ok: true });
}

/* ---------- 判定 ---------- */

async function handleInspect(request: Request, env: DemoEnv): Promise<Response> {
  if (!env.GEMINI_API_KEY) return error(500, "server_not_configured", "サーバーに API キーが設定されていません。");

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_INSPECT_BODY_BYTES) return error(413, "payload_too_large", "写真が大きすぎます。枚数を減らすか撮り直してください。");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, "invalid_form", "リクエストの形式が不正です。");
  }
  const images = readImages(form, MAX_IMAGES);
  if (images instanceof Response) return images;
  if (images.length === 0) return error(400, "no_images", "写真を1枚以上送ってください。");
  const itemLabel = formString(form, "itemLabel")?.slice(0, MAX_ITEM_LABEL_LENGTH);
  const useReference = formString(form, "useReference") === "1";

  try {
    const reference = useReference ? await loadReference(env, itemLabel) : null;
    const result = await inspectImages(
      { itemLabel, images, reference },
      {
        apiKey: env.GEMINI_API_KEY,
        model: resolveModel(env),
        thinkingLevel: resolveThinkingLevel(env),
        mediaResolution: resolveMediaResolution(env),
      },
    );
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
    const { pathname } = url;

    if (pathname === "/api/config" && request.method === "GET") {
      const body: ConfigResponse = {
        passcodeRequired: Boolean(env.DEMO_PASSCODE?.trim()),
        model: resolveModel(env),
        maxImages: MAX_IMAGES,
        referencesEnabled: Boolean(env.REFERENCES),
      };
      return json(body);
    }

    if (pathname.startsWith("/api/")) {
      if (!passcodeOk(request, env)) return error(401, "passcode_required", "合言葉が違います。");

      if (pathname === "/api/inspect") {
        if (request.method !== "POST") return error(405, "method_not_allowed", "POST のみ対応です。");
        return handleInspect(request, env);
      }
      if (pathname === "/api/references" && request.method === "GET") {
        return json({ references: await listReferences(env) });
      }
      const m = pathname.match(/^\/api\/references\/([^/]+)$/);
      if (m) {
        let label: string;
        try {
          label = decodeURIComponent(m[1]);
        } catch {
          return error(400, "invalid_label", "型番が不正です。");
        }
        if (request.method === "PUT" || request.method === "POST") return handleSaveReference(request, env, label);
        if (request.method === "DELETE") return handleDeleteReference(env, label);
        if (request.method === "GET") {
          const k = referenceKey(label);
          const raw = k && env.REFERENCES ? await env.REFERENCES.get(metaKey(k)) : null;
          return raw ? new Response(raw, { headers: JSON_HEADERS }) : error(404, "not_found", "この型番の見本は登録されていません。");
        }
        return error(405, "method_not_allowed", "対応していないメソッドです。");
      }
      return error(404, "not_found", "存在しないエンドポイントです。");
    }

    // SPA: 静的アセットに無いパスは index.html にフォールバックさせる(not_found_handling)。
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<DemoEnv>;
