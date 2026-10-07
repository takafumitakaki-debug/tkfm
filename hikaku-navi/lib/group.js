// 異なるショップの出品を「同じ商品」ごとにまとめる。
// 1. JANコードが一致すれば同一商品
// 2. 型番（英数字混在のトークン）が両方にあって食い違えば別商品
// 3. それ以外は商品名の文字バイグラム類似度（Jaccard）で判定

const PROMO_PATTERNS = [
  /【[^】]*】/g,
  /\[[^\]]*\]/g,
  /★[^★]*★/g,
  /＼[^／]*／/g,
  /\\[^/]*\//g,
  /(送料無料|ポイント\d+倍|あす楽|即納|正規品|国内正規品|新品|公式|最安値に挑戦|クーポン[^\s]*|楽天\S*|期間限定|セール|SALE)/gi,
];

// 表示用：囲み記号の宣伝文句だけ外す（大文字小文字などは保つ）
function cleanTitle(title) {
  const t = String(title || '').replace(/【[^】]*】|★[^★]*★|＼[^／]*／|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  return t || String(title || '').trim();
}

function normalizeTitle(title) {
  let t = String(title || '').normalize('NFKC').toLowerCase();
  for (const re of PROMO_PATTERNS) t = t.replace(re, ' ');
  return t.replace(/[\s　・／/|｜,、。!！?？()（）「」『』]+/g, ' ').trim();
}

// 型番らしいトークン：英字と数字を両方含み、3文字以上（例: wh-1000xm5, ipad10）
function modelNumbers(normTitle) {
  const tokens = normTitle.match(/[a-z0-9][a-z0-9\-_.]{2,}/g) || [];
  return new Set(
    tokens
      .filter((tok) => /[a-z]/.test(tok) && /\d/.test(tok))
      .map((tok) => tok.replace(/[-_.]/g, ''))
  );
}

function bigrams(normTitle) {
  const s = normTitle.replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function sameProduct(a, b, threshold) {
  if (a.offer.jan && b.offer.jan) return a.offer.jan === b.offer.jan;
  if (a.models.size && b.models.size) {
    for (const m of a.models) if (b.models.has(m)) return true;
    return false;
  }
  return jaccard(a.grams, b.grams) >= threshold;
}

function groupOffers(offers, { threshold = 0.5 } = {}) {
  const groups = [];
  for (const offer of offers) {
    const norm = normalizeTitle(offer.title);
    const item = { offer, models: modelNumbers(norm), grams: bigrams(norm) };
    const hit = groups.find((g) => sameProduct(g.key, item, threshold));
    if (hit) {
      hit.offers.push(offer);
    } else {
      groups.push({ key: item, offers: [offer] });
    }
  }
  return groups.map((g) => g.offers);
}

module.exports = { groupOffers, cleanTitle, normalizeTitle, modelNumbers, jaccard, bigrams };
