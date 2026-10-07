# 株式会社イバノ コーポレートサイト リニューアル ― サイト制作システム

サイト全体の軸：**理念 → フィロソフィ → 事業 → 人 → 地域**
コンセプト：**沖縄の食を支える**（コピーとして連呼せず、各章の内容で意味を証明する）

## 制作システムの全体像

```
① 情報設計 ──→ ② UI/UXデザイン ──→ ③ コーディング ──→ ④ CMS
 docs/00〜05      docs/06            site/ (Astro)       site/public/admin (Decap CMS)
 wireframes/      /styleguide/       docs/07             docs/08
```

| 工程 | 成果物 | 中身 |
|---|---|---|
| ① 情報設計 | [docs/00〜05](docs/00_overview.md)・[wireframes/](wireframes/index.html) | 物語の軸（理念→フィロソフィ→事業→人→地域）、サイトマップ、ワイヤー、優先順位、撮影リスト |
| ② UI/UXデザイン | [docs/06_design_system.md](docs/06_design_system.md)・`/styleguide/` | デザイン原則、トークン（色・文字・余白）、部品、UXの決めごと |
| ③ コーディング | [site/](site/)・[docs/07_coding.md](docs/07_coding.md) | Astro による静的サイト 30ページ超（本体＋採用サブサイト）、レスポンシブ、旧URLリダイレクト、sitemap.xml |
| ④ CMS構築 | `site/public/admin/`・[docs/08_cms.md](docs/08_cms.md) | Decap CMS（Gitベース）。ニュース・インタビュー・募集要項・全ページ原稿・会社データを編集。承認フロー付き |

情報設計の決めごとは、そのままシステムの仕組みになっている。

| 情報設計の決めごと | システムでの実装 |
|---|---|
| 章番号を全ページで共通化 | 章データ（`content/chapters/`）1か所からナビ・TOP・章扉・「次の章へ」を生成 |
| 正式原稿がない所は創作しない | 【…】を自動で青い破線表示。`npm run check:placeholders` で残数を集計し、公開前ゲートにできる |
| 公開情報からの仮置きは要確認 | `{ value, confirmed }` で管理し、未確認は「要確認」バッジ。CMS のスイッチで解除 |
| インタビューは PEOPLE と RECRUIT で共通データ | 1つのインタビューから両サイトのページを生成 |
| 事業は原稿が揃い次第、下層ページに分割 | CMS の「独立ページにする」スイッチで /business/{id}/ を生成 |
| 地域カテゴリのニュースを 05 地域に自動表示 | NEWS で「地域」を選ぶだけで 05 地域ページに最新3件 |

### すぐに見る

```bash
cd site && npm install && npm run dev   # → http://localhost:4321
```

## 情報設計の成果物

| No | 内容 | ファイル |
|---|---|---|
| — | 設計の前提・全体方針・把握済みの事実・ヒアリング項目・コピー方針 | [docs/00_overview.md](docs/00_overview.md) |
| ① | サイトマップ・グローバルナビ・ユーザー別導線 | [docs/01_sitemap.md](docs/01_sitemap.md) |
| ② | TOPページ詳細ワイヤー（目的／見出し／説明文／写真／CTA／リンク先） | [docs/02_top_wireframe.md](docs/02_top_wireframe.md) |
| ③ | 下層ページワイヤー（ABOUT / PHILOSOPHY / BUSINESS / PEOPLE / AREA / RECRUIT / COMPANY / NEWS / CONTACT） | [docs/03_lower_pages.md](docs/03_lower_pages.md) |
| ④ | コンテンツ優先順位（必須／あると良い／今後追加） | [docs/04_content_priority.md](docs/04_content_priority.md) |
| ⑤ | 写真・素材リスト（撮影指示） | [docs/05_photo_list.md](docs/05_photo_list.md) |
| — | ブラウザで見るワイヤーフレーム | [wireframes/index.html](wireframes/index.html) |
| ⑥ | UI/UX デザインシステム | [docs/06_design_system.md](docs/06_design_system.md) |
| ⑦ | コーディング（実装構成・公開手順・公開前チェックリスト） | [docs/07_coding.md](docs/07_coding.md) |
| ⑧ | CMS 構築・運用マニュアル | [docs/08_cms.md](docs/08_cms.md) |

## ワイヤーフレーム（HTML）の見方

`wireframes/index.html` をブラウザで開く（ビルド不要）。

- 上部の黒いバーで全ページを切り替え。「注釈を表示」で右側の注釈（黄色）を出し入れできる
- **グレーの×印ボックス**＝写真（中に撮影イメージを記載）
- **青い破線の文字**＝仮置き原稿（【経営理念原稿を配置】など）。正式原稿が届くまで創作しない
- **オレンジの「要確認」**＝公開情報から仮置きした事実。クライアント確認が必要
- 画面幅 860px 以下でスマートフォン表示（注釈は各セクションの下に回る）

## 注意

イバノの会社情報（創業年・所在地・代表者・事業・店舗など）は、公式サイトに作業環境から直接アクセスできなかったため、検索結果・第三者サイトの掲載情報をもとに仮置きしている。正式原稿の入稿時にすべて確認すること。
