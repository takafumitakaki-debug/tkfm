// 価格履歴とウォッチリストをJSONファイルに保存する（data/store.json）。
// 取得のたびに商品ごとの最安値を記録し、前回からの値動きを出せるようにする。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeTitle } = require('./group');
const { normalizeQuery, toKatakana } = require('./query');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'store.json');
const MAX_POINTS = 200;
const MIN_GAP_MS = 5 * 60 * 1000; // 同じ値なら5分以内の重複記録はしない

let state = null;

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    state = {};
  }
  state.history = state.history || {};
  state.watches = state.watches || [];
  return state;
}

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DATA_FILE);
}

function queryKey(q) {
  return toKatakana(normalizeQuery(q)).toLowerCase();
}

function productKey(item) {
  const jan = item.offers.map((o) => o.jan).find(Boolean);
  return jan ? `jan:${jan}` : `t:${normalizeTitle(item.title)}`;
}

// 検索結果を記録し、各商品に priceHistory / priceChange を付けて返す
function recordSnapshot(q, items, at = Date.now()) {
  const s = load();
  const qk = queryKey(q);
  const bucket = (s.history[qk] = s.history[qk] || {});
  const annotated = items.map((item) => {
    const key = productKey(item);
    const points = (bucket[key] = bucket[key] || []);
    const price = item.bestOffer.effectivePrice;
    const last = points[points.length - 1];
    if (!last || last.price !== price || at - last.at >= MIN_GAP_MS) {
      points.push({ at, price, shop: item.bestOffer.shop });
      if (points.length > MAX_POINTS) points.splice(0, points.length - MAX_POINTS);
    }
    // 直近で価格が違った記録と比べる
    const prev = [...points].reverse().find((p) => p.price !== price);
    const lowest = Math.min(...points.map((p) => p.price));
    return {
      ...item,
      productKey: key,
      priceHistory: points.slice(-30),
      priceChange: prev ? { from: prev.price, diff: price - prev.price, since: prev.at } : null,
      isLowestEver: points.length > 1 && price <= lowest,
      firstSeen: points[0].at,
    };
  });
  save();
  return annotated;
}

function listWatches() {
  return load().watches;
}

function addWatch({ q, priority = 'balance', budget = null }) {
  const s = load();
  const existing = s.watches.find((w) => queryKey(w.q) === queryKey(q));
  if (existing) return existing;
  const watch = {
    id: crypto.randomUUID(),
    q,
    priority,
    budget,
    createdAt: Date.now(),
    lastRunAt: null,
    lastBest: null,
    alerts: [],
  };
  s.watches.push(watch);
  save();
  return watch;
}

function removeWatch(id) {
  const s = load();
  const before = s.watches.length;
  s.watches = s.watches.filter((w) => w.id !== id);
  save();
  return s.watches.length !== before;
}

// ウォッチの再取得結果を反映。おすすめ1位の実質価格が下がったらアラートを残す
function updateWatch(id, top, at = Date.now()) {
  const s = load();
  const w = s.watches.find((x) => x.id === id);
  if (!w) return null;
  if (top) {
    const best = { title: top.title, price: top.bestOffer.effectivePrice, shop: top.bestOffer.shop, url: top.bestOffer.url };
    if (w.lastBest && best.price < w.lastBest.price) {
      w.alerts.unshift({ at, title: best.title, from: w.lastBest.price, to: best.price, shop: best.shop });
      w.alerts = w.alerts.slice(0, 20);
    }
    w.lastBest = best;
  }
  w.lastRunAt = at;
  save();
  return w;
}

// テスト用
function _reset(newState = {}) {
  state = { history: {}, watches: [], ...newState };
}

module.exports = { recordSnapshot, listWatches, addWatch, removeWatch, updateWatch, queryKey, _reset };
