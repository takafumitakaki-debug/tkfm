import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFixture } from './fixture-site.js';
import { analyzeSite } from '../src/analyze.js';
import { parseRobots, isAllowed } from '../src/crawler.js';
import { evaluateChunk } from '../src/aio.js';
import { tokenize } from '../src/keywords.js';

test('robots.txt の解釈', () => {
  const r = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/ok\n\nUser-agent: GPTBot\nDisallow: /');
  assert.equal(isAllowed(r, 'SiteAnalyzerBot', 'https://a.com/private/x'), false);
  assert.equal(isAllowed(r, 'SiteAnalyzerBot', 'https://a.com/private/ok'), true);
  assert.equal(isAllowed(r, 'GPTBot', 'https://a.com/'), false);
  assert.equal(isAllowed(r, 'ClaudeBot', 'https://a.com/'), true);
});

test('チャンク評価：指示語始まり・抽象見出し・短文を検出', () => {
  const e = evaluateChunk({ heading: '概要', level: 2, text: 'これは毎朝の配送サービスです。', chars: 15, lists: 0, tables: 0, paragraphs: 1 });
  assert.ok(e.issues.some((i) => i.includes('指示語')));
  assert.ok(e.issues.some((i) => i.includes('抽象的')));
  assert.ok(e.issues.some((i) => i.includes('短すぎる')));
});

test('日本語の分かち書き', () => {
  const t = tokenize('沖縄の業務用食材を毎朝配送しています');
  assert.ok(t.some((w) => w.includes('沖縄')));
  assert.ok(!t.includes('の'));
});

test('フィクスチャサイトの総合解析', async () => {
  const server = await startFixture();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-'));
  try {
    const { result } = await analyzeSite(base, { outDir: out, heatmapPages: 0, ai: false, checkExternal: false });
    const ids = new Set(result.audit.issues.map((i) => i.id));
    for (const id of ['4xx', 'redirect-chain', 'redirect-302', 'title-duplicate', 'h1-multiple', 'h-skip', 'img-alt', 'orphan', 'robots-blocked', 'noindex', 'thin', 'anchor-generic', 'desc-missing', 'broken-internal-link']) {
      assert.ok(ids.has(id), `課題 ${id} が検出されること`);
    }
    const orphan = result.crawl.pages.find((p) => p.url.endsWith('/orphan'));
    assert.equal(orphan.depth, null);
    const post4 = result.crawl.pages.find((p) => p.url.endsWith('post-4'));
    assert.equal(post4.depth, 5);
    assert.ok(result.crawl.blockedByRobots.some((u) => u.includes('/secret/')) || !result.crawl.pages.some((p) => p.url.includes('/secret/')));
    assert.equal(result.aio.bots.find((b) => b.ua === 'GPTBot').allowed, false);
    assert.equal(result.gen.siteName, 'テスト食品');
    // 生成ファイル
    for (const f of ['report.html', 'data.json', 'files/sitemap.xml', 'files/robots.txt', 'files/llms.txt', 'files/pages.csv', 'files/issues.csv', 'files/improvement-plan.md', 'files/chunk-rewrite.md', 'files/headings-fix.md', 'files/meta-suggestions.csv']) {
      assert.ok(fs.existsSync(path.join(out, f)), `${f} が生成されること`);
    }
    const sitemap = fs.readFileSync(path.join(out, 'files/sitemap.xml'), 'utf8');
    assert.ok(!sitemap.includes('/privacy'), 'noindexページはsitemapに含めない');
    const fixed = result.gen.headings[result.crawl.pages.find((p) => p.url.endsWith('/services/pb')).url];
    assert.equal(fixed.filter((h) => h.level === 1).length, 1, '複数h1は1つに修正される');
    const home = result.aio.pages.find((p) => p.url === base);
    assert.ok(home.checks.hasQA);
    assert.ok(result.gen.jsonld[base].length === 1 && result.gen.jsonld[base][0]['@type'] === 'WebSite' || result.gen.jsonld[base].some((d) => d['@type'] === 'FAQPage'));
  } finally {
    server.close();
    fs.rmSync(out, { recursive: true, force: true });
  }
});
