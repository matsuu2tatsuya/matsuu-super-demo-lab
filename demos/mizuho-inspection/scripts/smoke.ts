/**
 * サーバーを立てずに Gemini 連携だけを確かめる。
 *   pnpm dlx tsx scripts/smoke.ts [画像パス] [--levels=LOW,HIGH] [--res=HIGH]
 * API キーは環境変数 GEMINI_API_KEY か .dev.vars から読む。
 */
import { existsSync, readFileSync } from "node:fs";
import { MediaResolution, ThinkingLevel } from "@google/genai";
import { inspectImages } from "../worker/index";
import type { ImageMimeType } from "../shared/contract";

function loadDevVars(): Record<string, string> {
  if (!existsSync(".dev.vars")) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const opt = (name: string, def: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;
const vars = loadDevVars();
const apiKey = process.env.GEMINI_API_KEY ?? vars.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY がありません");
  process.exit(1);
}
const model = process.env.GEMINI_MODEL ?? opt("model", "gemini-3.6-flash");
const levels = opt("levels", "LOW").split(",");
const resName = opt("res", "HIGH");
const mediaResolution = resName === "MEDIUM" ? MediaResolution.MEDIA_RESOLUTION_MEDIUM : resName === "LOW" ? MediaResolution.MEDIA_RESOLUTION_LOW : MediaResolution.MEDIA_RESOLUTION_HIGH;

const images = (files.length ? files : ["scripts/sample.png"]).map((path) => {
  const lower = path.toLowerCase();
  const mimeType: ImageMimeType = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return { mimeType, dataBase64: readFileSync(path).toString("base64") };
});

for (const levelName of levels) {
  const thinkingLevel = ThinkingLevel[levelName as keyof typeof ThinkingLevel] ?? ThinkingLevel.LOW;
  const res = await inspectImages({ itemLabel: "smoke", images }, { apiKey, model, thinkingLevel, mediaResolution });
  console.log(`\n=== thinking=${levelName} res=${resName} model=${model} ===`);
  console.log(`verdict=${res.verdict} latency=${res.latencyMs}ms reason=${res.reasonJa}`);
  for (const img of res.images) {
    console.log(`- image ${img.imageIndex}: quality=${img.quality} ${img.qualityNoteJa}`);
    for (const d of img.defects) {
      const box = d.box ? `box=(${d.box.x.toFixed(2)},${d.box.y.toFixed(2)} ${d.box.width.toFixed(2)}x${d.box.height.toFixed(2)})` : "box=none";
      console.log(`    ${d.type}/${d.severity} conf=${d.confidence} ${box} ${d.descriptionJa}`);
    }
  }
  console.log(`overall: ${res.overallCommentJa}`);
}
