// 改善ファイル生成：title/description案・見出し修正案・JSON-LD・sitemap.xml・robots.txt・llms.txt・CSV・改善計画書
import fs from 'node:fs';
import path from 'node:path';
import { csvRow, displayWidth, truncateWidth, slugify, isJapanese } from './util.js';
import { AI_BOTS } from './crawler.js';

export function inferSiteName(pages, home) {
  const homePage = pages.find((p) => p.url === home) || pages[0];
  const ws = pages.flatMap((p) => p.jsonld || []).find((j) => /WebSite|Organization/.test(j.type) && j.data.name);
  if (homePage?.og?.site_name) return homePage.og.site_name;
  if (ws) return ws.data.name;
  // titleの共通サフィックス（「〜｜サイト名」）
  const counts = new Map();
  for (const p of pages) {
    const parts = (p.title || '').split(/\s*[|｜\-–—:：]\s*/).filter(Boolean);
    if (parts.length > 1) { const s = parts[parts.length - 1]; counts.set(s, (counts.get(s) || 0) + 1); }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= Math.max(2, pages.length * 0.3)) return best[0];
  // 区切り記号がない場合：多くのtitleに共通する先頭/末尾の語（例：「イバノ 理念」「イバノ 事業」→ イバノ）
  const words = pages.map((p) => (p.title || '').split(/\s+/).filter(Boolean)).filter((w) => w.length > 1);
  for (const pick of [(w) => w[0], (w) => w[w.length - 1]]) {
    const c = new Map();
    for (const w of words) c.set(pick(w), (c.get(pick(w)) || 0) + 1);
    const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && words.length >= 3 && top[1] >= words.length * 0.6) return top[0];
  }
  return homePage?.title?.split(/\s*[|｜\-–—:：]\s*/)[0] || new URL(home).hostname;
}

function firstSentences(text, maxWidth) {
  const sentences = (text || '').split(/(?<=[。．.!?！？])\s*/).map((s) => s.trim()).filter((s) => s.length > 15 && !/^(Copyright|©|メニュー|MENU|ホーム)/i.test(s));
  let out = '';
  for (const s of sentences) {
    if (displayWidth(out + s) > maxWidth) break;
    out += s;
  }
  return out || truncateWidth(sentences[0] || text || '', maxWidth);
}

export function suggestMeta(p, siteName, keywords) {
  const kws = (keywords.pageKeywords[p.url] || []).map((k) => k.term);
  const h1 = (p.headings || []).find((h) => h.level === 1 && !h.empty)?.text || '';
  const ja = isJapanese(p.text || p.title);
  const sep = ja ? '｜' : ' | ';
  let core = h1 && h1 !== siteName ? h1 : (p.title || '').split(/\s*[|｜]\s*/)[0];
  if (!core || core === siteName) core = kws.slice(0, 2).join(ja ? '・' : ' ') || siteName;
  if (kws[0] && !core.includes(kws[0]) && displayWidth(core) < 24) core = `${kws[0]}${ja ? '｜' : ' - '}${core}`;
  const isHome = p.pageType === 'トップ';
  let title = isHome ? `${siteName}${sep}${core === siteName ? kws.slice(0, 3).join(ja ? '・' : ', ') : core}` : `${core}${sep}${siteName}`;
  if (displayWidth(title) > 64) title = displayWidth(core) <= 60 ? core : truncateWidth(core, 60);
  let desc = firstSentences(p.text, 220);
  if (kws[0] && !desc.includes(kws[0])) desc = `${kws[0]}について。${desc}`;
  if (displayWidth(desc) > 240) desc = truncateWidth(desc, 236);
  const needTitle = !p.title || displayWidth(p.title) > 64 || displayWidth(p.title) < 20;
  const needDesc = !p.metaDescription || displayWidth(p.metaDescription) > 240 || displayWidth(p.metaDescription) < 70;
  return { title, description: desc, needTitle, needDesc, keywords: kws.slice(0, 5) };
}

/** 見出し構造を正規化した修正案（飛び・複数h1・空見出しを解消） */
export function fixHeadings(headings, topic) {
  const out = [];
  let h1Seen = false;
  let prev = 0;
  for (const h of headings) {
    let level = h.level;
    const notes = [];
    if (h.empty) { notes.push('空の見出し → 削除またはテキスト追加'); }
    if (level === 1) {
      if (h1Seen) { level = 2; notes.push('2つ目以降のh1 → h2'); }
      h1Seen = true;
    }
    if (prev && level > prev + 1) { notes.push(`h${prev}→h${level} の飛び → h${prev + 1}`); level = prev + 1; }
    if (!h1Seen && level > 1 && out.length === 0) notes.push('h1より前に下位見出しがある');
    out.push({ from: h.level, level, text: h.text, notes });
    prev = level;
  }
  if (!h1Seen) out.unshift({ from: null, level: 1, text: `【追加】${topic || 'ページの主題'}（ページの主題を表すh1）`, notes: ['h1を追加'] });
  return out;
}

function breadcrumbLd(p, pages, home) {
  const u = new URL(p.url);
  const segs = u.pathname.split('/').filter(Boolean);
  const items = [{ name: 'ホーム', url: home }];
  let acc = u.origin;
  for (let i = 0; i < segs.length; i++) {
    acc += '/' + segs[i] + (i < segs.length - 1 ? '/' : u.pathname.endsWith('/') ? '/' : '');
    const match = pages.find((q) => q.url === acc || q.url === acc + '/' || q.url === acc.replace(/\/$/, ''));
    const name = i === segs.length - 1 ? ((p.headings || []).find((h) => h.level === 1)?.text || p.title.split(/[|｜]/)[0]).trim() : (match?.title?.split(/[|｜]/)[0].trim() || decodeURIComponent(segs[i]));
    items.push({ name, url: match?.url || acc });
  }
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

export function buildJsonLd(p, ctx) {
  const { pages, home, siteName, origin } = ctx;
  const out = [];
  const existing = (p.jsonld || []).map((j) => j.type).join(',');
  if (p.pageType === 'トップ') {
    if (!/Organization|LocalBusiness|Corporation/.test(existing)) out.push({
      '@context': 'https://schema.org', '@type': 'Organization', name: siteName, url: home,
      logo: p.og?.image || `${origin}/logo.png`, description: p.metaDescription || '',
      address: { '@type': 'PostalAddress', postalCode: '【要入力】', addressRegion: '【要入力】', addressLocality: '【要入力】', streetAddress: '【要入力】', addressCountry: 'JP' },
      telephone: '【要入力】', sameAs: ['【公式SNS/Wikipedia等のURL】'],
    });
    if (!/WebSite/.test(existing)) out.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: siteName, url: home, inLanguage: p.lang || 'ja' });
  } else if (!/BreadcrumbList/.test(existing)) out.push(breadcrumbLd(p, pages, home));
  if (p.pageType === '記事' && !/Article|BlogPosting/.test(existing)) out.push({
    '@context': 'https://schema.org', '@type': 'Article', headline: ((p.headings || []).find((h) => h.level === 1)?.text || p.title).slice(0, 110),
    description: p.metaDescription || '', image: p.og?.image || '', datePublished: p.dateHints?.published || '【公開日 YYYY-MM-DD】', dateModified: p.dateHints?.modified || p.lastModified || '【更新日】',
    author: { '@type': 'Person', name: p.author || '【著者名】' }, publisher: { '@type': 'Organization', name: siteName }, mainEntityOfPage: p.url,
  });
  // 質問形の見出し → FAQPage
  const qa = (p.chunks || []).filter((c) => c.level >= 2 && /[?？]$|とは|ですか|ますか|方法|違い|なぜ|how|what|why/i.test(c.heading) && c.text.length > 30);
  if (qa.length >= 2 && !/FAQPage/.test(existing)) out.push({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: qa.slice(0, 10).map((c) => ({ '@type': 'Question', name: c.heading, acceptedAnswer: { '@type': 'Answer', text: c.text.replace(/\n/g, ' ').slice(0, 500) } })),
  });
  return out;
}

export function buildSitemap(pages) {
  const idx = pages.filter((p) => p.status === 200 && !p.isRedirect && !/noindex/.test(`${p.robotsMeta} ${p.xRobots}`) && (!p.canonical || p.canonical === p.url));
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const lastmod = (p) => { const d = new Date(p.dateHints?.modified || p.lastModified || ''); return isNaN(d) ? '' : `\n    <lastmod>${d.toISOString().slice(0, 10)}</lastmod>`; };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${idx.map((p) => `  <url>\n    <loc>${esc(p.url)}</loc>${lastmod(p)}\n  </url>`).join('\n')}\n</urlset>\n`;
}

export function buildRobots(crawl) {
  const lines = [];
  lines.push('# 生成：Site Analyzer — 既存設定と見比べてから適用してください');
  lines.push('User-agent: *');
  const existing = crawl.robots?.groups.find((g) => g.agents.includes('*'));
  const dis = existing?.rules.filter((r) => !r.allow && r.path && r.path !== '/') || [];
  if (dis.length) for (const r of dis) lines.push(`Disallow: ${r.path}`);
  else lines.push('Disallow:');
  lines.push('');
  lines.push('# AI検索での引用を許可（検索・ユーザー操作系）');
  for (const b of AI_BOTS.filter((b) => /SearchBot|User|Perplexity/.test(b.ua))) lines.push(`User-agent: ${b.ua}`);
  lines.push('Allow: /');
  lines.push('');
  lines.push('# AIの学習利用を拒否したい場合は以下のコメントを外す（検索での引用には影響しません）');
  for (const b of AI_BOTS.filter((b) => /GPTBot|ClaudeBot|Google-Extended|Applebot-Extended|CCBot/.test(b.ua))) lines.push(`# User-agent: ${b.ua}`);
  lines.push('# Disallow: /');
  lines.push('');
  lines.push(`Sitemap: ${crawl.origin}/sitemap.xml`);
  return lines.join('\n') + '\n';
}

export function buildLlmsTxt(pages, ctx) {
  const { siteName, home } = ctx;
  const homePage = pages.find((p) => p.url === home) || pages[0];
  const summary = homePage?.metaDescription || firstSentences(homePage?.text, 240);
  const groups = new Map();
  for (const p of pages.filter((p) => p.status === 200 && !p.isRedirect && !/noindex/.test(p.robotsMeta || ''))) {
    const g = p.pageType || 'その他';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  const order = ['トップ', '会社情報', 'サービス・一般', '商品', '一覧・カテゴリ', '記事', 'FAQ', '採用', 'お問い合わせ', '規約・その他'];
  let out = `# ${siteName}\n\n> ${summary.replace(/\n/g, ' ')}\n\n`;
  out += `このファイルは、AIアシスタントが ${siteName} の内容を正確に理解・引用するためのガイドです。\n\n`;
  for (const g of order.filter((g) => groups.has(g))) {
    out += `## ${g === '規約・その他' ? 'Optional' : g}\n\n`;
    for (const p of groups.get(g).sort((a, b) => (b.internalRank || 0) - (a.internalRank || 0)).slice(0, 40)) {
      const name = ((p.headings || []).find((h) => h.level === 1)?.text || p.title || p.url).split(/[|｜]/)[0].trim();
      const d = (p.metaDescription || firstSentences(p.text, 120)).replace(/\n/g, ' ');
      out += `- [${name}](${p.url}): ${d}\n`;
    }
    out += '\n';
  }
  return out;
}

/** すべての生成物をディレクトリに書き出す */
export function writeOutputs(outDir, result) {
  const files = path.join(outDir, 'files');
  fs.mkdirSync(path.join(files, 'jsonld'), { recursive: true });
  const written = [];
  const write = (name, content, desc) => { fs.writeFileSync(path.join(files, name), content); written.push({ name, desc, bytes: Buffer.byteLength(content) }); };
  const { crawl, gen, audit, aio } = result;
  const htmlPages = crawl.pages.filter((p) => p.title !== undefined && !p.isRedirect);

  write('sitemap.xml', gen.sitemap, 'インデックス対象ページのみを収録したXMLサイトマップ。サイトルートに配置');
  write('robots.txt', gen.robots, 'AI検索ボット許可・サイトマップ指定入りのrobots.txt案');
  write('llms.txt', gen.llmsTxt, 'AI向けサイト案内（/llms.txt に配置）');

  write('pages.csv', '﻿' + [csvRow(['URL', 'ステータス', '種別', 'title', 'title幅', 'meta description', 'h1', 'h2数', '本文文字数', 'クリック深度', '被内部リンク', '内部ランク', '応答ms', 'canonical', 'noindex', 'sitemap掲載', 'AI対策スコア', '主要キーワード'])]
    .concat(crawl.pages.map((p) => csvRow([p.url, p.status, p.pageType || (p.isRedirect ? 'リダイレクト' : ''), p.title, displayWidth(p.title || ''), p.metaDescription, (p.headings || []).find((h) => h.level === 1)?.text, (p.headings || []).filter((h) => h.level === 2).length, p.textLength, p.depth, p.inlinks, p.internalRank, p.ms, p.canonical, /noindex/.test(`${p.robotsMeta} ${p.xRobots}`) ? 'yes' : '', p.inSitemap ? 'yes' : '', aio.pages.find((a) => a.url === p.url)?.score ?? '', (gen.meta[p.url]?.keywords || []).join(' / ')]))).join('\n'), 'ページリスト（Excel対応CSV）');

  write('issues.csv', '﻿' + [csvRow(['重要度', 'カテゴリ', '課題', '件数', '改善方法', 'URL'])]
    .concat(audit.issues.flatMap((i) => i.urls.map((u) => csvRow([i.severity, i.category, i.title, i.count, i.how, u])))).join('\n'), '課題×URLの一覧（Excel対応CSV）');

  write('meta-suggestions.csv', '﻿' + [csvRow(['URL', '現在のtitle', 'title案', '現在のdescription', 'description案', '要修正'])]
    .concat(htmlPages.map((p) => { const m = gen.meta[p.url]; return csvRow([p.url, p.title, m.title, p.metaDescription, m.description, [m.needTitle && 'title', m.needDesc && 'description'].filter(Boolean).join('/')]); })).join('\n'), 'title / meta description 改善案');

  let headingsMd = '# 見出し構造の修正案\n\n';
  for (const p of htmlPages) {
    const fixed = gen.headings[p.url];
    if (!fixed.some((h) => h.notes.length)) continue;
    headingsMd += `## ${p.url}\n\n| 現在 | 修正後 | 見出し | 修正内容 |\n|---|---|---|---|\n`;
    for (const h of fixed) headingsMd += `| ${h.from ? 'h' + h.from : '-'} | h${h.level} | ${'　'.repeat(h.level - 1)}${h.text.replace(/\|/g, '｜')} | ${h.notes.join('、')} |\n`;
    headingsMd += '\n';
  }
  write('headings-fix.md', headingsMd, '見出しの飛び・複数h1などの修正案');

  let chunkMd = '# AI検索対策：チャンク改善指示書\n\nAI検索（ChatGPT / Perplexity / Google AI Overviews 等）は、ページを見出し・段落単位の「チャンク」に分割して引用します。\n各チャンクが「見出しだけで内容が分かる」「1トピックで自己完結」「300〜800字」「結論ファースト」になるよう修正してください。\n\n';
  for (const ap of aio.pages.filter((a) => a.chunks.some((c) => c.issues.length)).sort((a, b) => a.score - b.score)) {
    chunkMd += `## ${ap.title || ap.url}\n${ap.url}（AI対策スコア ${ap.score} / 主題：${ap.topic || '不明'}）\n\n`;
    for (const c of ap.chunks.filter((c) => c.issues.length)) {
      chunkMd += `### ${c.level ? 'h' + c.level : '-'}「${c.heading}」 ${c.chars}字 / スコア${c.score}\n`;
      for (const i of c.issues) chunkMd += `- 問題：${i}\n`;
      for (const s of c.suggestions) chunkMd += `- 改善：${s}\n`;
      chunkMd += '\n';
    }
  }
  write('chunk-rewrite.md', chunkMd, 'チャンク（見出し単位）ごとの問題と書き換え指示');

  for (const p of htmlPages) {
    const ld = gen.jsonld[p.url];
    if (!ld.length) continue;
    const name = `jsonld/${slugify(p.url)}.html`;
    fs.writeFileSync(path.join(files, name), ld.map((d) => `<script type="application/ld+json">\n${JSON.stringify(d, null, 2)}\n</script>`).join('\n'));
  }
  written.push({ name: 'jsonld/', desc: `ページ別の構造化データ（${htmlPages.filter((p) => gen.jsonld[p.url].length).length}ページ分）。<head>内に貼り付け。【要入力】は実データに置換` });

  write('improvement-plan.md', buildPlan(result), '優先順位付きの改善計画書');
  return written;
}

function buildPlan({ crawl, audit, aio, structure, heatmap, scores }) {
  let md = `# サイト改善計画書：${crawl.home}\n\n解析日時：${new Date(crawl.crawledAt).toLocaleString('ja-JP')}\n\n`;
  md += `## スコア\n\n| 指標 | スコア |\n|---|---|\n| 総合 | ${scores.overall} |\n| SEO監査 | ${scores.seo} |\n| AI検索対策 | ${scores.aio} |\n| サイト構造 | ${scores.structure} |\n| UX（予測ヒートマップ） | ${scores.ux ?? '-'} |\n\n`;
  md += `## 優先度：高（今すぐ対応）\n\n`;
  for (const i of audit.issues.filter((i) => i.severity === 'error')) md += `- **${i.title}**（${i.count}件）\n  - なぜ：${i.why}\n  - 方法：${i.how}\n`;
  for (const c of aio.siteChecks.filter((c) => !c.ok).slice(0, 3)) md += `- **AI対策：${c.label}** が未対応\n  - 方法：${c.how}\n`;
  md += `\n## 優先度：中（1か月以内）\n\n`;
  for (const i of audit.issues.filter((i) => i.severity === 'warning')) md += `- **${i.title}**（${i.count}件）\n  - 方法：${i.how}\n`;
  for (const p of structure.proposals) md += `- **構造：${p.title}**\n  - 方法：${p.detail}\n`;
  for (const h of (heatmap?.results || []).filter((r) => !r.error)) for (const i of h.insights.filter((i) => i.level === 'warning')) md += `- **UX（${h.device}）${h.url}**：${i.text}\n  - 方法：${i.how}\n`;
  md += `\n## 優先度：低（継続改善）\n\n`;
  for (const i of audit.issues.filter((i) => i.severity === 'notice')) md += `- ${i.title}（${i.count}件）：${i.how}\n`;
  for (const c of aio.siteChecks.filter((c) => !c.ok).slice(3)) md += `- AI対策：${c.label}：${c.how}\n`;
  md += `\n## 生成済みの改善ファイル\n\nfiles/ フォルダ内の sitemap.xml / robots.txt / llms.txt / jsonld/ / meta-suggestions.csv / headings-fix.md / chunk-rewrite.md をそのまま実装に使えます。\n`;
  return md;
}
