// 解析パイプライン：クロール → キーワード → 構造 → 監査 → AI対策 → ヒートマップ → 生成 → レポート
import fs from 'node:fs';
import path from 'node:path';
import { crawl } from './crawler.js';
import { analyzeKeywords, findDuplicates } from './keywords.js';
import { buildStructure } from './structure.js';
import { runAudit } from './audit.js';
import { analyzeAIO } from './aio.js';
import { runHeatmaps } from './heatmap.js';
import { inferSiteName, suggestMeta, fixHeadings, buildJsonLd, buildSitemap, buildRobots, buildLlmsTxt, writeOutputs } from './generate.js';
import { renderReport } from './report.js';
import { runAI } from './ai.js';

export async function analyzeSite(url, opts = {}) {
  const {
    maxPages = 200, concurrency = 4, heatmapPages = 3, respectRobots = true, checkExternal = true,
    ai = 'auto', aiPages = 5, outDir, onProgress = () => {},
  } = opts;
  const t0 = Date.now();
  onProgress({ phase: 'start', message: `${url} の解析を開始` });

  const crawlResult = await crawl(url, { maxPages, concurrency, respectRobots, checkExternal, onProgress });
  const htmlPages = crawlResult.pages.filter((p) => p.title !== undefined && !p.isRedirect);
  if (!htmlPages.length) throw new Error('HTMLページを取得できませんでした（URL・アクセス制限を確認してください）');

  onProgress({ phase: 'analyze', message: 'キーワード・構造・課題を解析中' });
  const keywords = analyzeKeywords(htmlPages);
  const duplicates = findDuplicates(htmlPages);
  const structure = buildStructure(crawlResult);
  const audit = runAudit(crawlResult, structure, keywords, duplicates);
  const aio = analyzeAIO(crawlResult, keywords);

  const dir = outDir || path.resolve('reports', `${crawlResult.rootHost}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
  fs.mkdirSync(dir, { recursive: true });

  let heatmap = { available: false, reason: 'スキップ', results: [] };
  if (heatmapPages > 0) {
    const targets = [crawlResult.home, ...htmlPages.filter((p) => p.url !== crawlResult.home && p.status === 200).sort((a, b) => b.internalRank - a.internalRank).map((p) => p.url)].slice(0, heatmapPages);
    heatmap = await runHeatmaps(targets, path.join(dir, 'shots'), { onProgress });
  }

  // 生成物
  const siteName = inferSiteName(htmlPages, crawlResult.home);
  const ctx = { pages: htmlPages, home: crawlResult.home, siteName, origin: crawlResult.origin };
  const gen = { siteName, meta: {}, headings: {}, jsonld: {} };
  for (const p of htmlPages) {
    gen.meta[p.url] = suggestMeta(p, siteName, keywords);
    gen.headings[p.url] = fixHeadings(p.headings || [], gen.meta[p.url].keywords[0]);
    gen.jsonld[p.url] = buildJsonLd(p, ctx);
  }
  gen.sitemap = buildSitemap(htmlPages);
  gen.robots = buildRobots(crawlResult);
  gen.llmsTxt = buildLlmsTxt(htmlPages, ctx);

  // スコア
  const structureScore = scoreStructure(htmlPages, structure);
  const uxScores = heatmap.results.filter((r) => !r.error).map((r) => Math.max(0, 100 - r.insights.filter((i) => i.level === 'warning').length * 15 - r.insights.filter((i) => i.level === 'notice').length * 5));
  const ux = uxScores.length ? Math.round(uxScores.reduce((a, b) => a + b, 0) / uxScores.length) : null;
  const scores = { seo: audit.score, aio: aio.score, structure: structureScore, ux, health: audit.health };
  scores.overall = Math.round(ux == null ? scores.seo * 0.45 + scores.aio * 0.3 + scores.structure * 0.25 : scores.seo * 0.4 + scores.aio * 0.25 + scores.structure * 0.2 + ux * 0.15);

  const result = { version: 1, url, crawl: crawlResult, keywords, duplicates, structure, audit, aio, heatmap, gen, scores, elapsedMs: 0 };
  result.files = writeOutputs(dir, result);

  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
  if (ai === true || (ai === 'auto' && hasKey)) {
    try {
      result.ai = await runAI(result, dir, { pages: aiPages, onProgress });
      if (result.ai.pages?.length || result.ai.strategy) result.files.push({ name: 'ai/', desc: `Claude（${result.ai.model}）による改善戦略書・ページ別改善原稿` });
    } catch (e) {
      result.ai = { available: false, reason: e.message };
    }
  } else {
    result.ai = { available: false, reason: 'ANTHROPIC_API_KEY を設定すると、Claude による改善原稿（title案・見出し・チャンク書き換え・FAQ・戦略書）も自動作成されます。' };
  }

  result.elapsedMs = Date.now() - t0;
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(result));
  fs.writeFileSync(path.join(dir, 'report.html'), renderReport(result));
  onProgress({ phase: 'done', message: '完了', dir });
  return { dir, result };
}

function scoreStructure(pages, structure) {
  const n = pages.length || 1;
  const orphan = pages.filter((p) => p.depth == null).length / n;
  const deep = pages.filter((p) => p.depth >= 4).length / n;
  const weak = pages.filter((p) => p.inlinks <= 1 && p.depth > 0).length / n;
  const hubs = structure.proposals.find((p) => p.title.includes('ハブページ'))?.items.length || 0;
  return Math.max(0, Math.round(100 - orphan * 40 - deep * 30 - weak * 20 - Math.min(15, hubs * 3)));
}
