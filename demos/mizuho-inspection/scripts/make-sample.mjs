// 依存なしで検証用の PNG を作る: グレーの塗装板に「傷」「塗装ムラ」「凹み」らしきものを描く。
// 精度の検証ではなく、API 契約・座標変換・レイテンシの確認用。
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 960, H = 720;
const px = new Uint8Array(W * H * 3);
const set = (x, y, r, g, b) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = r; px[i + 1] = g; px[i + 2] = b;
};
// 板: 中央に少しグラデーションの付いたグレー、周囲は作業台っぽい茶色
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  const onPlate = x > 80 && x < W - 80 && y > 60 && y < H - 60;
  if (!onPlate) { set(x, y, 120, 96, 72); continue; }
  const shade = 118 + Math.round(18 * (x / W)) + Math.round(6 * Math.sin(y / 40));
  set(x, y, shade, shade + 2, shade + 5);
}
// 傷: 細い暗い線(斜め)
for (let t = 0; t <= 1; t += 0.0005) {
  const x = Math.round(220 + t * 380), y = Math.round(180 + t * 260);
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) set(x + dx, y + dy, 40, 40, 44);
}
// 塗装ムラ: 明るいぼんやりした楕円
for (let y = 130; y < 260; y += 1) for (let x = 600; x < 800; x += 1) {
  const d = ((x - 700) / 90) ** 2 + ((y - 195) / 55) ** 2;
  if (d < 1) { const k = 1 - d; const i = (y * W + x) * 3; px[i] = Math.min(255, px[i] + 40 * k); px[i + 1] = Math.min(255, px[i + 1] + 38 * k); px[i + 2] = Math.min(255, px[i + 2] + 30 * k); }
}
// 凹み: 片側が暗く片側が明るい円(陰影)
for (let y = 430; y < 560; y += 1) for (let x = 240; x < 370; x += 1) {
  const dx = x - 305, dy = y - 495, d = Math.sqrt(dx * dx + dy * dy);
  if (d < 55) { const k = (dx - dy) / 110; const i = (y * W + x) * 3; for (let c = 0; c < 3; c += 1) px[i + c] = Math.max(0, Math.min(255, px[i + c] + 45 * k)); }
}

// PNG エンコード
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
const crc32 = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y += 1) { raw[y * (W * 3 + 1)] = 0; Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
const out = process.argv[2] ?? "scripts/sample.png";
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
