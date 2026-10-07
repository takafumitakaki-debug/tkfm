// 全ソース共通の「比較項目」。どのショップから取ってきても同じ形にそろえる。
//
// Offer = {
//   source:      'rakuten' | 'yahoo' | 'demo'
//   sourceLabel: 表示用ソース名
//   title:       商品名
//   price:       本体価格（税込・円）
//   shipping:    送料（円）。送料無料なら 0、不明なら null
//   points:      付与ポイント（円換算）
//   rating:      レビュー平均（0〜5）。なければ null
//   reviewCount: レビュー件数
//   shop:        ショップ名
//   url:         商品ページURL
//   image:       画像URL
//   jan:         JANコード（取れれば。同一商品の判定に使う）
//   available:   在庫あり
// }

function toNumber(v, fallback = null) {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function makeOffer(fields) {
  const price = toNumber(fields.price, 0);
  const rating = toNumber(fields.rating);
  return {
    source: fields.source,
    sourceLabel: fields.sourceLabel || fields.source,
    title: String(fields.title || '').trim(),
    price,
    shipping: fields.shipping == null ? null : toNumber(fields.shipping, null),
    points: Math.max(0, Math.round(toNumber(fields.points, 0))),
    rating: rating && rating > 0 ? Math.min(5, rating) : null,
    reviewCount: Math.max(0, Math.round(toNumber(fields.reviewCount, 0))),
    shop: String(fields.shop || '').trim(),
    url: fields.url || '',
    image: fields.image || '',
    jan: fields.jan ? String(fields.jan).replace(/\D/g, '') || null : null,
    available: fields.available !== false,
  };
}

// 実質価格 = 本体 + 送料 − ポイント（送料不明は 0 とみなし、別途フラグで示す）
function effectivePrice(offer) {
  return offer.price + (offer.shipping || 0) - offer.points;
}

module.exports = { makeOffer, effectivePrice, toNumber };
