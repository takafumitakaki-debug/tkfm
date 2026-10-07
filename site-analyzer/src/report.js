// 自己完結型HTMLレポートの生成（CSS/JS/データをインライン化。screenshots/ と files/ は相対参照）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from './util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const asset = (f) => fs.readFileSync(path.join(here, '..', 'public', f), 'utf8');

/** レポート表示に必要な分だけにデータを絞る */
function slim(result) {
  const pages = result.crawl.pages.map((p) => ({
    ...p,
    text: (p.text || '').slice(0, 400),
    links: (p.links || []).slice(0, 200),
    images: (p.images || []).slice(0, 60).map((i) => ({ src: i.src, alt: i.alt, hasAlt: i.hasAlt })),
    chunks: undefined,
    jsonld: (p.jsonld || []).map((j) => ({ type: j.type })),
  }));
  return {
    url: result.url, elapsedMs: result.elapsedMs, scores: result.scores,
    crawl: { ...result.crawl, pages, robots: undefined },
    keywords: { site: result.keywords.site, cannibal: result.keywords.cannibal, pageKeywords: Object.fromEntries(Object.entries(result.keywords.pageKeywords).map(([k, v]) => [k, v.slice(0, 10)])) },
    duplicates: result.duplicates, structure: result.structure, audit: result.audit, aio: result.aio,
    heatmap: result.heatmap, files: result.files,
    gen: { siteName: result.gen.siteName, meta: result.gen.meta, headings: result.gen.headings, jsonld: result.gen.jsonld, llmsTxt: result.gen.llmsTxt, robots: result.gen.robots },
    ai: result.ai ? { available: result.ai.available, reason: result.ai.reason, model: result.ai.model, strategy: result.ai.strategy, pages: result.ai.pages, errors: result.ai.errors } : null,
  };
}

export function renderReport(result) {
  const data = JSON.stringify(slim(result)).replace(/</g, '\\u003c');
  const host = result.crawl.rootHost;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>サイト解析 ${escapeHtml(host)}</title>
<style>${asset('report.css')}</style>
</head>
<body>
<header class="top">
  <div class="brand"><span class="logo">SA</span><div><div class="host">${escapeHtml(host)}</div><div class="sub" id="sub"></div></div></div>
  <button class="theme" id="themeBtn" title="ライト/ダーク切替">◐</button>
</header>
<nav class="tabs" id="tabs"></nav>
<main id="app"></main>
<div class="drawer" id="drawer" hidden><div class="drawer-inner"><button class="close" id="drawerClose">×</button><div id="drawerBody"></div></div></div>
<script id="data" type="application/json">${data}</script>
<script>${asset('report-app.js').replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
}
