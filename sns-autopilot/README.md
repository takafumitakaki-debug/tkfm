# SNS Autopilot ― Instagram / LINE 自動運用ツール

投稿の **予約投稿**・**AI による投稿文作成（Claude）**・**分析レポート** を、サーバーなしで GitHub Actions だけで回すツール。
特定の会社に依存しない汎用ツールで、ブランドごとの設定は `brand.yaml` に書く。

## 運用の流れ

```
① 投稿ファイルを書く       posts/2026-10-20-autumn-menu.yaml（status: draft, brief に元ネタ）
        │  push
② AI が文面を作る          [SNS generate captions] が Claude で本文・ハッシュタグを生成 → 確認用 PR
        │  人が PR で確認・修正し、status: approved にしてマージ
③ 予定時刻に自動投稿       [SNS publish] が15分ごとに確認し、Instagram / LINE に公開 → state/state.json に記録
        │
④ 毎週レポート             [SNS weekly report] が月曜朝に前週分を reports/YYYY-MM-DD.md にまとめる
```

**AI が書いた文面がそのまま公開されることはない。** 公開されるのは人が `status: approved` にしたものだけ。

## 投稿ファイル

`posts/` に1投稿1ファイル。書き方は [`posts/_example.yaml`](posts/_example.yaml) を参照（`_` で始まるファイルは無視される）。

| 項目 | 内容 |
|---|---|
| `id` | 投稿ID（英数字・`-`・`_`）。二重投稿防止のキーなので、公開後は変えない |
| `status` | `draft`（下書き）/ `approved`（承認済み＝予約投稿の対象） |
| `scheduled_at` | 投稿日時。タイムゾーン省略時は `Asia/Tokyo` |
| `platforms` | `instagram` / `line` |
| `brief` | AI に渡す元ネタ。日付・価格などの事実はここに書いたものだけが使われる |
| `images` | 画像の **https 公開URL**。Instagram は1〜10枚（2枚以上はカルーセル、JPEG推奨）、LINE は最大4枚 |
| `caption.instagram` / `caption.line` | 本文。空なら AI が埋める。手書きも可 |
| `hashtags` | Instagram 用ハッシュタグ（最大30個） |

> 画像は Instagram / LINE のサーバーが URL から取りに行くため、ログイン不要で開ける URL が必要。
> GitHub リポジトリが公開なら `https://raw.githubusercontent.com/...` も使える。

## 投稿の安全装置

- **二重投稿の防止**：投稿結果はプラットフォームごとに `state/state.json` に記録し、記録済みのものは二度と出さない。Actions も直列実行
- **LINE の重複配信防止**：投稿IDから作る固定の `X-Line-Retry-Key` を付けて配信するため、タイムアウト後に再実行されても LINE 側で重複が弾かれる
- **部分失敗**：Instagram は成功・LINE は失敗、の場合は次回 LINE だけ再試行。同じ投稿が **3回** 失敗したら停止（`state.json` の該当 `errors` を消すと再開）
- **遅延した投稿は出さない**：予定時刻から **24時間** 以上過ぎた投稿は自動では出さない（古い告知が突然出るのを防ぐ）。出す場合は `scheduled_at` を更新
- **入力チェック**：PR ごとに `validate` が走り、画像URL・文字数・ハッシュタグ数などの不備をマージ前に検出

## セットアップ

### 1. Instagram（Meta Graph API）

1. Instagram を **プロアカウント（ビジネス／クリエイター）** にし、Facebook ページと連携する
2. [Meta for Developers](https://developers.facebook.com/) でアプリを作成し、次の権限を付与する
   - `instagram_basic` / `instagram_content_publish` / `instagram_manage_insights` / `pages_show_list` / `pages_read_engagement`
3. アクセストークンを取得する。**ビジネスマネージャのシステムユーザーで発行したトークン**（無期限）を推奨。
   通常の長期トークンは約60日で切れるので、切れる前に更新が必要
4. Instagram ビジネスアカウントの ID（`IG_USER_ID`）を確認する
   （`GET /me/accounts` → ページID → `GET /{ページID}?fields=instagram_business_account`）

### 2. LINE 公式アカウント（Messaging API）

1. [LINE Developers](https://developers.line.biz/) で公式アカウントの Messaging API を有効にする
2. チャネル設定から **チャネルアクセストークン（長期）** を発行する
3. 一斉配信は料金プランの無料メッセージ通数を消費する（「友だち数 × 配信回数」）。通数に注意

### 3. Claude API

[Claude Console](https://platform.claude.com/) で API キーを発行する。モデルは既定で `claude-opus-5-5`
（リポジトリ変数 `CLAUDE_MODEL` で変更可）。安全分類器が生成を断った場合は、サーバー側で推奨モデルに自動で切り替える設定（fallbacks）を有効にしている。

### 4. GitHub の設定

**Settings → Secrets and variables → Actions** に登録する。

| 種類 | 名前 | 用途 |
|---|---|---|
| Secret | `IG_USER_ID` | Instagram ビジネスアカウントID |
| Secret | `IG_ACCESS_TOKEN` | Meta のアクセストークン |
| Secret | `LINE_CHANNEL_ACCESS_TOKEN` | LINE チャネルアクセストークン |
| Secret | `ANTHROPIC_API_KEY` | Claude API キー |
| Variable（任意） | `SNS_TIMEZONE` | 既定 `Asia/Tokyo` |
| Variable（任意） | `GRAPH_API_VERSION` | 既定 `v23.0`。Meta の廃止スケジュールに合わせて更新 |
| Variable（任意） | `CLAUDE_MODEL` | 既定 `claude-opus-5-5` |

さらに **Settings → Actions → General → Workflow permissions** で
「Read and write permissions」と「Allow GitHub Actions to create and approve pull requests」を有効にする（生成PRの作成と、投稿結果のコミットに必要）。

> 予約投稿・週次レポートの定期実行は **デフォルトブランチ** に置かれたワークフローだけが動く。

### 5. ブランド設定

`brand.yaml` にアカウント名・読者・トーン・NGワード・固定ハッシュタグ・締めの導線を書く。AI はこれに沿って書き、
生成結果に NGワードや【要確認】が残っていれば PR の申し送り欄に警告が出る。

## ローカルで使う

```bash
cd sns-autopilot
pip install -r requirements-dev.txt

python -m sns_autopilot list                  # 投稿キューの一覧（状態つき）
python -m sns_autopilot validate              # 投稿ファイルの検証
python -m sns_autopilot generate              # 下書きの本文を生成（要 ANTHROPIC_API_KEY）
python -m sns_autopilot generate --id 2026-10-20-autumn-menu --force   # 作り直し
python -m sns_autopilot publish --dry-run     # 今投稿されるものを確認（投稿しない）
python -m sns_autopilot report --days 7       # レポート作成
python -m pytest -q                           # テスト
```

手動実行は Actions タブから各ワークフローの「Run workflow」でも可能（publish は dry run も選べる）。

## 構成

```
sns-autopilot/
├── brand.yaml               ブランド設定（AI の文章ルール）
├── posts/                   投稿キュー（人が書く）
├── state/state.json         投稿結果の記録（ツールが書く。手で編集しない）
├── reports/                 週次レポート
└── sns_autopilot/
    ├── posts.py             投稿ファイルの読み書き・検証
    ├── caption.py           Claude による文面生成
    ├── instagram.py         Instagram Graph API（公開・インサイト）
    ├── line.py              LINE Messaging API（一斉配信・インサイト）
    ├── publisher.py         予約投稿の実行
    ├── report.py            レポート作成
    └── state.py             投稿結果の記録
.github/workflows/sns-*.yml  定期実行（publish / generate / report / test）
```

## 制限・注意

- 対応している投稿形式は Instagram の **フィード画像（1枚・カルーセル）** と LINE の **一斉配信（テキスト＋画像）**。リール・ストーリーズ・セグメント配信は未対応
- GitHub Actions の定期実行は混雑時に数分〜十数分遅れることがある。分単位の正確さが必要な投稿には向かない
- Instagram の公開 API は1アカウントあたり24時間で100件まで
- LINE の開封・クリック数は配信の翌日以降に集計され、受信者が少ないと表示されない
- 生成 PR をマージする前に別の投稿ファイルを push すると、同じ下書きに対して PR がもう一つ作られることがある。不要な方は閉じればよい
