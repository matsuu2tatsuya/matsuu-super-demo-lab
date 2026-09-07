/**
 * クライアントと Worker で共有する契約。
 * - Gemini には「観察結果」だけを返させ、OK / 要確認 / NG の判定はこちらの固定ポリシーで決める。
 * - 座標は Gemini の box_2d ([ymin, xmin, ymax, xmax] を 0〜1000 に正規化) を 0〜1 の {x, y, width, height} に変換して扱う。
 */

export const DEFECT_TYPES = ["scratch", "dent", "paint_unevenness", "other"] as const;
export type DefectType = (typeof DEFECT_TYPES)[number];

export const DEFECT_LABEL_JA: Record<DefectType, string> = {
  scratch: "傷",
  dent: "凹み",
  paint_unevenness: "塗装ムラ",
  other: "その他",
};

export const SEVERITIES = ["minor", "major"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABEL_JA: Record<Severity, string> = {
  minor: "軽微",
  major: "重大",
};

export const IMAGE_QUALITIES = ["ok", "blurry", "dark", "not_target"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

export const IMAGE_QUALITY_LABEL_JA: Record<ImageQuality, string> = {
  ok: "判定可能",
  blurry: "不鮮明",
  dark: "暗い",
  not_target: "対象外",
};

export type Verdict = "ok" | "review" | "ng";

export const VERDICT_LABEL_JA: Record<Verdict, string> = {
  ok: "OK",
  review: "要確認",
  ng: "NG",
};

export const MAX_IMAGES = 4;
/** クライアントが縮小後に守る上限。Worker 側もこの値で拒否する。 */
export const MAX_IMAGE_BYTES = 900_000;
export const MAX_IMAGE_DIMENSION = 1280;
export const MAX_ITEM_LABEL_LENGTH = 60;

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export interface InspectRequestImage {
  mimeType: ImageMimeType;
  /** base64 (data: プレフィックス無し) */
  dataBase64: string;
}

export interface InspectRequest {
  itemLabel?: string;
  images: InspectRequestImage[];
}

/** 0〜1 に正規化した矩形。CSS のパーセント指定でそのまま重ねられる。 */
export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Defect {
  type: DefectType;
  severity: Severity;
  /** 0〜1 */
  confidence: number;
  box: NormalizedBox | null;
  descriptionJa: string;
}

export interface ImageResult {
  imageIndex: number;
  quality: ImageQuality;
  qualityNoteJa: string;
  defects: Defect[];
}

export interface InspectResponse {
  verdict: Verdict;
  reasonJa: string;
  images: ImageResult[];
  overallCommentJa: string;
  latencyMs: number;
  model: string;
}

export interface ConfigResponse {
  passcodeRequired: boolean;
  model: string;
  maxImages: number;
}

export interface ApiError {
  error: string;
  messageJa: string;
}

/** Gemini に返させる生の形。 */
export interface GeminiDefectOut {
  type: DefectType;
  severity: Severity;
  confidence: number;
  box_2d: number[];
  descriptionJa: string;
}

export interface GeminiImageOut {
  imageIndex: number;
  quality: ImageQuality;
  qualityNoteJa: string;
  defects: GeminiDefectOut[];
}

export interface GeminiOut {
  images: GeminiImageOut[];
  overallCommentJa: string;
}

/**
 * responseJsonSchema に渡す JSON Schema。
 * Gemini 公式ドキュメントの物体検出例に合わせ、box_2d は [ymin, xmin, ymax, xmax] を 0〜1000 で返させる。
 */
export const GEMINI_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    images: {
      type: "array",
      description: "入力画像ごとの観察結果。入力と同じ順番、同じ枚数で返す。",
      items: {
        type: "object",
        properties: {
          imageIndex: { type: "integer", description: "0 始まりの入力画像の番号" },
          quality: {
            type: "string",
            enum: [...IMAGE_QUALITIES],
            description: "ok=判定できる, blurry=ピンボケ, dark=暗すぎる, not_target=塗装された金属部品が写っていない",
          },
          qualityNoteJa: { type: "string", description: "写真の状態についての短い日本語の補足。問題なければ空文字。" },
          defects: {
            type: "array",
            description: "この画像で見つかった不良候補。無ければ空配列。",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: [...DEFECT_TYPES] },
                severity: { type: "string", enum: [...SEVERITIES] },
                confidence: { type: "number", description: "0〜1。実際に不良である確からしさ。" },
                box_2d: {
                  type: "array",
                  items: { type: "integer" },
                  description: "[ymin, xmin, ymax, xmax] を 0〜1000 に正規化した位置",
                },
                descriptionJa: { type: "string", description: "何がどう見えるかを日本語で1文" },
              },
              required: ["type", "severity", "confidence", "box_2d", "descriptionJa"],
            },
          },
        },
        required: ["imageIndex", "quality", "qualityNoteJa", "defects"],
      },
    },
    overallCommentJa: { type: "string", description: "全体の所見を日本語で1〜2文。判定(OK/NG)は書かない。" },
  },
  required: ["images", "overallCommentJa"],
} as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** box_2d ([ymin, xmin, ymax, xmax], 0〜1000) を 0〜1 の矩形へ。壊れていれば null。 */
export function boxFromBox2d(box2d: unknown): NormalizedBox | null {
  if (!Array.isArray(box2d) || box2d.length !== 4) return null;
  const nums = box2d.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : NaN));
  if (nums.some((v) => Number.isNaN(v))) return null;
  const [ymin, xmin, ymax, xmax] = nums.map((v) => clamp01(v / 1000));
  const x = Math.min(xmin, xmax);
  const y = Math.min(ymin, ymax);
  const width = Math.abs(xmax - xmin);
  const height = Math.abs(ymax - ymin);
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/** 重大と扱う確度の下限。これ未満は「要確認」に落とす。 */
export const MAJOR_CONFIDENCE_THRESHOLD = 0.5;

/**
 * 固定ポリシーで判定を決める。モデルには判定させない。
 * 見逃しより誤検知を許容する側に倒している(不良候補があれば必ず人が見る)。
 */
export function deriveVerdict(images: ImageResult[]): { verdict: Verdict; reasonJa: string } {
  const notTarget = images.filter((img) => img.quality === "not_target");
  if (notTarget.length > 0) {
    return {
      verdict: "review",
      reasonJa: `${notTarget.length}枚の写真で検品対象が確認できません。撮り直すか、人が確認してください。`,
    };
  }

  const allDefects = images.flatMap((img) => img.defects);
  const majors = allDefects.filter((d) => d.severity === "major" && d.confidence >= MAJOR_CONFIDENCE_THRESHOLD);
  if (majors.length > 0) {
    const types = Array.from(new Set(majors.map((d) => DEFECT_LABEL_JA[d.type]))).join("・");
    return { verdict: "ng", reasonJa: `重大な不良候補(${types})を${majors.length}件検出しました。` };
  }

  if (allDefects.length > 0) {
    const types = Array.from(new Set(allDefects.map((d) => DEFECT_LABEL_JA[d.type]))).join("・");
    return {
      verdict: "review",
      reasonJa: `軽微または確度の低い不良候補(${types})が${allDefects.length}件あります。人の再確認が必要です。`,
    };
  }

  const unclear = images.filter((img) => img.quality === "blurry" || img.quality === "dark");
  if (unclear.length > 0) {
    return { verdict: "review", reasonJa: `${unclear.length}枚の写真が不鮮明です。不良は見つかりませんでしたが撮り直しを推奨します。` };
  }

  return { verdict: "ok", reasonJa: "不良候補は見つかりませんでした。" };
}

/** Gemini の生出力を検証しつつ ImageResult[] に変換する。壊れた要素は捨てる。 */
export function normalizeGeminiOut(raw: unknown, imageCount: number): { images: ImageResult[]; overallCommentJa: string } {
  const out = (raw ?? {}) as Partial<GeminiOut>;
  const byIndex = new Map<number, ImageResult>();

  for (const img of Array.isArray(out.images) ? out.images : []) {
    if (!img || typeof img !== "object") continue;
    const idx = Number((img as GeminiImageOut).imageIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= imageCount || byIndex.has(idx)) continue;
    const quality = IMAGE_QUALITIES.includes((img as GeminiImageOut).quality) ? (img as GeminiImageOut).quality : "ok";
    const defects: Defect[] = [];
    for (const d of Array.isArray((img as GeminiImageOut).defects) ? (img as GeminiImageOut).defects : []) {
      if (!d || typeof d !== "object") continue;
      const type = DEFECT_TYPES.includes(d.type) ? d.type : "other";
      const severity = SEVERITIES.includes(d.severity) ? d.severity : "minor";
      const confidence = typeof d.confidence === "number" && Number.isFinite(d.confidence) ? clamp01(d.confidence) : 0;
      defects.push({
        type,
        severity,
        confidence,
        box: boxFromBox2d(d.box_2d),
        descriptionJa: typeof d.descriptionJa === "string" ? d.descriptionJa.slice(0, 200) : "",
      });
    }
    byIndex.set(idx, {
      imageIndex: idx,
      quality,
      qualityNoteJa: typeof (img as GeminiImageOut).qualityNoteJa === "string" ? (img as GeminiImageOut).qualityNoteJa.slice(0, 200) : "",
      defects,
    });
  }

  const images: ImageResult[] = [];
  for (let i = 0; i < imageCount; i += 1) {
    images.push(
      byIndex.get(i) ?? { imageIndex: i, quality: "blurry", qualityNoteJa: "この写真の結果が返ってきませんでした。", defects: [] },
    );
  }

  return {
    images,
    overallCommentJa: typeof out.overallCommentJa === "string" ? out.overallCommentJa.slice(0, 400) : "",
  };
}
