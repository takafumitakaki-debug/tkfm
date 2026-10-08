// デモ用ソース。APIキー未設定でも画面と比較ロジックを確認できるよう、
// 検索語から決定的（同じ語なら毎回同じ）な架空データを生成する。実在の商品・価格ではない。
const { makeOffer } = require('../lib/offer');

function seededRandom(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const SHOPS = ['デモ家電館', 'サンプルストア', 'テスト商店', 'みほんマート', 'ダミー堂', 'れいのショップ'];
const SOURCES = [
  { source: 'demo-a', sourceLabel: 'デモモールA' },
  { source: 'demo-b', sourceLabel: 'デモモールB' },
];
const VARIANTS = ['スタンダード', 'プロ', 'ライト', 'プレミアム', 'コンパクト', 'エントリー'];

function enabled() {
  return true;
}

async function search(query) {
  const rand = seededRandom(query);
  const base = 2000 + Math.floor(rand() * 30000);
  const products = VARIANTS.slice(0, 4 + Math.floor(rand() * 3)).map((v, i) => ({
    name: `${query} ${v} モデル DM-${100 + i * 7}`,
    price: Math.round((base * (0.6 + rand() * 1.2)) / 10) * 10,
    rating: 3.4 + rand() * 1.5,
    reviews: Math.floor(rand() ** 2 * 3000),
  }));

  const offers = [];
  for (const p of products) {
    const shopCount = 1 + Math.floor(rand() * 4);
    for (let s = 0; s < shopCount; s++) {
      const src = SOURCES[Math.floor(rand() * SOURCES.length)];
      const price = Math.round((p.price * (0.92 + rand() * 0.16)) / 10) * 10;
      const prefix = rand() < 0.4 ? '【送料無料】' : rand() < 0.5 ? '★ポイント5倍★' : '';
      offers.push(
        makeOffer({
          ...src,
          title: `${prefix}${p.name}`,
          price,
          shipping: rand() < 0.6 ? 0 : 550,
          points: Math.floor(price * (rand() < 0.3 ? 0.05 : 0.01)),
          rating: Math.min(5, p.rating + (rand() - 0.5) * 0.3),
          reviewCount: Math.floor(p.reviews / shopCount),
          shop: SHOPS[Math.floor(rand() * SHOPS.length)],
          url: '',
          image: '',
          available: rand() > 0.05,
        })
      );
    }
  }
  return offers;
}

module.exports = { id: 'demo', label: 'デモデータ', enabled, search, isDemo: true };
