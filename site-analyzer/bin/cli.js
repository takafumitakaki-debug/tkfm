#!/usr/bin/env node
// 使い方: node bin/cli.js https://example.com [--max-pages 200] [--heatmap 3] [--no-ai] [--ai-pages 5] [--out ./reports/xxx]
import { parseArgs } from 'node:util';
import path from 'node:path';
import { analyzeSite } from '../src/analyze.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'max-pages': { type: 'string', default: '200' },
    concurrency: { type: 'string', default: '4' },
    heatmap: { type: 'string', default: '3' },
    'ai-pages': { type: 'string', default: '5' },
    'no-ai': { type: 'boolean', default: false },
    'ignore-robots': { type: 'boolean', default: false },
    'no-external': { type: 'boolean', default: false },
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !positionals[0]) {
  console.log(`Site Analyzer — URL1つでサイトを解析し、改善案と改善ファイルを生成します

使い方:
  node bin/cli.js <URL> [オプション]

オプション:
  --max-pages <n>     クロールする最大ページ数（既定 200）
  --concurrency <n>   同時接続数（既定 4）
  --heatmap <n>       予測ヒートマップを作るページ数（既定 3、0で無効）
  --ai-pages <n>      Claudeで改善原稿を作るページ数（既定 5。ANTHROPIC_API_KEY 設定時のみ）
  --no-ai             Claude による改善原稿の作成をしない
  --ignore-robots     robots.txt を無視してクロール（自社サイトの検証用）
  --no-external       外部リンクのリンク切れチェックをしない
  --out <dir>         出力先ディレクトリ（既定 ./reports/<ホスト名-日時>）`);
  process.exit(values.help ? 0 : 1);
}

let url = positionals[0];
if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
let last = '';
const t0 = Date.now();
try {
  const { dir, result } = await analyzeSite(url, {
    maxPages: Number(values['max-pages']), concurrency: Number(values.concurrency), heatmapPages: Number(values.heatmap),
    ai: values['no-ai'] ? false : 'auto', aiPages: Number(values['ai-pages']), respectRobots: !values['ignore-robots'], checkExternal: !values['no-external'],
    outDir: values.out && path.resolve(values.out),
    onProgress: (p) => { if (p.message !== last) { process.stdout.write(`\r\x1b[K[${((Date.now() - t0) / 1000).toFixed(0)}s] ${p.message}`); last = p.message; } },
  });
  const s = result.scores;
  console.log(`\n\n完了: ${result.crawl.pages.length} URL を解析しました`);
  console.log(`  総合 ${s.overall} / SEO ${s.seo} / AI対策 ${s.aio} / 構造 ${s.structure} / UX ${s.ux ?? '-'}`);
  console.log(`  課題: エラー ${result.audit.summary.error} 種 / 警告 ${result.audit.summary.warning} 種 / 注意 ${result.audit.summary.notice} 種`);
  console.log(`\nレポート: ${path.join(dir, 'report.html')}`);
  console.log(`改善ファイル: ${path.join(dir, 'files')}`);
} catch (e) {
  console.error('\nエラー:', e.message);
  process.exit(1);
}
