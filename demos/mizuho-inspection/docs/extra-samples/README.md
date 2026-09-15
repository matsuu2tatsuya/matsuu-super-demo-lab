# 手元で追加して試す画像

同梱サンプル(型番 MB-200)以外に、「写真を選ぶ」から手で追加して試すための画像。すべて Flickr の CC ライセンス写真を切り抜いたもの。型番欄の入れ方で挙動が変わるので、下の「試し方」の欄を目安にする。

## 同じ製品(MB-200)の別アングル

| ファイル | 内容 | 試し方 | 期待する結果 |
| --- | --- | --- | --- |
| `mb200-side-panel.jpg` | 側面パネル(プレートと手書きの「2」あり) | 型番 MB-200、見本 ON | 手書き文字は「その他」で拾う可能性あり。基準に「側面のプレートと手書き番号は仕様」と足すと消える。基準編集のデモ向き |
| `mb200-open-lid.jpg` | 蓋を開けて内部の機器が見える | 型番 MB-200、見本 ON | 基準に「内側は対象外」があるので内部は報告しない想定。外装の傷だけ拾えば正しい |
| `mb200-side-scratched-full.jpg` | 不良品サンプルの切り抜き前(机の上、余白あり) | 型番 MB-200、見本 ON | NG。切り抜かなくても同じ傷を拾えることの確認用 |

出典: nimrlondon「NIMR 004: Breathalyzer in Metal Box」(CC BY 2.0)
https://www.flickr.com/photos/125989912@N08/15054218502 / .../14867816559 / .../14867837159

## 別製品(見本なしで一般知識だけの判定を見る)

| ファイル | 内容 | 試し方 | 期待する結果 |
| --- | --- | --- | --- |
| `green-firstaid-box.jpg` | 緑塗装の鉄箱。天面に細かい擦れ、定規が写る | 型番なし | 要確認〜NG。擦れを拾う。定規や文字を不良と言わないかを見る |
| `ammo-can-front.jpg` | 弾薬缶の正面。塗装剥がれと擦れ多数 | 型番なし | NG 寄り。ステンシル文字を不良と言わないかを見る |
| `ammo-can-rusty-lid.jpg` | 弾薬缶。蓋の縁に錆、塗装剥がれ | 型番なし | NG。錆は「その他」で報告される |
| `ammo-can-clean.jpg` | 綺麗めの弾薬缶 | 型番なし | OK か軽微数件。ステンシル文字の扱いを見る |
| `grey-cabinet-wall.jpg` | グレーの屋外キャビネット(平面、スリット) | 型番なし | OK 寄り。スリットを不良と言わないかを見る |
| `grey-box-on-pole.jpg` | 電柱に付いたグレーの箱。汚れと番号 | 型番なし | 要確認。汚れを「その他」で拾う |

出典:
- green-firstaid-box: hudsonthego (CC BY 2.0) https://www.flickr.com/photos/45788203@N00/5044765721
- ammo-can-front: houdoken (CC BY-SA 2.0) https://www.flickr.com/photos/24067977@N00/3495466866
- ammo-can-rusty-lid: Rusty Clark ~ 100K Photos (CC BY 2.0) https://www.flickr.com/photos/23206546@N04/8078232781
- ammo-can-clean: cachemania (CC BY-SA 2.0) https://www.flickr.com/photos/30116775@N02/3987390629
- grey-cabinet-wall: joostmarkerink (CC BY 2.0) https://www.flickr.com/photos/36320532@N05/29644006138
- grey-box-on-pole: Horia Varlan (CC BY 2.0) https://www.flickr.com/photos/10361931@N06/4617630753

## 別製品を新しい型番として登録して試す

弾薬缶なら `ammo-can-clean.jpg` を見本、`ammo-can-front.jpg` や `ammo-can-rusty-lid.jpg` を検品対象にすると「見本と基準を登録する」流れをもう 1 製品で見せられる。型番は例えば AC-50。基準の例:

```
対象は緑色に塗装された鉄製の弾薬缶の外面。側面のステンシル文字、蓋のハンドル、留め金は製品の仕様。
塗装が剥がれて下地や錆が見えている箇所は NG。線状の傷は 5mm 以上で NG。
```

## 手元で撮るなら

スマホで撮る場合は次の 3 枚があれば同じ流れを再現できる。

1. 見本: 傷のない面を正面から、影が入らないように
2. 良品: 同じ製品を少し違う角度で
3. 不良品: 同じ製品にマスキングテープや鉛筆で線を付ける、または実際に傷のある個体

塗装面が一色で、ボックス状のものなら何でもよい(工具箱、電気のボックス、缶など)。
