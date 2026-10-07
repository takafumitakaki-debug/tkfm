# Site Analyzer

**URLを1つ入れるだけ**で、サイトを丸ごとクロールして解析し、**改善案と改善方法を提示、さらに改善ファイルまで作成**するツールです。
GA4・Search Console・計測タグの事前設置は不要です。

| 機能 | 内容 |
|---|---|
| SEO監査（Ahrefs Site Audit 相当） | ステータス／リダイレクト／canonical／noindex／title・description／見出し／薄い・重複コンテンツ／カニバリ／画像alt／内部リンク／リンク切れ／速度／モバイル／OGP／構造化データなど50項目以上。各課題に「なぜ問題か」「改善方法」を付与し、重要度別にスコア化 |
| ページリスト | 全ページの種別・title・文字数・h1/h2・クリック深度・被内部リンク・内部ランク（内部PageRank）・AI対策スコア・応答速度。並べ替え・絞り込み・CSV |
| サイトストラクチャー | URL階層のツリー図、クリック深度分布、孤立ページ、深すぎるページ、ハブページ不足、リンク評価が集まるページ |
| 見出し（hタグ） | ページ別のアウトライン表示、h1なし/複数・階層の飛び・空見出しを検出し、修正後の見出し構造を生成 |
| AI検索対策（LLMO/GEO） | 本文を見出し単位の**チャンク**に分割して採点（長さ・自己完結性・指示語始まり・抽象見出し・定義文・数値・リスト化）し、分割案・見出し案を提示。AIクローラー（GPTBot / ClaudeBot / PerplexityBot 等）の許可状況、llms.txt、構造化データ、E-E-A-T要素をチェック |
| ヒートマップ | 実ブラウザで描画し、**注視・クリック・スクロール到達の予測ヒートマップ**（デスクトップ/スマホ）を生成。LCP・CLS・TTFB計測、CTA位置・ファーストビュー・コントラスト・タップ領域の所見つき。さらに**GA4不要の自前計測タグ**（`t.js`）で実測クリック/スクロールも重ねて表示 |
| キーワード・リンク | サイト/ページ別の主要トピック抽出（日本語分かち書き）、カニバリ候補、重複コンテンツ、アンカーテキスト、外部リンク先 |
| 改善ファイル生成 | `sitemap.xml` / `robots.txt`（AIボット設定入り） / `llms.txt` / ページ別 JSON-LD（Organization・WebSite・BreadcrumbList・Article・FAQPage） / title・description改善案CSV / 見出し修正案 / チャンク書き換え指示書 / 優先順位付き改善計画書 / ページ・課題CSV |
| Claudeによる改善原稿（任意） | `ANTHROPIC_API_KEY` を設定すると、サイト改善戦略書（推奨サイト構造・新規コンテンツ案・30日ロードマップ）と、主要ページの title案・見出し案・AI向けチャンク書き換え原稿・FAQ を自動作成 |

## 使い方

Node.js 20 以上が必要です。

```bash
cd site-analyzer
npm install
npx playwright install chromium   # ヒートマップを使う場合（初回のみ）
```

### Web画面で使う

```bash
npm start
# → http://localhost:3000 を開き、URLを入力して「解析する」
```

### コマンドラインで使う

```bash
node bin/cli.js https://example.com
node bin/cli.js https://example.com --max-pages 500 --heatmap 5
```

| オプション | 説明 |
|---|---|
| `--max-pages <n>` | クロールする最大ページ数（既定 200） |
| `--heatmap <n>` | 予測ヒートマップを作るページ数（既定 3、0で無効） |
| `--ai-pages <n>` | Claude で改善原稿を作るページ数（既定 5） |
| `--no-ai` | Claude を使わない |
| `--ignore-robots` | robots.txt を無視（自社サイトの検証用） |
| `--no-external` | 外部リンクのリンク切れチェックを省略 |
| `--out <dir>` | 出力先（既定 `reports/<ホスト名-日時>/`） |

### 出力

```
reports/example.com-2026-10-07T12-00-00/
├── report.html          ← ブラウザで開くレポート（タブ：ダッシュボード／課題と改善／ページリスト／サイト構造／見出し／AI対策／キーワード／リンク／ヒートマップ／改善ファイル）
├── data.json            ← 全解析データ
├── shots/               ← ヒートマップ用スクリーンショット
└── files/               ← そのまま使える改善ファイル
    ├── sitemap.xml, robots.txt, llms.txt
    ├── jsonld/*.html            ページ別の構造化データ（<head>に貼り付け）
    ├── meta-suggestions.csv     title / description 改善案
    ├── headings-fix.md          見出し構造の修正案
    ├── chunk-rewrite.md         AI検索向けチャンク書き換え指示書
    ├── improvement-plan.md      優先順位付き改善計画書
    ├── pages.csv, issues.csv    ページリスト・課題一覧（Excel対応）
    └── ai/                      Claude による戦略書・改善原稿（APIキー設定時）
```

### Claude による改善原稿

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node bin/cli.js https://example.com --ai-pages 10
```

既定モデルは `claude-opus-5-5`（`SITE_ANALYZER_MODEL` で変更可）。拒否時のサーバー側フォールバック（`fallbacks: "default"`）を有効にしています。入力にない事実は創作せず【要確認】と出力するよう指示していますが、公開前に必ず内容を確認してください。

### 実測ヒートマップ（GA4不要）

`npm start` で起動したサーバーを対象サイトから到達できる場所に置き、対象サイトの `</body>` 直前に次を設置します。

```html
<script src="https://（このサーバー）/t.js" defer></script>
```

クリック位置（ページ幅に対する割合と縦位置）とスクロール深度のみを `data/events.jsonl` に保存します。Cookie不使用・Do Not Track 尊重。サーバー経由で開いたレポートのヒートマップタブで「実測クリック」「実測スクロール」に表示されます。

## 仕組みと注意点

- **予測ヒートマップ**は、要素の種類・大きさ・文字サイズ・コントラスト・F型視線パターン・スクロール到達率（1画面ごとに約30%減衰）から算出する推定値です。実ユーザーの行動データではないため、意思決定には実測タグの併用を推奨します。
- **他サイトからの被リンク（バックリンク）・検索順位・検索ボリューム**は外部データベースが必要なため対象外です。サイト内の内部リンク構造（内部PageRank）を解析します。
- robots.txt を既定で尊重し、同時接続数4で巡回します。他者のサイトを解析する際は負荷と利用規約に配慮してください。
- Web UI の `/api/analyze` は任意のURLを取得するため、インターネットに公開する場合は認証付きのリバースプロキシの背後に置いてください（`/t.js` と `/collect` のみ公開すれば計測は動作します）。

## テスト

```bash
npm test
```

意図的に問題を含むフィクスチャサイト（`test/fixture-site.js`）を起動し、課題検出・クリック深度・robots.txt解釈・チャンク評価・生成ファイルを検証します。
