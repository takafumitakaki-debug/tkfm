// Yahoo!ショッピング 商品検索API（v3）
// https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html
// 環境変数 YAHOO_APP_ID（必須）
const { fetchJson } = require('../lib/http');
const { makeOffer } = require('../lib/offer');

const ENDPOINT =
  process.env.YAHOO_ENDPOINT || 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch';

function enabled() {
  return Boolean(process.env.YAHOO_APP_ID);
}

async function search(query, { hits = 30 } = {}) {
  const params = new URLSearchParams({
    appid: process.env.YAHOO_APP_ID,
    query,
    results: String(Math.min(hits, 50)),
    in_stock: 'true',
  });
  const data = await fetchJson(`${ENDPOINT}?${params}`);
  return (data.hits || []).map((h) =>
    makeOffer({
      source: 'yahoo',
      sourceLabel: 'Yahoo!ショッピング',
      title: h.name,
      price: h.price,
      // shipping.code: 1=設定なし, 2=送料無料, 3=条件付き送料無料
      shipping: h.shipping && h.shipping.code === 2 ? 0 : null,
      points: h.point && h.point.amount,
      rating: h.review && h.review.rate,
      reviewCount: h.review && h.review.count,
      shop: h.seller && h.seller.name,
      url: h.url,
      image: h.image && (h.image.medium || h.image.small),
      jan: h.janCode,
      available: h.inStock !== false,
    })
  );
}

module.exports = { id: 'yahoo', label: 'Yahoo!ショッピング', enabled, search };
