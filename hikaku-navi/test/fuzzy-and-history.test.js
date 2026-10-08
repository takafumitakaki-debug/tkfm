const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hikaku-')), 'store.json');
delete process.env.ANTHROPIC_API_KEY;

const { analyzeQuery, relevance, matchesAttrs } = require('../lib/query');
const { crawl } = require('../lib/crawl');
const { makeOffer } = require('../lib/offer');
const { groupOffers } = require('../lib/group');
const { recommend } = require('../lib/recommend');
const store = require('../lib/store');

test('曖昧な語を分解し、サイズは条件として取り出す', () => {
  const a = analyzeQuery('モナルシーダネオ3 wide elite 27cm');
  assert.deepStrictEqual(a.tokens, ['モナルシーダ', 'ネオ', '3', 'wide', 'elite']);
  assert.deepStrictEqual(a.attrs.map((x) => [x.type, x.value]), [['size', 27]]);
  assert.ok(a.candidates.includes('モナルシーダ ネオ 3 ワイド エリート'));
  assert.ok(a.candidates.includes('モナルシーダ neo iii wide elite'));
  assert.strictEqual(a.candidates.at(-1), 'モナルシーダ');
});

test('ひらがな・全角のゆれをそろえる', () => {
  const r = analyzeQuery('ろぼっと掃除機');
  assert.strictEqual(r.core, 'ろぼっと掃除機');
  assert.ok(r.candidates.includes('ロボット掃除機'));
  assert.strictEqual(relevance('アイロボット ロボット掃除機 ルンバ', r.tokens), 1);
  assert.strictEqual(analyzeQuery('ＰＳ５　コントローラー').tokens[0], 'PS5');
});

test('言い換え語も関連ありとみなし、サイズ範囲を判定する', () => {
  const { tokens, attrs } = analyzeQuery('モナルシーダネオ3 wide elite 27cm');
  assert.strictEqual(relevance('ミズノ モナルシーダ NEO III WIDE ELITE 24.5-28.0cm', tokens), 1);
  assert.strictEqual(matchesAttrs('… 24.5-28.0cm', attrs), true);
  assert.strictEqual(matchesAttrs('… 26.5cm', attrs), false);
  assert.strictEqual(matchesAttrs('サイズ記載なし', attrs), null);
});

test('ヒットしない語は候補を順に試して広げ、関連の薄い結果と条件違いは除外する', async () => {
  const seen = [];
  const fake = {
    id: 'fake',
    label: 'テストモール',
    async search(q) {
      seen.push(q);
      if (q !== 'モナルシーダ ネオ 3 ワイド エリート') return [];
      const mk = (title, price, shop) => makeOffer({ source: 'fake', title, price, shop, url: `https://x/${shop}/${price}` });
      return [
        mk('ミズノ モナルシーダ ネオ 3 ワイド エリート 27.0cm', 9000, 'A'),
        mk('ミズノ モナルシーダ ネオ 3 ワイド エリート 24.5-28.0cm', 8500, 'B'),
        mk('ミズノ モナルシーダ ネオ 3 ワイド エリート 25.0cm', 8000, 'C'),
        mk('サッカーソックス 3足組', 1000, 'D'),
      ];
    },
  };
  const r = await crawl('モナルシーダネオ3 wide elite 27cm', { sources: [fake], refresh: true });
  assert.ok(seen.length >= 3, `試行: ${seen.join(' / ')}`);
  assert.deepStrictEqual(r.offers.map((o) => o.shop).sort(), ['A', 'B']);
  assert.deepStrictEqual(r.excluded, { lowRelevance: 1, attrMismatch: 1 });

  const again = await crawl('モナルシーダネオ3 wide elite 27cm', { sources: [fake] });
  assert.strictEqual(again.cached, true);
  const fresh = await crawl('モナルシーダネオ3 wide elite 27cm', { sources: [fake], refresh: true });
  assert.strictEqual(fresh.cached, false);
});

test('価格履歴を記録し、前回比と値下がりアラートを出す', () => {
  store._reset();
  const items = (price) =>
    recommend(groupOffers([makeOffer({ source: 'x', title: 'テスト商品 ABC-123', price, shop: 's' })])).items;
  const t0 = Date.now();
  store.recordSnapshot('テスト', items(10000), t0);
  const [second] = store.recordSnapshot('テスト', items(9200), t0 + 60 * 60 * 1000);
  assert.deepStrictEqual(second.priceChange && second.priceChange.diff, -800);
  assert.strictEqual(second.isLowestEver, true);
  assert.strictEqual(second.priceHistory.length, 2);

  const w = store.addWatch({ q: 'テスト' });
  assert.strictEqual(store.addWatch({ q: 'てすと' }).id, w.id, '表記ゆれでも同じウォッチ');
  store.updateWatch(w.id, items(10000)[0]);
  const updated = store.updateWatch(w.id, items(9500)[0]);
  assert.strictEqual(updated.alerts[0].to, 9500);
  assert.ok(fs.existsSync(process.env.DATA_FILE));
  assert.strictEqual(store.removeWatch(w.id), true);
});
