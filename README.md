# 株式会社イバノ コーポレートサイト リニューアル ― 情報設計・ワイヤーフレーム

サイト全体の軸：**理念 → フィロソフィ → 事業 → 人 → 地域**
コンセプト：**沖縄の食を支える**（コピーとして連呼せず、各章の内容で意味を証明する）

## 成果物

| No | 内容 | ファイル |
|---|---|---|
| — | 設計の前提・全体方針・把握済みの事実・ヒアリング項目・コピー方針 | [docs/00_overview.md](docs/00_overview.md) |
| ① | サイトマップ・グローバルナビ・ユーザー別導線 | [docs/01_sitemap.md](docs/01_sitemap.md) |
| ② | TOPページ詳細ワイヤー（目的／見出し／説明文／写真／CTA／リンク先） | [docs/02_top_wireframe.md](docs/02_top_wireframe.md) |
| ③ | 下層ページワイヤー（ABOUT / PHILOSOPHY / BUSINESS / PEOPLE / AREA / RECRUIT / COMPANY / NEWS / CONTACT） | [docs/03_lower_pages.md](docs/03_lower_pages.md) |
| ④ | コンテンツ優先順位（必須／あると良い／今後追加） | [docs/04_content_priority.md](docs/04_content_priority.md) |
| ⑤ | 写真・素材リスト（撮影指示） | [docs/05_photo_list.md](docs/05_photo_list.md) |
| — | ブラウザで見るワイヤーフレーム | [wireframes/index.html](wireframes/index.html) |

## ワイヤーフレーム（HTML）の見方

`wireframes/index.html` をブラウザで開く（ビルド不要）。

- 上部の黒いバーで全ページを切り替え。「注釈を表示」で右側の注釈（黄色）を出し入れできる
- **グレーの×印ボックス**＝写真（中に撮影イメージを記載）
- **青い破線の文字**＝仮置き原稿（【経営理念原稿を配置】など）。正式原稿が届くまで創作しない
- **オレンジの「要確認」**＝公開情報から仮置きした事実。クライアント確認が必要
- 画面幅 860px 以下でスマートフォン表示（注釈は各セクションの下に回る）

## 注意

イバノの会社情報（創業年・所在地・代表者・事業・店舗など）は、公式サイトに作業環境から直接アクセスできなかったため、検索結果・第三者サイトの掲載情報をもとに仮置きしている。正式原稿の入稿時にすべて確認すること。

---

## 別ツール：Site Analyzer

URL1つでSEO監査・ページリスト・サイト構造・見出し・AI検索対策（チャンク設計）・予測ヒートマップを解析し、改善ファイルまで生成するツールを [site-analyzer/](site-analyzer/README.md) に収録。
