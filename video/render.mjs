// コードで描いたシーンを動画にする(追加費用なし)。
//   node render.mjs cut1            … 横長・縦長の両方を書き出す
//   node render.mjs cut1 --aspect h … 横長だけ
//   node render.mjs cut1 --still 4  … 4秒目の1コマだけ PNG で書き出す(確認用)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    aspect: { type: 'string' },
    fps: { type: 'string', default: '30' },
    still: { type: 'string' },
  },
});
const name = positionals[0];
if (!name) {
  console.error('シーン名を指定してください(例: node render.mjs cut1)');
  process.exit(1);
}

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SIZES = { h: [1920, 1080], v: [1080, 1920] };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml' };

// ES モジュールは file:// で読めないので、ローカルでだけ配信する
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
fs.mkdirSync(path.join(ROOT, 'output'), { recursive: true });

for (const aspect of values.aspect ? [values.aspect] : ['h', 'v']) {
  const [width, height] = SIZES[aspect];
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${base}/scenes/${name}.html?aspect=${aspect}`);
  await page.waitForFunction(() => window.renderAt && window.SCENE);

  if (values.still) {
    await page.evaluate((t) => window.renderAt(t), Number(values.still));
    const out = path.join(ROOT, 'output', `${name}-${aspect}-${values.still}s.png`);
    await page.screenshot({ path: out });
    console.log(`保存: ${path.relative(ROOT, out)}`);
    await page.close();
    continue;
  }

  const fps = Number(values.fps);
  const duration = await page.evaluate(() => window.SCENE.duration);
  const frames = Math.round(duration * fps);
  const out = path.join(ROOT, 'output', `${name}-${aspect === 'h' ? '16x9' : '9x16'}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });

  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.renderAt(t), i / fps);
    const png = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % fps === 0) process.stdout.write(`  ${name} ${aspect}: ${i / fps}s / ${duration}s\n`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (code) => (code === 0 ? r() : j(new Error(`ffmpeg 終了コード ${code}`)))));
  console.log(`保存: ${path.relative(ROOT, out)}`);
  await page.close();
}

await browser.close();
server.close();
