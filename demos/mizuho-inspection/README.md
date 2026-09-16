# mizuho-inspection (MEKIKI)

塗装済み金属部品の外観検品を、スマホ写真で体験するデモ。サービス名は「MEKIKI(目利き)」。写真をアップロードすると Gemini が傷・凹み・塗装ムラの候補を位置付きで返し、固定ポリシーで OK / 要確認 / NG を決めます。

- 判定は AI の一次判定。結論(OK/NG)はモデルに書かせず `shared/contract.ts` の `deriveVerdict` で決める
- 座標は Gemini の `box_2d` (0〜1000) を 0〜1 に正規化し、CSS のパーセントで写真に重ねる
- 写真は端末側で長辺 1280px・900KB 以下の JPEG に縮小し、base64 のまま multipart で送る。Worker は文字列を走査も再エンコードもせず Gemini へ渡す (Workers 無料枠の CPU 10ms を守るため。SDK 経由だと 4 枚で 26ms だった)
- 記録は端末の localStorage に残し、CSV で書き出せる
- **型番ごとに正常品の見本写真(最大 2 枚)と品質基準の文章を登録**でき(Workers KV)、判定時に「見本と比べて差分だけ報告」「基準で severity を決める」よう指示する。「見本と基準を使う」スイッチで ON / OFF を切り替えて結果を比べられる
- 「テストデータで試す」で同梱サンプルを読み込める。サンプルの組は `shared/contract.ts` の `SAMPLE_SETS` で定義し、読み込むと型番ごとの見本と基準が自動登録される(基準を変えると登録済みの基準も更新される)

## 同梱サンプル

| 組 | 型番 | 中身 | 置き場 |
| --- | --- | --- | --- |
| 白色塗装ボックス | FB-W | 瑞穂機械製作所から預かった実物の写真。良品 1 枚、不良品 2 枚(白い面に細い線傷)。見本は良品と同じ写真 | `public/samples/white/`。**顧客の写真なので git 管理外**(`.gitignore`)。デプロイには含まれる。手元にない場合は Downloads の「合否判定」フォルダの OK / NG1 / NG2 を長辺 1280px に縮小して置く |
| グレー塗装ボックス | MB-200 | Flickr ユーザー nimrlondon「NIMR 004: Breathalyzer in Metal Box」(CC BY 2.0) を切り抜いたもの。同じ個体を 3 アングルから: 見本 = 天面、良品 = 斜め上、不良品 = 側面(下半分に線傷) | `public/samples/grey/` |

グレーの元写真: 見本 https://www.flickr.com/photos/125989912@N08/14867983988 / 良品 https://www.flickr.com/photos/125989912@N08/15054209272 / 不良品 https://www.flickr.com/photos/125989912@N08/14867837159

## 白色ボックス(実物)の実測 (2026-09-16、gemini-3.6-flash / thinking LOW / 解像度 HIGH)

| 写真 | 見本なし | 見本 + 基準あり |
| --- | --- | --- |
| 良品 | OK | OK |
| 不良品 1 (中央に細い線傷) | 要確認 (傷を軽微と判断) | NG (傷を重大として検出、位置一致) |
| 不良品 2 (右寄りに細い線傷) | 要確認 (傷を軽微と判断) | NG (同上) |

原寸 4000px と 1280px 縮小で結果は同じだった。基準の「線状の引っかき傷は細くても短くても NG」が効いている。

## 見本の効果 (2026-09-15 実測、同梱サンプル、gemini-3.6-flash / thinking LOW)

| 写真 | 見本なし | 見本 + 基準あり |
| --- | --- | --- |
| 良品 | 要確認 (エッジの擦れ・帯金具の変色・点状の跡など軽微 4 件) | OK |
| 不良品 | 要確認 (線傷 2 件と角の擦れを軽微と判断) | NG (線傷 2 件を重大として検出。基準の「線傷は長さを問わず NG」が効く) |

基準は「顧客の基準が厳しく、わずかな不良も見逃せない」というヒアリング内容に合わせ、平らな塗装面の線状の引っかき傷は長さを問わず NG にしてある (`shared/contract.ts` の `SAMPLE_CRITERIA`)。箱の角やエッジに沿った擦れは不良扱いしない。

本番で撮った動作確認のスクリーンショットは [docs/screenshots/](docs/screenshots/README.md) にある。

手元で追加して試せる画像(同じ製品の別アングル、別製品、新しい型番として登録する例)は [docs/extra-samples/](docs/extra-samples/README.md) にある。

## 構成

| パス | 役割 |
| --- | --- |
| `src/` | React SPA (Vite) |
| `worker/index.ts` | Workers API: `GET /api/config`, `POST /api/inspect` (multipart: itemLabel / useReference / image=base64 / mimeType), `GET/PUT/DELETE /api/references[/:label]` (KV) |
| `shared/` | 型、JSON スキーマ、判定ポリシー、プロンプト、Gemini REST 呼び出し(SDK 不使用) |
| `scripts/smoke.ts` | サーバーなしで Gemini 連携だけ確かめる (`--ref` で見本、`--criteria` で同梱の品質基準を付けられる) |
| `public/samples/` | 同梱サンプル画像(見本 / 良品 / 不良品)。出典は上記 |

## ローカル

```bash
pnpm install
cp .dev.vars.example .dev.vars   # GEMINI_API_KEY を入れる
pnpm dev                          # http://localhost:5173
```

Gemini 連携だけ確かめる:

```bash
pnpm dlx tsx scripts/smoke.ts public/samples/target-ng.jpg                                        # 見本なし
pnpm dlx tsx scripts/smoke.ts public/samples/target-ng.jpg --ref=public/samples/reference.jpg --criteria   # 見本 + 基準あり
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
