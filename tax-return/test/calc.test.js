// node --test tax-return/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/rules.js');
const TX = require('../js/calc.js');

test('給与所得控除（令和7年分・別表第五の端数処理）', () => {
  assert.equal(TX.salaryIncome(1000000, 2025), 350000);
  assert.equal(TX.salaryIncome(1900000, 2025), 1250000);
  assert.equal(TX.salaryIncome(4001999, 2025), 2760000);
  assert.equal(TX.salaryIncome(5000000, 2025), 3560000);
  assert.equal(TX.salaryIncome(8000000, 2025), 6100000);
  assert.equal(TX.salaryIncome(12000000, 2025), 10050000);
  assert.equal(TX.salaryIncome(500000, 2025), 0);
});

test('給与所得控除（令和8年分・最低保障74万円）', () => {
  assert.equal(TX.salaryIncome(1000000, 2026), 260000);
  assert.equal(TX.salaryIncome(2200000, 2026), 1460000); // 30%+8万＝74万と一致する境目
  assert.equal(TX.salaryIncome(5000000, 2026), 3560000); // 高い区分は変わらない
});

test('基礎控除', () => {
  assert.equal(TX.basicDeduction(1000000, 2025), 950000);
  assert.equal(TX.basicDeduction(3000000, 2025), 880000);
  assert.equal(TX.basicDeduction(5000000, 2025), 630000);
  assert.equal(TX.basicDeduction(3000000, 2026), 1040000);
  assert.equal(TX.basicDeduction(6000000, 2026), 670000);
  assert.equal(TX.basicDeduction(8000000, 2026), 620000);
  assert.equal(TX.basicDeduction(30000000, 2026), 0);
});

test('いわゆる年収の壁（給与のみで所得税がかからない上限）', () => {
  const tax = (pay, year) => TX.compute({ slips: [{ pay }] }, year).taxOnTaxable;
  assert.equal(tax(1600000, 2025), 0);
  assert.ok(tax(1610000, 2025) > 0);
  assert.equal(tax(1780000, 2026), 0);
  assert.ok(tax(1790000, 2026) > 0);
});

test('速算表', () => {
  assert.equal(TX.incomeTax(1949000).tax, 97450);
  assert.equal(TX.incomeTax(3000000).tax, 202500);
  assert.equal(TX.incomeTax(7000000).tax, 974000);
});

test('会社員＋副業（雑所得）＋医療費＋ふるさと納税の総合計算', () => {
  const d = {
    slips: [{ pay: 5000000, withheld: 90000, social: 750000, smallBiz: 0, life: 40000, quake: 0, spouse: 0, housing: 0, nencho: true }],
    side: { kind: 'misc' },
    ledger: [
      { type: 'in', cat: '売上（報酬・業務収入）', amount: 600000, withheld: 61260 },
      { type: 'out', cat: '通信費', amount: 120000, ratio: 50 },
      { type: 'out', cat: '消耗品費', amount: 40000 },
    ],
    medical: [{ amount: 180000, covered: 30000 }],
    donations: [{ amount: 50000 }],
  };
  const r = TX.compute(d, 2025);
  assert.equal(r.salary.income, 3560000);
  assert.equal(r.side.expenses, 100000);
  assert.equal(r.side.income, 500000);
  assert.equal(r.totalIncome, 4060000);
  assert.equal(r.ded.basic, 680000); // 合計所得406万円は336万円超489万円以下
  assert.equal(r.medical.amount, 50000); // 15万 − 10万
  assert.equal(r.ded.donation, 48000);
  assert.equal(r.ded.total, 1568000);
  assert.equal(r.taxable, 2492000);
  assert.equal(r.baseTax, 151700);
  assert.equal(r.reconstruction, 3185);
  assert.equal(r.withheld, 151260);
  assert.equal(r.balance, 3600); // 納付は100円未満切捨て
  assert.equal(r.filing.required, true);
});

test('副業20万円以下・還付申告・雑所得の赤字', () => {
  const base = { slips: [{ pay: 4000000, withheld: 80000, social: 600000, nencho: true }] };
  const small = TX.compute({ ...base, ledger: [{ type: 'in', amount: 150000 }] }, 2026);
  assert.equal(small.filing.required, false);
  const loss = TX.compute({ ...base, side: { kind: 'misc' }, ledger: [{ type: 'out', cat: '雑費', amount: 300000 }] }, 2026);
  assert.equal(loss.side.income, 0);
  assert.ok(loss.warnings.some((w) => w.includes('損益通算')));
  const biz = TX.compute({ ...base, side: { kind: 'business', blue: 650000 }, ledger: [{ type: 'in', amount: 500000 }] }, 2026);
  assert.equal(biz.side.blue, 500000); // 青色申告特別控除は所得を限度
  assert.equal(biz.side.income, 0);
});

test('2か所給与', () => {
  const r = TX.compute({ slips: [{ pay: 4000000, nencho: true }, { pay: 150000, nencho: false }] }, 2026);
  assert.equal(r.filing.required, false);
  const r2 = TX.compute({ slips: [{ pay: 4000000, nencho: true }, { pay: 250000, nencho: false }] }, 2026);
  assert.equal(r2.filing.required, true);
});

test('セルフメディケーション税制との有利判定', () => {
  const r = TX.compute({ slips: [{ pay: 4000000 }], medical: [{ amount: 80000 }], selfmed: { amount: 50000, checkup: true } }, 2026);
  assert.equal(r.medical.normal, 0);
  assert.equal(r.medical.self, 38000);
  assert.equal(r.medical.mode, 'self');
});
