// 比較ナビ：欲しいものを入力 → 複数ショップを同じ項目で収集 → 同一商品をまとめて比較・おすすめ
const http = require('http');
const fs = require('fs');
const path = require('path');
const { activeSources } = require('./lib/crawl');
const { runSearch } = require('./lib/search');
const store = require('./lib/store');
const ai = require('./lib/ai');

const PORT = Number(process.env.PORT) || 3000;
const WATCH_INTERVAL_MIN = Number(process.env.WATCH_INTERVAL_MIN) || 60;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 10000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function validQuery(q) {
  q = String(q || '').trim();
  if (!q) return { error: '検索キーワードを入力してください' };
  if (q.length > 100) return { error: 'キーワードが長すぎます' };
  return { q };
}

async function handleSearch(url, res) {
  const { q, error } = validQuery(url.searchParams.get('q'));
  if (error) return sendJson(res, 400, { error });
  sendJson(
    res,
    200,
    await runSearch({
      q,
      priority: url.searchParams.get('priority') || 'balance',
      budget: Number(url.searchParams.get('budget')) || null,
      refresh: url.searchParams.get('refresh') === '1',
    })
  );
}

async function handleWatch(req, url, res) {
  if (req.method === 'GET') return sendJson(res, 200, { intervalMin: WATCH_INTERVAL_MIN, watches: store.listWatches() });
  if (req.method === 'POST') {
    const body = await readBody(req);
    const { q, error } = validQuery(body.q);
    if (error) return sendJson(res, 400, { error });
    const watch = store.addWatch({ q, priority: body.priority, budget: Number(body.budget) || null });
    refreshWatch(watch).catch((e) => console.error('[watch]', e.message));
    return sendJson(res, 201, watch);
  }
  if (req.method === 'DELETE') {
    const ok = store.removeWatch(url.searchParams.get('id'));
    return sendJson(res, ok ? 200 : 404, { ok });
  }
  return sendJson(res, 405, { error: 'method not allowed' });
}

// ウォッチ中の検索を最新に取り直す
async function refreshWatch(w) {
  const result = await runSearch({ q: w.q, priority: w.priority, budget: w.budget, refresh: true });
  return store.updateWatch(w.id, result.items[0]);
}

async function refreshAllWatches() {
  for (const w of store.listWatches()) {
    try {
      await refreshWatch(w);
    } catch (e) {
      console.error(`[watch] ${w.q}: ${e.message}`);
    }
  }
}

function serveStatic(url, res) {
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/search') return await handleSearch(url, res);
    if (url.pathname === '/api/watch') return await handleWatch(req, url, res);
    if (url.pathname === '/api/watch/refresh' && req.method === 'POST') {
      await refreshAllWatches();
      return sendJson(res, 200, { watches: store.listWatches() });
    }
    if (url.pathname === '/api/sources') {
      return sendJson(res, 200, {
        sources: activeSources().map((s) => ({ id: s.id, label: s.label, demo: !!s.isDemo })),
        aiQuery: ai.enabled(),
      });
    }
    return serveStatic(url, res);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: '検索中にエラーが発生しました' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    const names = activeSources().map((s) => s.label).join(' / ');
    console.log(`比較ナビ http://localhost:${PORT}  （収集先: ${names}／AI推測: ${ai.enabled() ? 'ON' : 'OFF'}）`);
    console.log(`ウォッチ中の検索を ${WATCH_INTERVAL_MIN} 分ごとに自動更新します`);
  });
  setInterval(refreshAllWatches, WATCH_INTERVAL_MIN * 60 * 1000).unref();
}

module.exports = { server, refreshAllWatches };
