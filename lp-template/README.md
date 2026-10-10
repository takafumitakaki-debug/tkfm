# 集客・販売LPテンプレート

**内容を1つのファイルに書くだけで、業種ごとの「お客を集めて、売れる」サイトができる**テンプレート。
デザインと動き（Framer Motion）は共通で、文章・色・料金・画像だけを入れ替える。

```
content/
  types.ts            ← 書ける項目の一覧（ここは触らない）
  site.ts             ← どの内容を使うかを選ぶ1行
  presets/
    web-studio.ts     ← サンプル①：ホームページ制作サービス
    salon.ts          ← サンプル②：整体・サロン（地域のお店）
```

## 入っている「集客 → 販売」の仕組み

| 段階 | 仕組み |
|---|---|
| 見つけてもらう | タイトル・説明文・SNSで共有したときの表示（OGP）を content から自動設定 |
| 興味を持ってもらう | 悩み → 解決 → 特徴 → 実績の数字 → お客様の声 の順で並べる型 |
| 申し込んでもらう | 申込フォーム（ご用件の選択・特典表示・送信完了画面）、LINEボタン、電話、スマホで画面下に出続ける申込ボタン |
| 買ってもらう | 料金プランごとに決済URLを設定できる（Stripe・BASE・STORES・Square など）。URLが無いプランはフォームへ飛び、プラン名が自動で入る |
| 効果を測る | GA4・Metaピクセルのタグを入れると、ボタンのクリック・申込み・決済ボタンを「成果」として記録 |
| 法律まわり | 特定商取引法に基づく表記（`/legal/`）とプライバシーポリシー（`/privacy/`）のページを自動生成 |

## 新しいお客様のサイトを作る手順

1. `content/presets/web-studio.ts` をコピーして、`content/presets/お客様名.ts` を作る
2. 中身を書き換える（文章・色・料金・FAQ・特商法の情報）
3. `content/site.ts` の1行を、そのファイルに向ける
4. 写真を `public/images/` に入れて、`image: { src: "/images/hero.jpg", alt: "…" }` のように書く
5. `npm run dev` で確認 → `npm run build` で `out/` を公開

セクションの順番を入れ替える・不要なものを消すのも、`sections` の並びを変えるだけでできる。
使えるセクション：`hero` `logos` `problems` `features` `stats` `testimonials` `pricing` `flow` `faq` `lead` `cta`

### AIに中身を書いてもらうとき

Claude Code にこう頼むと、ヒアリング内容から preset を1つ作ってくれる。

> lp-template の content/types.ts の型に沿って、content/presets/○○.ts を作って。
> 業種：○○、地域：○○、強み：○○、料金：○○、ターゲット：○○。
> 色は業種に合うものを選んで、site.ts をそのファイルに切り替えて。

## 外部サービスとのつなぎ方（どれも無料から始められる）

| やりたいこと | 設定する場所 | 例 |
|---|---|---|
| フォームの内容をメールで受け取る | `formEndpoint` | [Formspree](https://formspree.io) でフォームを作り、`https://formspree.io/f/xxxx` を貼る。未設定のあいだは、送信するとメールソフトが開く |
| オンラインで決済する | 各プランの `checkoutUrl` | Stripe の「Payment Links」、BASE・STORES の商品ページのURL |
| LINEで集客する | `contact.lineUrl` | LINE公式アカウントの友だち追加URL |
| アクセスと成果を測る | `analytics.gaId` / `analytics.metaPixelId` | GA4 の測定ID（G-XXXX）、Metaピクセル ID |

GA4 に送られるイベント：`cta_click`（申込ボタン）、`checkout_click`（決済ボタン）、`generate_lead`（フォーム送信）、`line_click`（LINE）。

## 公開する

`npm run build` で `out/` フォルダに静的ファイルができる。サーバーは要らない。

- **Vercel / Netlify / Cloudflare Pages**：GitHub のリポジトリをつなぎ、ルートディレクトリを `lp-template`、ビルドコマンドを `npm run build`、公開フォルダを `out` にする
- お客様ごとに別のURLにしたいときは、preset ごとにブランチを分けるか、このフォルダをコピーして別リポジトリにする

## 公開前チェック

- [ ] 「サンプル」と書いた数字・お客様の声を、実際のものに差し替えた（架空の実績・口コミは景品表示法違反になりうる）
- [ ] 特商法の表記（`legal`）を実際の情報で埋めた
- [ ] プライバシーポリシー（`app/privacy/page.tsx`）を実際の取り扱いに合わせた
- [ ] `formEndpoint` を設定し、テスト送信が届いた
- [ ] 決済URLでテスト購入した
- [ ] スマホで最後まで見て、申込みまで操作できた

## デザインの基準（UI UX Pro Max のルールから）

- 文字のコントラスト 4.5:1 以上、ボタンの高さ 44px 以上
- アイコンは SVG（lucide）。絵文字は使わない
- スマホで横スクロールが出ない
- 動きは 0.25〜0.7 秒。OS で「視差効果を減らす」にしている人には動きを止める
