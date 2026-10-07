// Site Analyzer Web UI サーバー
// - URLを入力して解析を実行・進捗表示・レポート閲覧
// - /t.js と /collect：GA4不要の自前ヒートマップ計測（クリック・スクロール）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { analyzeSite } from './src/analyze.js';
import { normalizeUrl } from './src/util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const REPORTS = path.resolve(process.env.REPORTS_DIR || path.join(here, 'reports'));
const DATA = path.resolve(process.env.DATA_DIR || path.join(here, 'data'));
fs.mkdirSync(REPORTS, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });
const EVENTS = path.join(DATA, 'events.jsonl');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
const jobs = new Map();

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'content-type': type, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'not found' });
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
}

async function readBody(req, limit = 1e6) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function listReports() {
  return fs.readdirSync(REPORTS, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(REPORTS, d.name, 'report.html')))
    .map((d) => {
      const stat = fs.statSync(path.join(REPORTS, d.name, 'report.html'));
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(path.join(REPORTS, d.name, 'meta.json'), 'utf8')); } catch { /* 古いレポート */ }
      return { id: d.name, url: meta.url || d.name, scores: meta.scores || null, pages: meta.pages || null, date: stat.mtime };
    }).sort((a, b) => b.date - a.date);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    // ---------- 計測（CORS許可） ----------
    if (u.pathname === '/collect') {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
      if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain', cors);
      if (req.method !== 'POST') return send(res, 405, '', 'text/plain', cors);
      const body = JSON.parse(await readBody(req, 64e3));
      const url = normalizeUrl(body.u);
      if (!url) return send(res, 400, '', 'text/plain', cors);
      const events = (Array.isArray(body.e) ? body.e : []).slice(0, 200).map((e) => ({
        t: e.t === 's' ? 's' : 'c', xr: Math.max(0, Math.min(1, +e.xr || 0)), y: Math.max(0, Math.round(+e.y || 0)),
        vw: Math.round(+body.vw || 0), maxY: Math.round(+e.maxY || 0), sel: String(e.sel || '').slice(0, 120),
      }));
      fs.appendFileSync(EVENTS, events.map((e) => JSON.stringify({ url, ts: Date.now(), sid: String(body.s || '').slice(0, 16), ...e })).join('\n') + (events.length ? '\n' : ''));
      return send(res, 204, '', 'text/plain', cors);
    }
    if (u.pathname === '/t.js') {
      const js = fs.readFileSync(path.join(here, 'public', 'tracker.js'), 'utf8').replace('__ENDPOINT__', `${u.protocol}//${u.host}/collect`);
      return send(res, 200, js, MIME['.js'], { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=3600' });
    }
    if (u.pathname === '/api/events') {
      const target = normalizeUrl(u.searchParams.get('url') || '');
      const out = { clicks: [], scrolls: [] };
      if (target && fs.existsSync(EVENTS)) {
        const maxBySession = new Map();
        for (const line of fs.readFileSync(EVENTS, 'utf8').split('\n')) {
          if (!line) continue;
          let e;
          try { e = JSON.parse(line); } catch { continue; }
          if (e.url !== target) continue;
          if (e.t === 'c') out.clicks.push({ xr: e.xr, y: e.y, vw: e.vw, sel: e.sel });
          else maxBySession.set(e.sid, Math.max(maxBySession.get(e.sid) || 0, e.maxY));
        }
        out.scrolls = [...maxBySession.values()].map((maxY) => ({ maxY }));
      }
      return send(res, 200, out);
    }

    // ---------- 解析ジョブ ----------
    if (u.pathname === '/api/analyze' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      let url = String(body.url || '').trim();
      if (!url) return send(res, 400, { error: 'URLを入力してください' });
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      if (!normalizeUrl(url)) return send(res, 400, { error: 'URLが不正です' });
      const id = `${new URL(url).hostname}-${Date.now().toString(36)}`;
      const job = { id, url, status: 'running', progress: [], startedAt: Date.now() };
      jobs.set(id, job);
      const outDir = path.join(REPORTS, id);
      analyzeSite(url, {
        maxPages: Math.min(2000, Number(body.maxPages) || 200), heatmapPages: Math.min(10, Number(body.heatmap ?? 3)),
        ai: body.ai === false ? false : 'auto', aiPages: Math.min(20, Number(body.aiPages) || 5), respectRobots: body.respectRobots !== false, outDir,
        onProgress: (p) => { job.progress.push({ ...p, at: Date.now() }); if (job.progress.length > 200) job.progress.splice(0, 100); job.message = p.message; },
      }).then(({ result }) => {
        job.status = 'done';
        fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ url, scores: result.scores, pages: result.crawl.pages.length }));
      }).catch((e) => {
        job.status = 'error';
        job.error = e.message;
      });
      return send(res, 200, { id });
    }
    const jm = u.pathname.match(/^\/api\/jobs\/([\w.-]+)$/);
    if (jm) {
      const job = jobs.get(jm[1]);
      if (!job) return send(res, 404, { error: 'job not found' });
      return send(res, 200, { id: job.id, url: job.url, status: job.status, message: job.message, error: job.error, elapsed: Date.now() - job.startedAt, report: job.status === 'done' ? `/reports/${job.id}/report.html` : null });
    }
    if (u.pathname === '/api/reports') return send(res, 200, listReports());

    // ---------- 静的ファイル ----------
    if (u.pathname.startsWith('/reports/')) {
      const rel = decodeURIComponent(u.pathname.slice('/reports/'.length));
      const file = path.resolve(REPORTS, rel);
      if (!file.startsWith(REPORTS + path.sep)) return send(res, 403, { error: 'forbidden' });
      return serveFile(res, file);
    }
    if (u.pathname === '/' || u.pathname === '/index.html') return serveFile(res, path.join(here, 'public', 'index.html'));
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`Site Analyzer: http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log('（ANTHROPIC_API_KEY を設定すると Claude による改善原稿も生成されます）');
});
