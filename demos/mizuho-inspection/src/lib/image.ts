import { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION } from "../../shared/contract";

/** 端末側で縮小・JPEG 化した送信用の写真。 */
export interface PreparedImage {
  id: string;
  fileName: string;
  width: number;
  height: number;
  bytes: number;
  /** 画面プレビュー用 (blob: URL)。不要になったら revoke する。 */
  previewUrl: string;
  /** 送信用 base64 (data: プレフィックス無し) */
  dataBase64: string;
  /** 履歴保存用の小さいサムネイル (data: URL) */
  thumbnailDataUrl: string;
}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const JPEG_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
const THUMBNAIL_MAX = 240;

function fit(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap は EXIF の向きを反映してくれる。非対応ブラウザは <img> にフォールバック。
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode_failed"));
      img.src = url;
    });
  } finally {
    // decode 後に revoke しても描画済みの img は使える
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function sourceSize(src: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if ("naturalWidth" in src) return { width: src.naturalWidth, height: src.naturalHeight };
  return { width: src.width, height: src.height };
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode_failed"))), "image/jpeg", quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}

function draw(src: ImageBitmap | HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(src, 0, 0, width, height);
  return canvas;
}

/**
 * スマホ写真(3〜10MB)を、長辺 MAX_IMAGE_DIMENSION 以下・MAX_IMAGE_BYTES 以下の JPEG に落とす。
 * 画質を段階的に下げ、それでも収まらなければ寸法を 0.82 倍ずつ縮める。
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if ((file.type && !file.type.startsWith("image/")) || file.size > MAX_SOURCE_BYTES) {
    throw new Error("invalid_source_image");
  }
  const src = await decode(file);
  const natural = sourceSize(src);
  let { width, height } = fit(natural.width, natural.height, MAX_IMAGE_DIMENSION);

  let jpeg: Blob | null = null;
  for (let attempt = 0; attempt < 7 && !jpeg; attempt += 1) {
    const canvas = draw(src, width, height);
    for (const quality of JPEG_QUALITIES) {
      const candidate = await toJpeg(canvas, quality);
      if (candidate.size <= MAX_IMAGE_BYTES) {
        jpeg = candidate;
        break;
      }
    }
    if (!jpeg) {
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }
  }
  if (!jpeg) throw new Error("image_too_large");

  const thumbSize = fit(width, height, THUMBNAIL_MAX);
  const thumbnailDataUrl = await toJpeg(draw(src, thumbSize.width, thumbSize.height), 0.7).then(blobToDataUrl);
  if ("close" in src) src.close();

  const dataUrl = await blobToDataUrl(jpeg);
  const dataBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: file.name || "photo.jpg",
    width,
    height,
    bytes: jpeg.size,
    previewUrl: URL.createObjectURL(jpeg),
    dataBase64,
    thumbnailDataUrl,
  };
}

export function prepareErrorMessage(e: unknown): string {
  const code = e instanceof Error ? e.message : "";
  if (code === "invalid_source_image") return "画像ファイルを選んでください(25MB まで)。";
  if (code === "image_too_large") return "この写真は縮小しても大きすぎます。別の写真を選んでください。";
  if (code === "canvas_unavailable") return "このブラウザでは写真を処理できません。";
  return "写真を読み込めませんでした。別の写真をお試しください。";
}
