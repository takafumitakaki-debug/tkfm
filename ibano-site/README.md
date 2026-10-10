# イバノ コーポレートサイト TOP（AIで作るWebサイト）

`docs/02_top_wireframe.md` のワイヤーフレームを、実際に動くサイトにしたもの。
動画「AIでWebサイトを作る方法」の手順どおりに作っている。

| STEP | 動画の内容 | このフォルダでやったこと |
|---|---|---|
| 1 | AI（Claude Code）でサイトを作る | Next.js 15 + Tailwind CSS 4 でプロジェクトを作り、TOP の全セクション（S00〜S09）を実装 |
| 2 | **Framer Motion** を組み込む | `framer-motion` を導入。スクロールで出る演出、FV の写真クロスフェード、カードのホバー、読了バーなど |
| 3 | **UI UX Pro Max** スキルを追加 | スキルの配色・フォント・モーションのデータ（食品 × B2B）をもとに `app/globals.css` のデザイントークンを決定 |
| 4 | **21st.dev** のコンポーネントを使う | 21st.dev でよく使われる型（Animated Hero／Number Ticker／Marquee）を `components/ui/` に用意 |

## 見方

```bash
cd ibano-site
npm install
npm run dev        # http://localhost:3000
```

`npm run build` で `out/` に静的ファイルが出る（そのままどこにでも置ける）。

## 動きの一覧（Framer Motion）

| 場所 | 動き | ファイル |
|---|---|---|
| ヘッダー | スクロールすると背景が付く／上部に読了バー | `components/sections/header.tsx` |
| FV | 現場写真4枚のゆっくりしたクロスフェード＋ズーム、パララックス、「厨房／食卓／ホテル／居酒屋」の単語入れ替え | `components/sections/hero.tsx`, `components/ui/rotating-text.tsx` |
| 各章 | 画面に入ると下から順番に出る（0.5秒・0.08秒ずつ） | `components/ui/reveal.tsx` |
| 03 事業 | 数字のカウントアップ、カードのホバーで写真が少し寄る | `components/ui/number-ticker.tsx` |
| 05 地域の後 | 横に流れる帯 | `components/ui/marquee.tsx` |

OS で「視差効果を減らす」をオンにしている人には、動きを止めて表示する（`components/providers.tsx`）。

## デザインの決め方（UI UX Pro Max）

- 業種データ「Restaurant/Food Service」＋「B2B Service」を合成：精肉を連想させる深い赤 `#9f1d1d`、沖縄の陽の金 `#a16207`、生成りの背景 `#fbf7f0`
- 見出しは明朝（信頼・歴史）、本文はゴシック
- スキルのチェック項目：文字のコントラスト 4.5:1 以上、タップ領域 44px 以上、絵文字をアイコンに使わない（lucide の SVG）、スマホで横スクロールが出ない

## 自分のPCで STEP 3・4 をやるとき

この作業環境では、外部のスキルのインストールと 21st.dev への接続が制限されていたため、以下は自分のPCで実行する。

```bash
# STEP 3：UI UX Pro Max スキルを Claude Code に追加
npm install -g ui-ux-pro-max-cli
cd ibano-site && uipro init --ai claude
#   または Claude Code の中で
#   /plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
#   /plugin install ui-ux-pro-max@ui-ux-pro-max-skill

# STEP 4：21st.dev で気に入ったコンポーネントの「コード1行」をコピーして実行
npx shadcn@latest add "https://21st.dev/r/<作者>/<コンポーネント名>"
```

## 仮置きのもの

- 写真はすべて色の枠（中の文字が撮影指示）。撮影後に `components/ui/photo.tsx` を `next/image` に差し替える
- 【 】の文字は正式原稿待ち。会社情報の数字（社員数など）は要確認
