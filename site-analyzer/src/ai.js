// （任意）Claude による改善原稿の自動作成。ANTHROPIC_API_KEY 等の認証情報がある場合のみ動作する
import fs from 'node:fs';
import path from 'node:path';

const MODEL = process.env.SITE_ANALYZER_MODEL || 'claude-opus-5-5';

async function getClient() {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    return new Anthropic();
  } catch {
    return null;
  }
}

const SYSTEM = `あなたは日本語SEO・コンテンツ設計・AI検索最適化（LLMO/GEO）の専門家です。
クロールで取得したページ情報と検出済みの課題をもとに、実装担当者がそのまま使える改善案を作成します。
- 事実（会社名・数値・実績・所在地など）は入力に含まれるものだけを使い、創作しない。不明な情報は【要確認：〜】と書く。
- 見出しは「見出しだけで内容が分かる」具体的な文言にし、AIが単独で引用できるよう各セクション冒頭は結論から書く。
- 出力はMarkdownのみ。前置きや締めの挨拶は書かない。`;

async function ask(client, prompt) {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('モデルが応答を辞退しました');
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

function pageBrief(p, ap, issues, meta) {
  const chunks = (ap?.chunks || []).slice(0, 25).map((c) => `[${c.level ? 'h' + c.level : '本文'}] ${c.heading}（${c.chars}字, スコア${c.score}${c.issues.length ? ', 問題: ' + c.issues.join(' / ') : ''}）\n${c.text.slice(0, 700)}`).join('\n\n');
  return `# 対象ページ
URL: ${p.url}
種別: ${p.pageType}
現在のtitle: ${p.title || '(なし)'}
現在のmeta description: ${p.metaDescription || '(なし)'}
主要キーワード（自動抽出）: ${(meta?.keywords || []).join(', ')}
見出し構造:
${(p.headings || []).map((h) => `${'  '.repeat(h.level - 1)}h${h.level}: ${h.text}`).join('\n')}

検出された課題: ${issues.join(' / ') || 'なし'}

# 本文チャンク
${chunks}`;
}

export async function runAI(result, outDir, { pages: maxPages = 5, onProgress = () => {} } = {}) {
  const client = await getClient();
  if (!client) return { available: false, reason: '@anthropic-ai/sdk が見つかりません' };
  const { crawl, audit, aio, gen, scores } = result;
  const html = crawl.pages.filter((p) => p.title !== undefined && !p.isRedirect && p.status === 200);
  const targets = html.slice().sort((a, b) => (b.internalRank || 0) - (a.internalRank || 0)).slice(0, maxPages);
  const dir = path.join(outDir, 'files', 'ai');
  fs.mkdirSync(dir, { recursive: true });
  const out = { available: true, model: MODEL, pages: [], strategy: null, errors: [] };

  try {
    onProgress({ phase: 'ai', message: 'Claude がサイト全体の改善戦略を作成中' });
    const issueSummary = audit.issues.map((i) => `- [${i.severity}] ${i.title}: ${i.count}件`).join('\n');
    const pageList = html.slice(0, 80).map((p) => `- ${p.url} | ${p.pageType} | ${p.title} | 深度${p.depth ?? '-'} | 被リンク${p.inlinks}`).join('\n');
    out.strategy = await ask(client, `次のサイトの解析結果から「サイト改善戦略書」を作成してください。

構成:
1. 現状の要約（3行）
2. 最優先で直すべき5項目（理由・具体的手順・期待効果）
3. 推奨サイトストラクチャー（現状のページ一覧をもとに、カテゴリ・ハブページ・不足ページを含むツリー）
4. AI検索（LLMO）対策の方針：チャンク設計ルール、llms.txt、構造化データ、エンティティ情報
5. 新規作成すべきコンテンツ案（タイトル案・狙う検索意図）10本
6. 30日間の実行ロードマップ（週単位）

サイト: ${crawl.home}
スコア: 総合${scores.overall} / SEO${scores.seo} / AI対策${scores.aio} / 構造${scores.structure}
サイト全体のキーワード: ${result.keywords.site.slice(0, 20).map((k) => k.term).join(', ')}
AI対策の未対応項目: ${aio.siteChecks.filter((c) => !c.ok).map((c) => c.label).join(' / ')}

検出課題:
${issueSummary}

ページ一覧:
${pageList}`);
    fs.writeFileSync(path.join(dir, 'strategy.md'), out.strategy);
  } catch (e) {
    out.errors.push(`戦略書: ${e.message}`);
  }

  for (const [i, p] of targets.entries()) {
    onProgress({ phase: 'ai', message: `Claude が改善原稿を作成中 (${i + 1}/${targets.length})` });
    try {
      const issues = audit.issues.filter((x) => x.urls.includes(p.url)).map((x) => x.title);
      const ap = aio.pages.find((a) => a.url === p.url);
      const md = await ask(client, `${pageBrief(p, ap, issues, gen.meta[p.url])}

上記ページの改善版を作成してください。構成:
## title案（3案、全角30字前後）
## meta description案（2案、全角80〜120字）
## 推奨見出し構造（h1〜h3のツリー。現状からの変更理由を各行に短く併記）
## AI検索向けに書き換えたチャンク原稿
（スコアの低いチャンクから最大5つ。各チャンクを「質問形または具体的な見出し」＋「結論から始まる300〜600字の本文」に書き直す。箇条書き・表を適宜使う）
## 追加すべきFAQ（5問。ユーザーが実際に検索・AIに質問しそうな文言で。回答は本文の事実のみで書く）
## 追加推奨の内部リンク（アンカーテキスト案とリンク先の種類）`);
      const file = `ai/page-${String(i + 1).padStart(2, '0')}.md`;
      fs.writeFileSync(path.join(outDir, 'files', file), `# ${p.url}\n\n${md}`);
      out.pages.push({ url: p.url, file, markdown: md });
    } catch (e) {
      out.errors.push(`${p.url}: ${e.message}`);
    }
  }
  return out;
}
