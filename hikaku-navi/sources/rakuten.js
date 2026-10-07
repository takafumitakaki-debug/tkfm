// 楽天市場 商品検索API
// https://webservice.rakuten.co.jp/documentation/ichiba-item-search
// 環境変数 RAKUTEN_APP_ID（必須）, RAKUTEN_ACCESS_KEY（新API基盤で必要な場合）
const { fetchJson } = require('../lib/http');
const { makeOffer } = require('../lib/offer');

const ENDPOINT =
  process.env.RAKUTEN_ENDPOINT || 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';

function enabled() {
  return Boolean(process.env.RAKUTEN_APP_ID);
}

async function search(query, { hits = 30 } = {}) {
  const params = new URLSearchParams({
    applicationId: process.env.RAKUTEN_APP_ID,
    keyword: query,
    format: 'json',
    formatVersion: '2',
    hits: String(Math.min(hits, 30)),
    availability: '1',
    sort: 'standard',
  });
  if (process.env.RAKUTEN_ACCESS_KEY) params.set('accessKey', process.env.RAKUTEN_ACCESS_KEY);
  if (process.env.RAKUTEN_AFFILIATE_ID) params.set('affiliateId', process.env.RAKUTEN_AFFILIATE_ID);

  const data = await fetchJson(`${ENDPOINT}?${params}`);
  return (data.Items || []).map((it) => {
    const item = it.Item || it; // formatVersion 1/2 どちらでも読めるように
    const images = item.mediumImageUrls || [];
    const image = typeof images[0] === 'string' ? images[0] : images[0] && images[0].imageUrl;
    return makeOffer({
      source: 'rakuten',
      sourceLabel: '楽天市場',
      title: item.itemName,
      price: item.itemPrice,
      shipping: item.postageFlag === 0 ? 0 : null, // 0=送料込み, 1=送料別（金額はAPIで取れない）
      points: Math.floor((item.itemPrice * (item.pointRate || 1)) / 100),
      rating: item.reviewAverage,
      reviewCount: item.reviewCount,
      shop: item.shopName,
      url: item.affiliateUrl || item.itemUrl,
      image: image ? image.replace(/\?_ex=\d+x\d+/, '?_ex=300x300') : '',
      available: item.availability !== 0,
    });
  });
}

module.exports = { id: 'rakuten', label: '楽天市場', enabled, search };
