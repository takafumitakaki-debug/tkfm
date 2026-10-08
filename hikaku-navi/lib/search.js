// 検索の一連の流れ：収集 → 同一商品のまとめ → おすすめ順 → 価格履歴に記録
const { crawl } = require('./crawl');
const { groupOffers } = require('./group');
const { recommend } = require('./recommend');
const store = require('./store');

async function runSearch({ q, priority = 'balance', budget = null, refresh = false }) {
  const crawled = await crawl(q, { refresh });
  const result = recommend(groupOffers(crawled.offers), { priority, budget });
  // キャッシュから返したときは履歴を増やさない（実際に取り直したときだけ記録）
  const items = crawled.cached
    ? store.recordSnapshot(q, result.items, crawled.fetchedAt)
    : store.recordSnapshot(q, result.items);
  return {
    query: q,
    budget,
    sources: crawled.sources,
    plan: crawled.plan,
    analysis: crawled.analysis,
    interpretation: crawled.interpretation,
    excluded: crawled.excluded,
    fetchedAt: crawled.fetchedAt,
    cached: crawled.cached,
    totalOffers: crawled.offers.length,
    priority: result.priority,
    overBudgetCount: result.overBudgetCount,
    items: items.slice(0, 20),
    watched: store.listWatches().some((w) => store.queryKey(w.q) === store.queryKey(q)),
  };
}

module.exports = { runSearch };
