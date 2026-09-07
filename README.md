# matsuu-super-demo-lab

松鵜のデモ置き場。案件ごとのデモを `demos/` 配下に独立したアプリとして置き、それぞれを Cloudflare Workers に公開する。

| デモ | 内容 | URL |
| --- | --- | --- |
| [demos/mizuho-inspection](demos/mizuho-inspection) | スマホ写真から傷・凹み・塗装ムラを検出する AI 外観検品デモ | (デプロイ後に記載) |

## デモを増やすとき

```bash
cd demos
pnpm create cloudflare@latest <name> --framework=react --platform=workers --variant=react-ts --no-deploy --no-git --no-open --no-agents
```

各デモは自分の `package.json` と `wrangler.jsonc` を持ち、そのフォルダで `pnpm run deploy` すれば `<name>.<account>.workers.dev` に公開される。
