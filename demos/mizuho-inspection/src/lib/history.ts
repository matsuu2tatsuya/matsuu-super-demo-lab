import { DEFECT_LABEL_JA, DEFECT_TYPES, VERDICT_LABEL_JA, type DefectType, type InspectResponse } from "../../shared/contract";

export interface HistoryImage {
  thumbnailDataUrl: string;
  defectCount: number;
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  itemLabel: string;
  result: InspectResponse;
  images: HistoryImage[];
}

const STORAGE_KEY = "mizuho-inspection.history.v1";
const MAX_ENTRIES = 50;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* 容量超過などは無視。デモなので失われても致命的でない */
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function countByType(result: InspectResponse): Record<DefectType, number> {
  const counts = Object.fromEntries(DEFECT_TYPES.map((t) => [t, 0])) as Record<DefectType, number>;
  for (const img of result.images) for (const d of img.defects) counts[d.type] += 1;
  return counts;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel でそのまま開ける CSV (BOM 付き)。数値は数値のまま入れる。 */
export function toCsv(entries: HistoryEntry[]): string {
  const header = ["日時", "対象", "判定", "理由", "写真枚数", ...DEFECT_TYPES.map((t) => `${DEFECT_LABEL_JA[t]}(件)`), "所要時間(秒)", "モデル"];
  const rows = entries.map((e) => {
    const counts = countByType(e.result);
    return [
      new Date(e.createdAt).toLocaleString("ja-JP"),
      e.itemLabel,
      VERDICT_LABEL_JA[e.result.verdict],
      e.result.reasonJa,
      e.images.length,
      ...DEFECT_TYPES.map((t) => counts[t]),
      Math.round(e.result.latencyMs / 100) / 10,
      e.result.model,
    ].map(csvCell).join(",");
  });
  return `﻿${[header.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}
