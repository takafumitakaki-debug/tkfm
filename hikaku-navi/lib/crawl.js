// 有効な全ソースへ検索語を投げ、結果を共通項目にそろえて集める。
// 曖昧な語は推測した候補（AI解釈 → 表記ゆれ → 緩和）を順に試し、十分な件数が集まったら止める。
// 1ソースが落ちても他の結果は返す。同じ検索語は一定時間キャッシュ（refresh で無視）。
const rakuten = require('../sources/rakuten');
const yahoo = require('../sources/yahoo');
const demo = require('../sources/demo');
const { analyzeQuery, relevance, matchesAttrs } = require('./query');
const ai = require('./ai');

const CACHE_TTL_MS = (Number(process.env.CACHE_TTL_MIN) || 10) * 60 * 1000;
const MAX_ATTEMPTS = 4;
const ENOUGH_OFFERS = 10;
const cache = new Map();

function activeSources() {
  const real = [rakuten, yahoo].filter((s) => s.enabled());
  // 実ソースが1つもなければデモ、もしくは明示的に DEMO=1 のとき
  if (!real.length || process.env.DEMO === '1') return [...real, demo];
  return real;
}

async function searchAll(query, sources) {
  const results = await Promise.allSettled(sources.map((s) => s.search(query)));
  return sources.map((s, i) => {
    const r = results[i];
    return r.status === 'fulfilled'
      ? { source: s, offers: r.value.filter((o) => o.title && o.price > 0) }
      : { source: s, error: String(r.reason && r.reason.message) };
  });
}

function offerKey(o) {
  return `${o.source}|${o.url || `${o.shop}|${o.title}`}`;
}

async function crawl(raw, { sources = activeSources(), refresh = false } = {}) {
  const key = `${sources.map((s) => s.id).join(',')}::${raw}`;
  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.value.fetchedAt < CACHE_TTL_MS) {
    return { ...hit.value, cached: true };
  }

  const analysis = analyzeQuery(raw);
  const interpretation = await ai.interpretQuery(raw);
  const candidates = [...new Set([...(interpretation ? interpretation.searchQueries : []), ...analysis.candidates])];

  const offers = new Map();
  const status = new Map(sources.map((s) => [s.id, { id: s.id, label: s.label, ok: false, count: 0, demo: !!s.isDemo }]));
  const plan = [];
  for (const q of candidates.slice(0, MAX_ATTEMPTS)) {
    const results = await searchAll(q, sources);
    let added = 0;
    for (const r of results) {
      const st = status.get(r.source.id);
      if (r.error) {
        if (!st.ok) st.error = r.error;
        continue;
      }
      st.ok = true;
      delete st.error;
      for (const o of r.offers) {
        if (!offers.has(offerKey(o))) {
          offers.set(offerKey(o), o);
          st.count++;
          added++;
        }
      }
    }
    plan.push({ query: q, added });
    if (offers.size >= ENOUGH_OFFERS) break;
  }

  // 関連度と条件一致を付ける。関連の高い候補が十分あれば、関連の低いものは外す
  const mustInclude = interpretation ? interpretation.mustInclude : [];
  const scored = [...offers.values()].map((o) => ({
    ...o,
    relevance: Math.max(relevance(o.title, analysis.tokens), mustInclude.length ? relevance(o.title, mustInclude) : 0),
    attrMatch: matchesAttrs(o.title, analysis.attrs),
  }));
  const strong = scored.filter((o) => o.relevance >= 0.6);
  const relevant = strong.length >= 3 ? strong : scored.filter((o) => o.relevance >= 0.3);
  const kept = relevant.filter((o) => o.attrMatch !== false);

  const value = {
    offers: kept,
    excluded: { lowRelevance: scored.length - relevant.length, attrMismatch: relevant.length - kept.length },
    sources: [...status.values()],
    plan,
    analysis: { core: analysis.core, attrs: analysis.attrs, tokens: analysis.tokens },
    interpretation,
    fetchedAt: Date.now(),
    cached: false,
  };
  if (value.sources.some((s) => s.ok)) cache.set(key, { value });
  return value;
}

module.exports = { crawl, activeSources };
