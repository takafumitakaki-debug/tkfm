// 商品グループごとに比較項目を集計し、重視ポイントに応じてスコアリングする。
const { effectivePrice } = require('./offer');
const { cleanTitle } = require('./group');

// 重視ポイントごとの重み（価格・評価・レビュー数・出品数）
const PRIORITIES = {
  balance: { price: 0.4, rating: 0.35, popularity: 0.15, offers: 0.1, label: 'バランス' },
  price: { price: 0.7, rating: 0.15, popularity: 0.1, offers: 0.05, label: '安さ重視' },
  rating: { price: 0.15, rating: 0.55, popularity: 0.25, offers: 0.05, label: '評価重視' },
};

// レビュー件数が少ない高評価を割り引く（ベイズ平均）
const PRIOR_MEAN = 3.8;
const PRIOR_WEIGHT = 10;

function summarizeGroup(offers) {
  // 在庫ありを先に、その中で実質価格の安い順。先頭が「最安ショップ」
  const sorted = [...offers].sort(
    (a, b) => Number(b.available) - Number(a.available) || effectivePrice(a) - effectivePrice(b)
  );
  const best = sorted[0];
  const inStock = sorted.filter((o) => o.available);
  const prices = (inStock.length ? inStock : sorted).map(effectivePrice);
  const reviewCount = offers.reduce((s, o) => s + o.reviewCount, 0);
  const ratedSum = offers.reduce((s, o) => s + (o.rating ? o.rating * o.reviewCount : 0), 0);
  const rating = reviewCount ? ratedSum / reviewCount : null;
  const bayesRating = (ratedSum + PRIOR_MEAN * PRIOR_WEIGHT) / (reviewCount + PRIOR_WEIGHT);
  // 代表名は一番短い商品名（宣伝文句が少ないことが多い）
  const title = offers.map((o) => cleanTitle(o.title)).sort((a, b) => a.length - b.length)[0];
  return {
    title,
    image: (offers.find((o) => o.image) || {}).image || '',
    offers: sorted.map((o) => ({ ...o, effectivePrice: effectivePrice(o) })),
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    bestOffer: { ...best, effectivePrice: effectivePrice(best) },
    rating,
    bayesRating,
    reviewCount,
    shopCount: new Set(offers.map((o) => `${o.source}:${o.shop}`)).size,
    relevance: Math.max(...offers.map((o) => (o.relevance == null ? 1 : o.relevance))),
    attrMatch: offers.some((o) => o.attrMatch === true) ? true : null,
    sources: [...new Set(offers.map((o) => o.sourceLabel))],
  };
}

function scale(value, min, max, invert = false) {
  if (max === min) return 1;
  const v = (value - min) / (max - min);
  return invert ? 1 - v : v;
}

function reasonsFor(g, ctx) {
  const reasons = [];
  if (g.bestOffer.effectivePrice === ctx.minPrice) reasons.push('候補の中で実質価格が最安');
  else if (g.bestOffer.effectivePrice <= ctx.medianPrice) reasons.push('実質価格が候補の中央値以下');
  if (g.rating && g.reviewCount >= 30 && g.rating >= 4.3) {
    reasons.push(`レビュー平均 ${g.rating.toFixed(2)}（${g.reviewCount.toLocaleString()}件）`);
  }
  if (g.reviewCount === ctx.maxReviews && g.reviewCount > 0) reasons.push('レビュー件数が最多（売れ筋）');
  if (g.shopCount >= 3) reasons.push(`${g.shopCount}ショップで取扱いあり・価格比較しやすい`);
  if (g.bestOffer.points > 0) reasons.push(`最安ショップで ${g.bestOffer.points.toLocaleString()}pt 還元`);
  if (g.bestOffer.shipping === 0) reasons.push('最安ショップは送料無料');
  if (g.attrMatch) reasons.push('指定の条件（サイズ等）が商品名に記載あり');
  return reasons;
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function recommend(groups, { priority = 'balance', budget = null } = {}) {
  const w = PRIORITIES[priority] || PRIORITIES.balance;
  let summaries = groups.map(summarizeGroup);
  const overBudget = budget ? summaries.filter((g) => g.bestOffer.effectivePrice > budget) : [];
  if (budget) summaries = summaries.filter((g) => g.bestOffer.effectivePrice <= budget);
  if (!summaries.length) return { priority: w.label, items: [], overBudgetCount: overBudget.length };

  const prices = summaries.map((g) => g.bestOffer.effectivePrice);
  const logReviews = summaries.map((g) => Math.log10(g.reviewCount + 1));
  const ratings = summaries.map((g) => g.bayesRating);
  const offerCounts = summaries.map((g) => g.shopCount);
  const ctx = {
    minPrice: Math.min(...prices),
    medianPrice: median(prices),
    maxReviews: Math.max(...summaries.map((g) => g.reviewCount)),
  };

  const items = summaries
    .map((g, i) => {
      const parts = {
        price: scale(prices[i], ctx.minPrice, Math.max(...prices), true),
        rating: scale(ratings[i], Math.min(...ratings), Math.max(...ratings)),
        popularity: scale(logReviews[i], Math.min(...logReviews), Math.max(...logReviews)),
        offers: scale(offerCounts[i], Math.min(...offerCounts), Math.max(...offerCounts)),
      };
      const score =
        parts.price * w.price + parts.rating * w.rating + parts.popularity * w.popularity + parts.offers * w.offers;
      // 検索語との関連度が低い候補は割り引く（推測検索で広げた結果が上に来すぎないように）
      const adjusted = score * (0.6 + 0.4 * g.relevance);
      return { ...g, score: Math.round(adjusted * 100), scoreParts: parts, reasons: reasonsFor(g, ctx) };
    })
    .sort((a, b) => b.score - a.score);

  return { priority: w.label, items, overBudgetCount: overBudget.length };
}

module.exports = { recommend, summarizeGroup, PRIORITIES };
