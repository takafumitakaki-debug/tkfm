#!/usr/bin/env node
// 公開前チェック：仮置き原稿【…】と「要確認」（confirmed: false）の残数を一覧にする。
//   npm run check:placeholders            … 一覧を表示
//   npm run check:placeholders -- --strict … 1件でも残っていれば終了コード1（公開前のCIゲート用）
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('../src/content/', import.meta.url).pathname;
const strict = process.argv.includes('--strict');

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(md|ya?ml)$/.test(e.name)) yield p;
  }
}

const rows = [];
for await (const file of walk(root)) {
  const text = await readFile(file, 'utf8');
  if (/^draft:\s*true/m.test(text)) continue; // 下書きは公開されないので対象外
  const ph = text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n').match(/【[^】]*】/g) ?? [];
  const check = text.match(/confirmed:\s*false/g) ?? [];
  if (ph.length || check.length) rows.push({ file: relative(root, file), ph: ph.length, check: check.length, sample: [...new Set(ph)].slice(0, 3) });
}

rows.sort((a, b) => b.ph + b.check - (a.ph + a.check));
const total = rows.reduce((s, r) => ({ ph: s.ph + r.ph, check: s.check + r.check }), { ph: 0, check: 0 });

console.log('\n仮置き原稿【…】／要確認（confirmed: false）の残り\n');
console.log('  仮置き  要確認  ファイル');
for (const r of rows) {
  console.log(`  ${String(r.ph).padStart(6)}  ${String(r.check).padStart(6)}  ${r.file}`);
  for (const s of r.sample) console.log(`                    └ ${s}`);
}
console.log(`\n  合計：仮置き ${total.ph} 件／要確認 ${total.check} 件\n`);

if (strict && (total.ph || total.check)) {
  console.error('公開前チェック NG：仮置き・要確認が残っています。');
  process.exit(1);
}
