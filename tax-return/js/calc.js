/* 税額計算（DOM に依存しない純粋関数。node のテストからも読み込む） */
(() => {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const TX = (root.TX = root.TX || {});

  const num = (v) => {
    const n = Number(String(v ?? '').replace(/[,，円\s]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const floorTo = (v, unit) => Math.floor(v / unit) * unit;
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  TX.num = num;

  TX.rulesFor = (year) => TX.RULES[year] || TX.RULES[TX.DEFAULT_YEAR];

  /** 給与所得控除額（所得税法別表第五の端数処理を含む） */
  TX.salaryDeduction = (revenue, year) => {
    const r = TX.rulesFor(year);
    const rev = Math.max(0, Math.floor(num(revenue)));
    if (rev === 0) return 0;
    // 660万円未満は 4,000 円単位に切り下げた額で計算する（別表第五）
    const base = rev < 6600000 ? floorTo(rev, 4000) : rev;
    let f;
    if (base <= 3600000) f = base * 0.3 + 80000;
    else if (base <= 6600000) f = base * 0.2 + 440000;
    else if (base <= 8500000) f = base * 0.1 + 1100000;
    else f = 1950000;
    f = Math.floor(f);
    if (f <= r.salaryMin) return Math.min(rev, r.salaryMin);
    // 端数切り下げ分は控除側に含まれる（所得 = 切り下げ後収入 − 控除）
    return rev - (base - f);
  };

  TX.salaryIncome = (revenue, year) => Math.max(0, Math.floor(num(revenue)) - TX.salaryDeduction(revenue, year));

  /** 所得金額調整控除（給与850万円超で、23歳未満の扶養親族・特別障害者がいる場合） */
  TX.salaryAdjust = (revenue, eligible) => {
    if (!eligible) return 0;
    const rev = num(revenue);
    if (rev <= 8500000) return 0;
    return Math.ceil((Math.min(rev, 10000000) - 8500000) * 0.1);
  };

  TX.basicDeduction = (totalIncome, year) => {
    const r = TX.rulesFor(year);
    for (const [limit, amount] of r.basic) if (totalIncome <= limit) return amount;
    return 0;
  };

  TX.incomeTax = (taxable) => {
    if (taxable <= 0) return { tax: 0, rate: 0.05 };
    for (const [limit, rate, ded] of TX.INCOME_TAX_TABLE) {
      if (taxable <= limit) return { tax: Math.floor(taxable * rate - ded), rate };
    }
    return { tax: 0, rate: 0 };
  };

  /** 副業の帳簿を科目別に集計 */
  TX.summarizeLedger = (ledger) => {
    const income = {};
    const expense = {};
    let revenue = 0;
    let expenses = 0;
    let withheld = 0;
    for (const t of ledger || []) {
      const amount = Math.max(0, Math.floor(num(t.amount)));
      if (t.type === 'in') {
        income[t.cat] = (income[t.cat] || 0) + amount;
        revenue += amount;
        withheld += Math.max(0, Math.floor(num(t.withheld)));
      } else {
        const ratio = t.ratio === '' || t.ratio == null ? 100 : Math.min(100, Math.max(0, num(t.ratio)));
        const v = Math.floor((amount * ratio) / 100);
        expense[t.cat] = (expense[t.cat] || 0) + v;
        expenses += v;
      }
    }
    return { income, expense, revenue, expenses, withheld, profit: revenue - expenses };
  };

  /** 医療費控除とセルフメディケーション税制 */
  TX.medical = (d, totalIncome) => {
    const paid = sum(d.medical || [], (m) => Math.max(0, num(m.amount)));
    const covered = sum(d.medical || [], (m) => Math.min(Math.max(0, num(m.covered)), Math.max(0, num(m.amount))));
    const net = paid - covered;
    const threshold = Math.min(100000, Math.floor(Math.max(0, totalIncome) * 0.05));
    const normal = Math.min(2000000, Math.max(0, net - threshold));
    const sm = d.selfmed || {};
    const smPaid = Math.max(0, num(sm.amount));
    const self = sm.checkup ? Math.min(88000, Math.max(0, smPaid - 12000)) : 0;
    let mode = d.medMode || 'auto';
    if (mode === 'auto') mode = self > normal ? 'self' : 'normal';
    return { paid, covered, net, threshold, normal, self, smPaid, mode, amount: mode === 'self' ? self : normal };
  };

  /** 住民税の概算（調整控除・寄附金税額控除を含む簡易計算） */
  TX.residentTax = (ctx) => {
    const { totalIncome, social, smallBiz, life, quake, spouseTax, people, medicalAmount, donationTotal, marginalRate } = ctx;
    const p = people || {};
    const lifeRes = Math.min(70000, Math.floor((life * 7) / 12));
    const quakeRes = Math.min(25000, Math.floor(quake / 2));
    const spouseRes = Math.floor((spouseTax * 33) / 38);
    let personal = 430000 + spouseRes;
    let diff = 50000 + (spouseTax > 0 ? 50000 : 0);
    for (const [key, def] of Object.entries(TX.PERSONAL)) {
      const n = Math.max(0, Math.floor(num(p[key])));
      personal += def.res * n;
      diff += def.diff * n;
    }
    const st = TX.SELF_STATUS[p.selfStatus] || TX.SELF_STATUS.none;
    personal += st.res;
    diff += st.diff;
    if (p.student) {
      personal += TX.WORKING_STUDENT.res;
      diff += TX.WORKING_STUDENT.diff;
    }
    if (totalIncome > 24000000) personal -= 430000;
    const deductions = social + smallBiz + lifeRes + quakeRes + personal + medicalAmount;
    const taxable = floorTo(Math.max(0, totalIncome - deductions), 1000);
    let adjust = 0;
    if (totalIncome <= 25000000 && taxable > 0) {
      adjust = taxable <= 2000000 ? Math.min(diff, taxable) * 0.05 : Math.max(diff - (taxable - 2000000), 50000) * 0.05;
    }
    const base = Math.max(0, Math.floor(taxable * 0.1 - adjust));
    // 寄附金税額控除（ふるさと納税：基本分＋特例分）
    let donationCredit = 0;
    if (donationTotal > 2000 && base > 0) {
      const basicPart = (Math.min(donationTotal, totalIncome * 0.3) - 2000) * 0.1;
      const specialRate = Math.max(0, 0.9 - marginalRate * 1.021);
      const specialPart = Math.min((donationTotal - 2000) * specialRate, base * 0.2);
      donationCredit = Math.floor(Math.max(0, basicPart) + specialPart);
    }
    const incomeLevy = Math.max(0, base - donationCredit);
    const perCapita = taxable > 0 || totalIncome > 450000 ? 5000 : 0; // 均等割（森林環境税を含む目安）
    // ふるさと納税の上限目安（自己負担2,000円で済む寄附額）
    const furusatoLimit = base > 0 ? Math.floor((base * 0.2) / Math.max(0.0001, 0.9 - marginalRate * 1.021) + 2000) : 0;
    return { taxable, base, adjust: Math.floor(adjust), donationCredit, incomeLevy, perCapita, total: incomeLevy + perCapita, furusatoLimit };
  };

  /**
   * 年分のデータから申告書の各欄・税額を計算する
   * @param {object} d   1年分の入力データ
   * @param {number} year 西暦（年分）
   */
  TX.compute = (d, year) => {
    const r = TX.rulesFor(year);
    const slips = d.slips || [];
    const ex = d.extra || {};
    const p = d.people || {};
    const warnings = [];

    // ── 給与 ──
    const salaryRevenue = sum(slips, (s) => Math.max(0, num(s.pay)));
    const salaryDed = TX.salaryDeduction(salaryRevenue, year);
    const salaryAdjust = TX.salaryAdjust(salaryRevenue, p.adjustSalary);
    const salaryIncome = Math.max(0, salaryRevenue - salaryDed - salaryAdjust);
    const salaryWithheld = sum(slips, (s) => Math.max(0, num(s.withheld)));
    const employers = slips.filter((s) => num(s.pay) > 0).length;
    const notAdjusted = slips.some((s) => num(s.pay) > 0 && s.nencho === false);

    // ── 副業 ──
    const side = d.side || {};
    const kind = side.kind === 'business' ? 'business' : 'misc';
    const ledger = TX.summarizeLedger(d.ledger);
    let blue = 0;
    if (kind === 'business' && side.blue) blue = Math.min(num(side.blue), Math.max(0, ledger.profit));
    let sideIncome = ledger.profit - blue;
    if (kind === 'misc' && sideIncome < 0) {
      warnings.push('雑所得の赤字は給与所得と相殺（損益通算）できないため 0 円として計算しています。');
      sideIncome = 0;
    }
    const sideWithheld = ledger.withheld;

    const totalIncome = Math.max(0, salaryIncome + sideIncome); // 総所得金額等＝合計所得金額（この範囲では同じ）

    // ── 所得控除 ──
    const social = sum(slips, (s) => Math.max(0, num(s.social) - num(s.smallBiz))) + Math.max(0, num(ex.social));
    const smallBiz = sum(slips, (s) => Math.max(0, num(s.smallBiz))) + Math.max(0, num(ex.smallBiz));
    const life = Math.min(120000, sum(slips, (s) => num(s.life)) + num(ex.life));
    const quake = Math.min(50000, sum(slips, (s) => num(s.quake)) + num(ex.quake));
    const spouse = sum(slips, (s) => Math.max(0, num(s.spouse)));
    let dependents = 0;
    let disability = 0;
    for (const [key, def] of Object.entries(TX.PERSONAL)) {
      const n = Math.max(0, Math.floor(num(p[key])));
      if (key.startsWith('dependent')) dependents += def.tax * n;
      else disability += def.tax * n;
    }
    const specificRelative = Math.max(0, num(p.specificRelative));
    const status = (TX.SELF_STATUS[p.selfStatus] || TX.SELF_STATUS.none).tax;
    const student = p.student ? TX.WORKING_STUDENT.tax : 0;
    const basic = TX.basicDeduction(totalIncome, year);
    const medical = TX.medical(d, totalIncome);
    const donations = d.donations || [];
    const donationTotal = sum(donations, (x) => Math.max(0, num(x.amount)));
    const donationDed = donationTotal > 2000 ? Math.min(donationTotal, Math.floor(totalIncome * 0.4)) - 2000 : 0;

    const ded = {
      social, smallBiz, life, quake, status, student, disability, spouse, dependents, specificRelative, basic,
    };
    ded.subtotal = Object.values(ded).reduce((a, b) => a + b, 0);
    ded.medical = medical.amount;
    ded.donation = Math.max(0, donationDed);
    ded.total = ded.subtotal + ded.medical + ded.donation;

    // ── 税額 ──
    const taxable = floorTo(Math.max(0, totalIncome - ded.total), 1000);
    const { tax: taxOnTaxable, rate } = TX.incomeTax(taxable);
    const housing = Math.min(taxOnTaxable, sum(slips, (s) => Math.max(0, num(s.housing))));
    const baseTax = taxOnTaxable - housing; // 基準所得税額
    const reconstruction = Math.floor(baseTax * 0.021);
    const totalTax = baseTax + reconstruction;
    const withheld = salaryWithheld + sideWithheld + Math.max(0, num(ex.otherWithheld));
    const declared = totalTax - withheld;
    const declaredRounded = declared >= 0 ? floorTo(declared, 100) : declared; // 納付は100円未満切捨て、還付は1円単位
    const prepaid = Math.max(0, num(ex.prepaid));
    const final = declaredRounded - prepaid;
    const balance = final >= 0 ? floorTo(final, 100) : final;

    // ── 申告が必要かの判定 ──
    const otherThanSalary = sideIncome;
    const reasons = [];
    let required = false;
    if (salaryRevenue > 20000000) { required = true; reasons.push('給与の収入金額が2,000万円を超えている'); }
    if (employers >= 2 || notAdjusted) {
      // 年末調整されていない（従たる）給与＋給与以外の所得が20万円超なら申告が必要
      let sub = slips.filter((s) => num(s.pay) > 0 && s.nencho === false);
      if (!sub.length) sub = [...slips].sort((a, b) => num(b.pay) - num(a.pay)).slice(1);
      const unadjustedPay = sum(sub, (s) => num(s.pay));
      if (unadjustedPay + Math.max(0, otherThanSalary) > 200000) {
        required = true;
        reasons.push('給与を2か所以上から受けていて、年末調整されていない給与と副業所得の合計が20万円を超えている');
      }
    }
    if (otherThanSalary > 200000) { required = true; reasons.push(`給与以外の所得（副業）が20万円を超えている（${otherThanSalary.toLocaleString()}円）`); }
    if (kind === 'business' && ledger.revenue > 0) { required = true; reasons.push('副業を事業所得として申告する'); }
    const refundOnly = !required && balance < 0;

    if (donations.some((x) => x.oneStop) && (required || balance < 0)) {
      warnings.push('確定申告をするとワンストップ特例は無効になります。ワンストップ特例を申請した分も含め、すべての寄附を申告してください（計算には全件を含めています）。');
    }
    if (!required && otherThanSalary > 0 && otherThanSalary <= 200000) {
      warnings.push('副業所得が20万円以下でも、住民税の申告は必要です（確定申告をする場合は不要）。確定申告をする場合は20万円以下の副業所得も必ず含めます。');
    }
    if (kind === 'misc' && ledger.revenue > 10000000) warnings.push('前々年の業務に係る雑所得の収入が1,000万円超の場合、収支内訳書の添付が必要です。');
    if (life >= 120000 && sum(slips, (s) => num(s.life)) + num(ex.life) > 120000) warnings.push('生命保険料控除は合計12万円が上限のため12万円で計算しています。');

    const residentCtx = {
      totalIncome, social, smallBiz, life, quake, spouseTax: spouse, people: p,
      medicalAmount: medical.amount, donationTotal, marginalRate: rate,
    };
    const resident = TX.residentTax(residentCtx);

    return {
      year, rules: r,
      salary: { revenue: salaryRevenue, deduction: salaryDed, adjust: salaryAdjust, income: salaryIncome, withheld: salaryWithheld, employers },
      side: { kind, ...ledger, blue, income: sideIncome, withheld: sideWithheld },
      totalIncome, ded, medical, donationTotal,
      taxable, rate, taxOnTaxable, housing, baseTax, reconstruction, totalTax,
      withheld, declared: declaredRounded, prepaid, balance,
      filing: { required, reasons, refundOnly },
      resident, warnings,
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TX;
})();
