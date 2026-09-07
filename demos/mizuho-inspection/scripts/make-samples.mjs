// 依存なしで検証・デモ用の PNG を 3 枚作る。
//   public/samples/reference.png  正常品の見本(仕様の形状: 四隅の穴・継ぎ目・刻印プレート・通気スリット)
//   public/samples/target-ok.png  良品(見本と同じ形状。照明だけ少し違う)
//   public/samples/target-ng.png  不良品(同じ形状 + 傷 + 凹み + 塗装ムラ)
//   scripts/sample.png            = target-ng.png (smoke 用)
// 精度の検証ではなく、「見本があると仕様の形状を不良と誤認しなくなる」ことを見せるための合成画像。
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const W = 960, H = 720;

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function makeImage({ gradient, seed, defects }) {
  const px = new Uint8Array(W * H * 3);
  const rnd = seeded(seed);
  const get = (x, y) => { const i = (y * W + x) * 3; return [px[i], px[i + 1], px[i + 2]]; };
  const set = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
  const add = (x, y, d) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; for (let c = 0; c < 3; c += 1) px[i + c] = Math.max(0, Math.min(255, px[i + c] + d)); };
  const onPlate = (x, y) => x > 80 && x < W - 80 && y > 60 && y < H - 60;

  // 作業台 + 塗装板(わずかな照明勾配とノイズ)
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (!onPlate(x, y)) { set(x, y, 118, 94, 70); continue; }
    const g = 122 + Math.round(gradient.x * (x / W)) + Math.round(gradient.y * (y / H)) + Math.round((rnd() - 0.5) * 4);
    set(x, y, g, g + 2, g + 5);
  }
  // 板の縁(面取りのハイライト)
  for (let x = 80; x < W - 80; x += 1) { add(x, 61, 28); add(x, 62, 14); add(x, H - 62, -22); }
  for (let y = 60; y < H - 60; y += 1) { add(81, y, 20); add(W - 82, y, -18); }

  // 仕様の形状 1: 四隅の穴(暗い穴 + 明るいリム)
  for (const [cx, cy] of [[140, 120], [820, 120], [140, 600], [820, 600]]) {
    for (let y = cy - 24; y <= cy + 24; y += 1) for (let x = cx - 24; x <= cx + 24; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < 16) set(x, y, 38, 38, 40);
      else if (d < 21) add(x, y, 34);
    }
  }
  // 仕様の形状 2: 水平の継ぎ目(暗線 + 直下の明線 = エンボス)
  for (let x = 80; x < W - 80; x += 1) { add(x, 359, -34); add(x, 360, -30); add(x, 361, 22); }
  // 仕様の形状 3: 刻印プレート(明るい矩形 + 暗い縁 + 文字風の短いバー)
  for (let y = 90; y <= 170; y += 1) for (let x = 540; x <= 780; x += 1) {
    const edge = x <= 542 || x >= 778 || y <= 92 || y >= 168;
    if (edge) set(x, y, 70, 72, 76); else add(x, y, 36);
  }
  for (const [bx, by, bw] of [[560, 108, 90], [560, 124, 140], [560, 140, 60], [660, 140, 90]]) {
    for (let y = by; y < by + 6; y += 1) for (let x = bx; x < bx + bw; x += 1) set(x, y, 62, 64, 68);
  }
  // 仕様の形状 4: 通気スリット 5 本
  for (let k = 0; k < 5; k += 1) {
    const sx = 330 + k * 70;
    for (let y = 560; y <= 600; y += 1) for (let x = sx; x <= sx + 40; x += 1) {
      const rr = 8, inX = x - sx, inY = y - 560;
      const cornerOut = (inX < rr && inY < rr && Math.hypot(inX - rr, inY - rr) > rr) || (inX > 40 - rr && inY < rr && Math.hypot(inX - (40 - rr), inY - rr) > rr)
        || (inX < rr && inY > 40 - rr && Math.hypot(inX - rr, inY - (40 - rr)) > rr) || (inX > 40 - rr && inY > 40 - rr && Math.hypot(inX - (40 - rr), inY - (40 - rr)) > rr);
      if (!cornerOut) set(x, y, 52, 54, 58);
    }
  }

  // 仕様の形状 5: 溶接ビード(左側の縦方向のうねった暗い線。傷と誤認しやすい)
  for (let t = 0; t <= 1; t += 0.0004) {
    const y = 140 + t * 440, x = 118 + Math.sin(t * 40) * 3 + Math.sin(t * 7) * 2;
    for (let dx = -2; dx <= 2; dx += 1) { const xi = Math.round(x) + dx, yi = Math.round(y); add(xi, yi, dx === 0 ? -48 : -26); }
    add(Math.round(x) + 3, Math.round(y), 18);
  }
  // 仕様の形状 6: 意匠の丸いエンボス 3 個(右側。凹みと誤認しやすい)
  for (const [cx, cy] of [[790, 300], [790, 380], [790, 460]]) {
    for (let y = cy - 26; y <= cy + 26; y += 1) for (let x = cx - 26; x <= cx + 26; x += 1) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d < 22) add(x, y, Math.round(30 * ((dy - dx) / 44)));
      else if (d < 25) add(x, y, 16);
    }
  }

  if (defects) {
    // 傷: 斜めの暗い線
    for (let t = 0; t <= 1; t += 0.0005) {
      const x = Math.round(220 + t * 330), y = Math.round(200 + t * 120);
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) set(x + dx, y + dy, 40, 40, 44);
    }
    // 凹み: 片側が暗く片側が明るい円
    for (let y = 400; y < 540; y += 1) for (let x = 180; x < 320; x += 1) {
      const dx = x - 250, dy = y - 470, d = Math.hypot(dx, dy);
      if (d < 55) add(x, y, Math.round(45 * ((dx - dy) / 110)));
    }
    // 塗装ムラ: 明るいぼんやりした楕円
    for (let y = 400; y < 520; y += 1) for (let x = 500; x < 720; x += 1) {
      const d = ((x - 610) / 95) ** 2 + ((y - 460) / 50) ** 2;
      if (d < 1) { const k = 1 - d; const [r, g, b] = get(x, y); set(x, y, Math.min(255, r + 40 * k), Math.min(255, g + 38 * k), Math.min(255, b + 30 * k)); }
    }
  }
  return px;
}

// PNG エンコード
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
const crc32 = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function encodePng(px) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y += 1) { raw[y * (W * 3 + 1)] = 0; Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/samples", { recursive: true });
const files = {
  "public/samples/reference.png": makeImage({ gradient: { x: 16, y: 6 }, seed: 11, defects: false }),
  "public/samples/target-ok.png": makeImage({ gradient: { x: 10, y: 14 }, seed: 23, defects: false }),
  "public/samples/target-ng.png": makeImage({ gradient: { x: 14, y: 8 }, seed: 37, defects: true }),
};
for (const [path, px] of Object.entries(files)) { const png = encodePng(px); writeFileSync(path, png); console.log(`wrote ${path} (${Math.round(png.length / 1024)}KB)`); }
writeFileSync("scripts/sample.png", encodePng(files["public/samples/target-ng.png"]));
