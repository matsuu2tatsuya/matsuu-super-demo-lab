# mizuho-inspection

塗装済み金属部品の外観検品を、スマホ写真で体験するデモ。写真をアップロードすると Gemini が傷・凹み・塗装ムラの候補を位置付きで返し、固定ポリシーで OK / 要確認 / NG を決めます。

- 判定は AI の一次判定。結論(OK/NG)はモデルに書かせず `shared/contract.ts` の `deriveVerdict` で決める
- 座標は Gemini の `box_2d` (0〜1000) を 0〜1 に正規化し、CSS のパーセントで写真に重ねる
- 写真は端末側で長辺 1280px・900KB 以下の JPEG に縮小し、base64 のまま multipart で送る。Worker は文字列を走査も再エンコードもせず Gemini へ渡す (Workers 無料枠の CPU 10ms を守るため。SDK 経由だと 4 枚で 26ms だった)
- 記録は端末の localStorage に残し、CSV で書き出せる
- **型番ごとに正常品の見本写真(最大 2 枚)と品質基準の文章を登録**でき(Workers KV)、判定時に「見本と比べて差分だけ報告」「基準で severity を決める」よう指示する。「見本と基準を使う」スイッチで ON / OFF を切り替えて結果を比べられる
- 「テストデータで試す」で同梱サンプル(型番 SAMPLE-BOX)を読み込める。サンプルには穴・継ぎ目・刻印・スリット・溶接ビード・意匠エンボスの「仕様の形状」を入れてある

## 見本の効果 (2026-09-07 本番実測、同梱サンプル)

| 写真 | 見本なし | 見本 + 基準あり |
| --- | --- | --- |
| 良品 | NG (溶接ビードを重大な傷と誤認) | OK |
| 不良品 | 重大 3 件 (溶接ビードの誤認を含む) + ムラ軽微 | 重大 3 件 (傷・凹み・ムラ)。誤認なし。ムラは基準の「3cm 以上は NG」で重大に |

## 構成

| パス | 役割 |
| --- | --- |
| `src/` | React SPA (Vite) |
| `worker/index.ts` | Workers API: `GET /api/config`, `POST /api/inspect` (multipart: itemLabel / useReference / image=base64 / mimeType), `GET/PUT/DELETE /api/references[/:label]` (KV) |
| `shared/` | 型、JSON スキーマ、判定ポリシー、プロンプト、Gemini REST 呼び出し(SDK 不使用) |
| `scripts/smoke.ts` | サーバーなしで Gemini 連携だけ確かめる |
| `scripts/make-samples.mjs` | 同梱サンプル画像(見本 / 良品 / 不良品)を依存なしで生成する |
| `public/samples/` | 生成したサンプル画像 |

## ローカル

```bash
pnpm install
cp .dev.vars.example .dev.vars   # GEMINI_API_KEY を入れる
pnpm dev                          # http://localhost:5173
```

Gemini 連携だけ確かめる:

```bash
node scripts/make-samples.mjs                      # 検証用の合成画像を作る
pnpm dlx tsx scripts/smoke.ts scripts/sample.png    # --levels=LOW,HIGH --res=HIGH
```

## デプロイ (Cloudflare Workers)

```bash
npx wrangler login                        # 初回のみ
npx wrangler kv namespace create REFERENCES   # 初回のみ。出力された id を wrangler.jsonc の kv_namespaces に入れる
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put DEMO_PASSCODE     # 任意。空なら誰でも使える
pnpm run deploy
```

モデルや解像度は `wrangler.jsonc` の `vars` で変える (`GEMINI_MODEL`, `GEMINI_THINKING_LEVEL`, `GEMINI_MEDIA_RESOLUTION`)。
