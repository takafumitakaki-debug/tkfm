// 有効な全ソースへ同じ検索語を投げ、結果を共通項目にそろえて集める。
// 1ソースが落ちても他の結果は返す。同じ検索語は一定時間キャッシュしてAPIへの負荷を抑える。
const rakuten = require('../sources/rakuten');
const yahoo = require('../sources/yahoo');
const demo = require('../sources/demo');

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function activeSources() {
  const real = [rakuten, yahoo].filter((s) => s.enabled());
  // 実ソースが1つもなければデモ、もしくは明示的に DEMO=1 のとき
  if (!real.length || process.env.DEMO === '1') return [...real, demo];
  return real;
}

async function crawl(query, sources = activeSources()) {
  const key = `${sources.map((s) => s.id).join(',')}::${query}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const results = await Promise.allSettled(sources.map((s) => s.search(query)));
  const offers = [];
  const status = sources.map((s, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      offers.push(...r.value.filter((o) => o.title && o.price > 0));
      return { id: s.id, label: s.label, ok: true, count: r.value.length, demo: Boolean(s.isDemo) };
    }
    return { id: s.id, label: s.label, ok: false, error: String(r.reason && r.reason.message), demo: false };
  });

  const value = { offers, sources: status };
  if (status.some((s) => s.ok)) cache.set(key, { at: Date.now(), value });
  return value;
}

module.exports = { crawl, activeSources };
