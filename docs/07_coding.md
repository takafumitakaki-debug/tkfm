# ⑦ コーディング（実装構成）

実装一式は `site/`。静的サイトジェネレーター **Astro** で HTML を書き出し、原稿は Git 上の Markdown / YAML で管理する（データベース・サーバー不要）。

## 1. 構成

```
site/
├─ astro.config.mjs          サイトURL・旧URLリダイレクト・Markdown設定
├─ netlify.toml              Netlify でホストする場合の設定
├─ public/
│   ├─ admin/                CMS 管理画面（Decap CMS）→ docs/08_cms.md
│   ├─ uploads/              CMS からアップロードした画像
│   ├─ _redirects            旧URL → 新URL（301）
│   └─ robots.txt
├─ scripts/check-placeholders.mjs   公開前チェック
└─ src/
    ├─ content.config.ts     コンテンツモデル（型・入力ルール）
    ├─ content/              原稿データ（CMS が編集するのはここだけ）
    │   ├─ chapters/         章 01〜05（名前・問い・TOP予告文・章扉写真）
    │   ├─ settings/         ページごとの原稿（top / about / philosophy / business / people / area / recruit / company / history / contact）
    │   ├─ business/         事業（4つの問い）
    │   ├─ interviews/       社員インタビュー（PEOPLE と RECRUIT で共通）
    │   ├─ news/             ニュース
    │   └─ jobs/             募集要項
    ├─ styles/               tokens.css（デザイントークン）/ base.css
    ├─ components/           部品 → docs/06_design_system.md
    ├─ layouts/              Base（共通）/ Chapter（章ページ骨格）/ Recruit（採用サブサイト）
    ├─ lib/                  データ取得・テキスト整形・【…】ハイライト
    └─ pages/                URL と 1対1 のページテンプレート
```

## 2. ページと URL（docs/01_sitemap.md と対応）

| URL | テンプレート | 主なデータ |
|---|---|---|
| `/` | `pages/index.astro` | top / chapters / about / philosophy / business / people / area / news / recruit / company |
| `/about/` | `pages/about.astro` | about / history（milestone のみ） |
| `/philosophy/` | `pages/philosophy.astro` | philosophy（項目数は可変） |
| `/business/` | `pages/business/index.astro` | business（ページ共通）＋ business/*.md |
| `/business/shop/` | `pages/business/shop.astro` | company.locations（kind: shop） |
| `/business/{id}/` | `pages/business/[slug].astro` | CMS で「独立ページにする」をオンにした事業だけ生成 |
| `/people/` ・ `/people/interview/{slug}/` | `pages/people/` | people / interviews |
| `/area/` | `pages/area.astro` | area / news（地域カテゴリ最新3件を自動表示） |
| `/news/` ・ `/news/page/{n}/` ・ `/news/category/{cat}/` ・ `/news/{id}/` | `pages/news/` | news（20件／ページ） |
| `/company/` | `pages/company.astro` | company / history（全件） |
| `/contact/` ・ `/contact/thanks/` | `pages/contact/` | contact |
| `/recruit/` 以下 9 ページ | `pages/recruit/` | recruit / interviews / jobs / business |
| `/privacy/` ・ `/sitemap/` ・ `/sitemap.xml` ・ `/404` | `pages/` | — |
| `/styleguide/` | `pages/styleguide.astro` | デザインシステム一覧（noindex） |

旧URL：`/recruit/mid-career/` → `/recruit/jobs/mid-career/`、`/company-data.html` → `/company/`（`public/_redirects` と `astro.config.mjs`）。現行サイトの URL 一覧を入手したら `_redirects` に追記する。

## 3. 仕組みのポイント

| 仕組み | 内容 |
|---|---|
| 仮置き原稿の可視化 | 原稿中の `【…】` は自動で青い破線表示（YAML は `lib/text.ts` の `ph()`、Markdown は `lib/rehype-placeholder.mjs`） |
| 要確認の可視化 | 会社データなどは `{ value, confirmed }` の形で持ち、`confirmed: false` の間は「要確認」バッジ |
| 写真の差し替え | `photo: { src, alt, note, no }`。`src` を入れるまでは撮影指示（`note`）と撮影リスト番号（`no`）入りの枠 |
| 二重管理しない | 社員インタビュー（PEOPLE / RECRUIT）、図解「食材が届くまで」（事業 / 人 / 採用）、店舗情報（店舗情報 / 事業 / 会社情報）は 1 つのデータから複数ページに出す |
| 下書き | `draft: true` のニュース・インタビューは本番ビルドに出ない（開発サーバーでは「下書き」表示付きで確認できる） |
| フォーム | `settings/contact.yaml` の `endpoint` が空なら Netlify Forms で受信。他のフォームサービスを使う場合は URL を入れる |

## 4. 開発コマンド

```bash
cd site
npm install
npm run dev                  # 開発サーバー http://localhost:4321
npm run build                # 本番ビルド → site/dist/
npm run preview              # ビルド結果の確認
npm run check                # 型・テンプレートのチェック
npm run check:placeholders   # 仮置き【…】・要確認の残数一覧（-- --strict で残っていればエラー）
npm run cms                  # CMS のローカル編集用サーバー（npm run dev と同時に起動）
```

## 5. 公開（ホスティング）

静的ファイル（`site/dist/`）なので、どのホスティングでも動く。推奨は Git 連携の自動デプロイ。

| 選択肢 | 設定 |
|---|---|
| **Netlify（推奨）** | リポジトリを接続するだけ（`site/netlify.toml` を使用）。フォーム受信もそのまま使える |
| Cloudflare Pages / Vercel | ルートディレクトリ `site`、ビルド `npm run build`、出力 `dist`。フォームは `endpoint` に外部サービスを設定。CMS ログイン用に GitHub OAuth プロキシが必要（docs/08_cms.md §4） |

本番ドメインは環境変数 `SITE_URL`（未設定時 `https://www.ivano.co.jp`）。canonical・OGP・sitemap.xml に使われる。OGP 画像は `public/ogp.png`（1200×630）を用意して置く。

## 6. 公開前チェックリスト

- [ ] `npm run check:placeholders -- --strict` が通る（仮置き・要確認ゼロ）
- [ ] すべての写真に `src` と `alt` が入っている
- [ ] `public/ogp.png` を配置
- [ ] フォームの受信先メールを設定し、4窓口＋エントリーで送信テスト
- [ ] 現行サイトの URL 一覧から `_redirects` を作成
- [ ] Google マップの URL（各拠点）を設定
- [ ] プライバシーポリシーをクライアント確認済みの文面に差し替え
- [ ] `/styleguide/` を公開しない場合は削除（noindex 済み）
