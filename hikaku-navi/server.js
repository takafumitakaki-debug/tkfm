// 比較ナビ：欲しいものを入力 → 複数ショップを同じ項目で収集 → 同一商品をまとめて比較・おすすめ
const http = require('http');
const fs = require('fs');
const path = require('path');
const { crawl, activeSources } = require('./lib/crawl');
const { groupOffers } = require('./lib/group');
const { recommend } = require('./lib/recommend');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function handleSearch(url, res) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return sendJson(res, 400, { error: '検索キーワードを入力してください' });
  if (q.length > 100) return sendJson(res, 400, { error: 'キーワードが長すぎます' });
  const priority = url.searchParams.get('priority') || 'balance';
  const budget = Number(url.searchParams.get('budget')) || null;

  const { offers, sources } = await crawl(q);
  const groups = groupOffers(offers);
  const result = recommend(groups, { priority, budget });
  sendJson(res, 200, {
    query: q,
    budget,
    sources,
    totalOffers: offers.length,
    ...result,
    items: result.items.slice(0, 20),
  });
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
    if (url.pathname === '/api/sources') {
      return sendJson(res, 200, activeSources().map((s) => ({ id: s.id, label: s.label, demo: !!s.isDemo })));
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
    console.log(`比較ナビ http://localhost:${PORT}  （収集先: ${names}）`);
  });
}

module.exports = { server };
