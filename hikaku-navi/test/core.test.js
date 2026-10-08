const test = require('node:test');
const assert = require('node:assert');
const { makeOffer, effectivePrice } = require('../lib/offer');
const { groupOffers, normalizeTitle } = require('../lib/group');
const { recommend } = require('../lib/recommend');
const demo = require('../sources/demo');

const o = (f) => makeOffer({ source: 'x', shop: 's', ...f });

test('実質価格 = 本体 + 送料 - ポイント', () => {
  assert.strictEqual(effectivePrice(o({ title: 'a', price: 1000, shipping: 500, points: 100 })), 1400);
  assert.strictEqual(effectivePrice(o({ title: 'a', price: '1,980円', shipping: null })), 1980);
});

test('宣伝文句を除去して正規化', () => {
  assert.strictEqual(normalizeTitle('【送料無料】★ポイント10倍★ ＳＯＮＹ WH-1000XM5'), 'sony wh-1000xm5');
});

test('JAN・型番・名前の類似で同一商品をまとめる', () => {
  const groups = groupOffers([
    o({ title: '【送料無料】ソニー WH-1000XM5 ブラック', price: 40000 }),
    o({ title: 'SONY ワイヤレスヘッドホン WH1000XM5', price: 41000 }),
    o({ title: 'ソニー WH-1000XM4', price: 30000 }),
    o({ title: 'abc', price: 1, jan: '4548736132580' }),
    o({ title: 'まったく別の名前', price: 2, jan: '4548736132580' }),
  ]);
  assert.deepStrictEqual(groups.map((g) => g.length), [2, 1, 2]);
});

test('安さ重視なら最安が1位、予算外は除外', () => {
  const groups = [
    [o({ title: 'A', price: 1000, rating: 3.5, reviewCount: 10 })],
    [o({ title: 'B', price: 5000, rating: 4.8, reviewCount: 2000 })],
    [o({ title: 'C', price: 5500, rating: 4.9, reviewCount: 3000 })],
  ];
  assert.strictEqual(recommend(groups, { priority: 'price' }).items[0].title, 'A');
  assert.strictEqual(recommend(groups, { priority: 'rating' }).items[0].title, 'C');
  const r = recommend(groups, { budget: 5200 });
  assert.strictEqual(r.items.length, 2);
  assert.strictEqual(r.overBudgetCount, 1);
});

test('デモソースは決定的で、グループ化できる', async () => {
  const a = await demo.search('掃除機');
  const b = await demo.search('掃除機');
  assert.deepStrictEqual(a, b);
  const groups = groupOffers(a);
  assert.ok(groups.length >= 4 && groups.length < a.length + 1);
});

test('在庫切れは最安でも最安ショップにしない', () => {
  const r = recommend([[o({ title: 'A', price: 100, available: false }), o({ title: 'A', price: 200 })]]);
  assert.strictEqual(r.items[0].bestOffer.price, 200);
  assert.strictEqual(r.items[0].offers[0].price, 200);
});

test('サイズ表記（27cm など）は型番とみなさない', () => {
  const groups = groupOffers([
    o({ title: 'スパイク スタンダード DM-100 27cm', price: 1 }),
    o({ title: 'スパイク プロ DM-107 27cm', price: 2 }),
  ]);
  assert.strictEqual(groups.length, 2);
});
