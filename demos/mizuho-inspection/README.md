# mizuho-inspection

塗装済み金属部品の外観検品を、スマホ写真で体験するデモ。写真をアップロードすると Gemini が傷・凹み・塗装ムラの候補を位置付きで返し、固定ポリシーで OK / 要確認 / NG を決めます。

- 判定は AI の一次判定。結論(OK/NG)はモデルに書かせず `shared/contract.ts` の `deriveVerdict` で決める
- 座標は Gemini の `box_2d` (0〜1000) を 0〜1 に正規化し、CSS のパーセントで写真に重ねる
- 写真は端末側で長辺 1280px・900KB 以下の JPEG に縮小し、base64 のまま multipart で送る。Worker は文字列を走査も再エンコードもせず Gemini へ渡す (Workers 無料枠の CPU 10ms を守るため。SDK 経由だと 4 枚で 26ms だった)
- 記録は端末の localStorage に残し、CSV で書き出せる

## 構成

| パス | 役割 |
| --- | --- |
| `src/` | React SPA (Vite) |
| `worker/index.ts` | Workers API: `GET /api/config`, `POST /api/inspect` (multipart: itemLabel / image=base64 / mimeType) |
| `shared/` | 型、JSON スキーマ、判定ポリシー、プロンプト、Gemini REST 呼び出し(SDK 不使用) |
| `scripts/smoke.ts` | サーバーなしで Gemini 連携だけ確かめる |

## ローカル

```bash
pnpm install
cp .dev.vars.example .dev.vars   # GEMINI_API_KEY を入れる
pnpm dev                          # http://localhost:5173
```

Gemini 連携だけ確かめる:

```bash
node scripts/make-sample.mjs                       # 検証用の合成画像を作る
pnpm dlx tsx scripts/smoke.ts scripts/sample.png    # --levels=LOW,HIGH --res=HIGH
```

## デプロイ (Cloudflare Workers)

```bash
npx wrangler login                        # 初回のみ
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put DEMO_PASSCODE     # 任意。空なら誰でも使える
pnpm run deploy
```

モデルや解像度は `wrangler.jsonc` の `vars` で変える (`GEMINI_MODEL`, `GEMINI_THINKING_LEVEL`, `GEMINI_MEDIA_RESOLUTION`)。
