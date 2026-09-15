# 動作確認スクリーンショット (2026-09-15、本番 URL、iPhone 相当の幅 430px)

https://mizuho-inspection.mizuho-inspection.workers.dev で「テストデータで試す」を使って撮影。判定は gemini-3.6-flash。ページ全体を撮るために固定ヘッダーだけ固定解除している。

| ファイル | 内容 | 結果 |
| --- | --- | --- |
| `01-top.jpg` | 初期画面。記録は空 | - |
| `02-ok-sample-loaded.jpg` | 良品サンプルを読み込んだ直後。型番 MB-200 に見本と基準が登録され、「見本と基準を使う」が ON | - |
| `03-ok-sample-with-reference.jpg` | 良品サンプル、見本 1 枚 + 基準あり | OK |
| `04-ng-sample-with-reference.jpg` | 不良品サンプル、見本 1 枚 + 基準あり | NG (線傷 2 件を重大として検出、位置付き) |
| `05-ng-sample-without-reference.jpg` | 同じ不良品を「見本と基準を使う」OFF で判定 | 要確認 (線傷を軽微と判断、右下の擦れも拾う) |
| `06-ok-sample-without-reference.jpg` | 同じ良品を「見本と基準を使う」OFF で判定。下部の記録に 4 回分の履歴 | 要確認 (エッジの擦れや金具のくすみを拾う) |

見せ方の例: 03 と 06、04 と 05 を並べると「見本と品質基準を登録すると、仕様の形状や許容範囲の擦れを拾わなくなり、本当の不良だけが NG になる」ことが 1 枚で伝わる。
