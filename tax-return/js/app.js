/* 画面の組み立て・入力・再計算 */
(() => {
  const TX = window.TX;
  const state = TX.load();
  let year = Number(state.year);
  let d = TX.yearData(state, year);
  let R = TX.compute(d, year);

  const yen = (n) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n || 0)).toLocaleString('ja-JP')}円`;
  const comma = (n) => Math.round(n || 0).toLocaleString('ja-JP');

  /** 簡易 DOM ビルダー */
  const h = (tag, props = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  };

  // ── 保存と再計算 ──
  let saveTimer = 0;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!TX.save(state)) toast('ブラウザに保存できませんでした。「バックアップ」で JSON を保存してください。');
    }, 300);
  };
  let live = [];
  const changed = (rerender = false) => {
    R = TX.compute(d, year);
    persist();
    renderSummary();
    if (rerender) renderTab();
    else live.forEach((f) => f());
  };
  /** 計算結果に応じて中身が変わる領域 */
  const liveBox = (fn, cls = '', tag = 'div') => {
    const el = h(tag, { class: cls });
    const upd = () => el.replaceChildren(...[fn()].flat(Infinity).filter((x) => x != null && x !== false));
    live.push(upd);
    upd();
    return el;
  };

  let toastTimer = 0;
  const toast = (msg) => {
    let t = document.querySelector('.toast');
    if (!t) document.body.append((t = h('div', { class: 'toast', role: 'status' })));
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  };

  // ── 入力部品 ──
  const money = (obj, key, attrs = {}) => {
    const fmt = (v) => (String(v ?? '').trim() === '' ? '' : TX.num(v).toLocaleString('ja-JP'));
    const el = h('input', { type: 'text', inputmode: 'numeric', class: 'money', value: fmt(obj[key]), placeholder: '0', ...attrs });
    el.addEventListener('input', () => { obj[key] = el.value; changed(); });
    el.addEventListener('blur', () => { el.value = fmt(el.value); obj[key] = el.value; });
    el.addEventListener('focus', () => el.select());
    return el;
  };
  const text = (obj, key, attrs = {}) => {
    const el = h('input', { type: 'text', value: obj[key] ?? '', ...attrs });
    el.addEventListener('input', () => { obj[key] = el.value; changed(); });
    return el;
  };
  const dateInput = (obj, key) => {
    const el = h('input', { type: 'date', value: obj[key] || '', min: `${year}-01-01`, max: `${year}-12-31` });
    el.addEventListener('change', () => { obj[key] = el.value; changed(); });
    return el;
  };
  const counter = (obj, key) => {
    const el = h('input', { type: 'number', min: 0, max: 20, step: 1, class: 'count', value: obj[key] || 0 });
    el.addEventListener('input', () => { obj[key] = Math.max(0, Math.floor(Number(el.value) || 0)); changed(); });
    return el;
  };
  const check = (obj, key, label, rerender = false) => {
    const el = h('input', { type: 'checkbox', checked: !!obj[key] });
    el.addEventListener('change', () => { obj[key] = el.checked; changed(rerender); });
    return h('label', { class: 'check' }, el, h('span', {}, label));
  };
  const select = (obj, key, options, rerender = false) => {
    const el = h('select', {}, options.map(([v, l]) => h('option', { value: v, selected: String(obj[key]) === String(v) }, l)));
    el.addEventListener('change', () => { obj[key] = el.value; changed(rerender); });
    return el;
  };
  const field = (label, input, help, cls = '') =>
    h('label', { class: `field ${cls}` }, h('span', { class: 'f-label' }, label), input, help ? h('span', { class: 'f-help' }, help) : null);
  const section = (title, lead, ...body) =>
    h('section', { class: 'card' }, h('h2', {}, title), lead ? h('p', { class: 'lead' }, lead) : null, ...body);
  const note = (msg, kind = 'info') => h('div', { class: `note ${kind}` }, msg);

  // ── 上部の結果バー ──
  const renderSummary = () => {
    const el = document.getElementById('summary');
    const refund = R.balance < 0;
    const status = R.filing.required
      ? h('span', { class: 'pill must' }, '確定申告が必要')
      : refund
        ? h('span', { class: 'pill good' }, '申告は任意（還付あり）')
        : h('span', { class: 'pill' }, '申告は不要の見込み');
    el.replaceChildren(
      h('div', { class: 'sum-item' }, h('span', { class: 'sum-label' }, R.rules.label), status),
      h('div', { class: `sum-item big ${refund ? 'refund' : R.balance > 0 ? 'pay' : ''}` },
        h('span', { class: 'sum-label' }, refund ? '還付見込み' : R.filing.required ? '納付見込み（所得税）' : '差額（源泉徴収税額を確認）'),
        h('strong', {}, yen(Math.abs(R.balance)))),
      h('div', { class: 'sum-item' }, h('span', { class: 'sum-label' }, '住民税（概算・年額）'), h('strong', {}, yen(R.resident.total))),
      h('div', { class: 'sum-item' }, h('span', { class: 'sum-label' }, '申告期間'), h('span', {}, R.rules.filing)),
    );
  };

  // ── タブ ──
  const TABS = [
    ['salary', '① 源泉徴収票'],
    ['side', '② 副業の帳簿'],
    ['deduct', '③ 控除'],
    ['result', '④ 計算結果'],
    ['guide', '⑤ 転記ガイド'],
    ['docs', '⑥ 書類チェック'],
  ];
  let tab = TABS.some(([k]) => k === state.tab) ? state.tab : 'salary';

  const renderTabs = () => {
    document.getElementById('tabs').replaceChildren(
      ...TABS.map(([k, l]) =>
        h('button', {
          role: 'tab', class: k === tab ? 'active' : '', 'aria-selected': String(k === tab),
          onclick: () => { tab = state.tab = k; persist(); renderTabs(); renderTab(); window.scrollTo({ top: 0 }); },
        }, l)),
    );
  };

  const renderTab = () => {
    live = [];
    const main = document.getElementById('main');
    const view = { salary: viewSalary, side: viewSide, deduct: viewDeduct, result: viewResult, guide: viewGuide, docs: viewDocs }[tab];
    main.replaceChildren(view());
    const idx = TABS.findIndex(([k]) => k === tab);
    main.append(h('div', { class: 'pager' },
      idx > 0 ? h('button', { onclick: () => gotoTab(TABS[idx - 1][0]) }, `← ${TABS[idx - 1][1]}`) : h('span'),
      idx < TABS.length - 1 ? h('button', { class: 'primary', onclick: () => gotoTab(TABS[idx + 1][0]) }, `${TABS[idx + 1][1]} →`) : h('span')));
  };
  const gotoTab = (k) => { tab = state.tab = k; persist(); renderTabs(); renderTab(); window.scrollTo({ top: 0 }); };

  // ════════ ① 源泉徴収票 ════════
  const viewSalary = () => {
    const wrap = h('div', { class: 'stack' });
    wrap.append(section('源泉徴収票の数字を写す',
      '勤務先から受け取った「給与所得の源泉徴収票」の各欄をそのまま入力します。2か所以上から給与をもらっている場合は「源泉徴収票を追加」で全部入力してください。',
    ));
    d.slips.forEach((s, i) => {
      const card = section(`${s.name || `勤務先${i + 1}`} の源泉徴収票`, null,
        h('div', { class: 'grid' },
          field('勤務先の名前（メモ）', text(s, 'name', { placeholder: '例：株式会社〇〇' })),
          h('div', { class: 'field' }, h('span', { class: 'f-label' }, '年末調整'), check(s, 'nencho', 'この勤務先で年末調整済み', true),
            h('span', { class: 'f-help' }, '12月まで在籍した主たる勤務先は通常「済み」。途中退職・アルバイト先は「未」のことが多い')),
          field('支払金額', money(s, 'pay'), '左上の「支払金額」欄（税・社保を引く前の年収）'),
          field('給与所得控除後の金額（確認用）', liveBox(() => {
            const inc = TX.salaryIncome(s.pay, year);
            return h('span', { class: 'calc' }, TX.num(s.pay) ? `${yen(inc)}（自動計算）` : '—');
          }), '源泉徴収票の同じ欄と一致するか確認（2か所分を合算すると変わります）'),
          field('源泉徴収税額', money(s, 'withheld'), '右上の「源泉徴収税額」欄'),
          field('社会保険料等の金額', money(s, 'social'), '「社会保険料等の金額」欄（内書きの小規模共済分も含めた全額）'),
          s.nencho ? [
            field('うち小規模企業共済等掛金', money(s, 'smallBiz'), '同じ欄の左上に小さく書かれた「内」の金額（iDeCo など）'),
            field('生命保険料の控除額', money(s, 'life')),
            field('地震保険料の控除額', money(s, 'quake')),
            field('配偶者（特別）控除の額', money(s, 'spouse')),
            field('住宅借入金等特別控除の額', money(s, 'housing'), '2年目以降の住宅ローン控除。1年目は別途計算が必要'),
          ] : null,
        ),
        d.slips.length > 1 ? h('div', { class: 'row-end' }, h('button', {
          class: 'danger small',
          onclick: () => { if (confirm('この源泉徴収票を削除しますか？')) { d.slips.splice(i, 1); changed(true); } },
        }, 'この源泉徴収票を削除')) : null,
      );
      wrap.append(card);
    });
    wrap.append(h('div', { class: 'row-end' }, h('button', {
      onclick: () => { d.slips.push({ id: TX.uid(), name: '', pay: '', withheld: '', social: '', smallBiz: '', life: '', quake: '', spouse: '', housing: '', nencho: false }); changed(true); },
    }, '＋ 源泉徴収票を追加')));
    wrap.append(note('扶養控除・障害者控除などの人数は「③ 控除」の「家族・本人の状況」で入力します（源泉徴収票の「控除対象扶養親族の数」欄を見ながら）。'));
    return wrap;
  };

  // ════════ ② 副業の帳簿 ════════
  let ledgerFilter = { month: '', cat: '', type: '' };
  const viewSide = () => {
    const wrap = h('div', { class: 'stack' });
    const side = d.side;
    wrap.append(section('副業の所得区分', null,
      h('div', { class: 'grid' },
        field('区分', select(side, 'kind', [['misc', '雑所得（業務）― 一般的な会社員の副業'], ['business', '事業所得 ― 開業届を出して継続的に営む規模']], true),
          '迷ったら「雑所得（業務）」。事業所得は記帳・帳簿保存など事業としての実態が必要'),
        side.kind === 'business'
          ? field('青色申告特別控除', select(side, 'blue', [[0, '白色申告（なし）'], [100000, '青色 10万円'], [550000, '青色 55万円（複式簿記・期限内提出）'], [650000, '青色 65万円（55万の要件＋e-Tax等）']]))
          : null,
      ),
    ));

    // 追加フォーム
    const draft = { date: '', type: 'out', cat: TX.EXPENSE_CATS[0], desc: '', amount: '', ratio: 100, withheld: '' };
    const catSel = h('select');
    const fillCats = () => {
      const cats = draft.type === 'in' ? TX.INCOME_CATS : TX.EXPENSE_CATS;
      catSel.replaceChildren(...cats.map((c) => h('option', { value: c }, c)));
      draft.cat = cats[0];
    };
    fillCats();
    catSel.addEventListener('change', () => (draft.cat = catSel.value));
    const typeSel = h('select', {}, h('option', { value: 'out' }, '経費'), h('option', { value: 'in' }, '収入'));
    const ratioIn = h('input', { type: 'number', min: 0, max: 100, value: 100, class: 'count' });
    const whIn = h('input', { type: 'text', inputmode: 'numeric', class: 'money', placeholder: '0' });
    const amountIn = h('input', { type: 'text', inputmode: 'numeric', class: 'money', placeholder: '0' });
    const dateIn = h('input', { type: 'date', min: `${year}-01-01`, max: `${year}-12-31` });
    const descIn = h('input', { type: 'text', placeholder: '例：〇〇社 4月分報酬 ／ プロバイダ料金' });
    const ratioField = field('事業で使う割合（家事按分）%', ratioIn);
    const whField = field('源泉徴収された額', h('div', { class: 'inline' }, whIn,
      h('button', { class: 'small', type: 'button', onclick: () => { whIn.value = Math.floor(TX.num(amountIn.value) * 0.1021).toLocaleString(); } }, '10.21%')),
    '報酬から天引きされた所得税（支払明細で確認）');
    const syncType = () => {
      draft.type = typeSel.value;
      fillCats();
      ratioField.hidden = draft.type === 'in';
      whField.hidden = draft.type !== 'in';
    };
    typeSel.addEventListener('change', syncType);
    syncType();
    const add = (e) => {
      e.preventDefault();
      if (!TX.num(amountIn.value)) { toast('金額を入力してください'); amountIn.focus(); return; }
      d.ledger.push({
        id: TX.uid(), date: dateIn.value, type: draft.type, cat: catSel.value, desc: descIn.value.trim(),
        amount: TX.num(amountIn.value), ratio: draft.type === 'out' ? Number(ratioIn.value || 100) : 100,
        withheld: draft.type === 'in' ? TX.num(whIn.value) : 0,
      });
      amountIn.value = ''; descIn.value = ''; whIn.value = '';
      changed(true);
      toast('追加しました');
    };
    wrap.append(section('取引を追加', '日付順でなくても大丈夫です。レシートはこの年分の申告期限から5年間（青色は7年間）保存します。',
      h('form', { class: 'grid add-form', onsubmit: add },
        field('日付', dateIn), field('区分', typeSel), field('科目', catSel), field('内容・取引先', descIn, null, 'wide'),
        field('金額（税込）', amountIn), ratioField, whField,
        h('div', { class: 'field end' }, h('button', { class: 'primary', type: 'submit' }, '追加')),
      ),
      h('div', { class: 'toolbar' },
        h('button', { onclick: () => document.getElementById('csv-file').click() }, 'CSV 取り込み（銀行・カード明細）'),
        h('button', { onclick: exportLedger }, 'CSV 書き出し'),
        h('input', { type: 'file', id: 'csv-file', accept: '.csv,.txt,text/csv', hidden: true, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openCSV(f); } }),
      ),
    ));

    // 集計
    wrap.append(section('集計', null, liveBox(() => {
      const s = R.side;
      const rows = [
        ...Object.entries(s.income).map(([k, v]) => h('tr', {}, h('td', {}, '収入'), h('td', {}, k), h('td', { class: 'num' }, yen(v)))),
        ...TX.EXPENSE_CATS.filter((c) => s.expense[c]).map((c) => h('tr', { class: c === '未分類' ? 'warn-row' : '' }, h('td', {}, '経費'), h('td', {}, c), h('td', { class: 'num' }, yen(s.expense[c])))),
      ];
      return [
        h('div', { class: 'kpis' },
          kpi('収入合計', yen(s.revenue)), kpi('経費合計（按分後）', yen(s.expenses)),
          s.blue ? kpi('青色申告特別控除', yen(s.blue)) : null,
          kpi(s.kind === 'business' ? '事業所得' : '雑所得', yen(s.profit - s.blue)), kpi('源泉徴収された額', yen(s.withheld))),
        rows.length ? h('table', { class: 'tbl compact' }, h('tbody', {}, rows)) : h('p', { class: 'muted' }, 'まだ取引がありません。'),
        s.expense['未分類'] ? note('「未分類」の経費があります。下の一覧で科目を選び直してください（事業に関係ない支出は削除）。', 'warn') : null,
      ];
    })));

    // 一覧
    const months = [...new Set(d.ledger.map((t) => (t.date || '').slice(0, 7)).filter(Boolean))].sort();
    const filterBar = h('div', { class: 'toolbar' },
      select(ledgerFilter, 'month', [['', 'すべての月'], ...months.map((m) => [m, `${Number(m.slice(5))}月`])], false),
      select(ledgerFilter, 'type', [['', '収入・経費'], ['in', '収入のみ'], ['out', '経費のみ']], false),
      select(ledgerFilter, 'cat', [['', 'すべての科目'], ...[...TX.INCOME_CATS, ...TX.EXPENSE_CATS].map((c) => [c, c])], false),
    );
    filterBar.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => renderTab()));
    const list = d.ledger
      .filter((t) => (!ledgerFilter.month || (t.date || '').startsWith(ledgerFilter.month)) && (!ledgerFilter.type || t.type === ledgerFilter.type) && (!ledgerFilter.cat || t.cat === ledgerFilter.cat))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const LIMIT = 300;
    wrap.append(section(`取引一覧（${d.ledger.length}件）`, null, filterBar,
      list.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl ledger' },
        h('thead', {}, h('tr', {}, h('th', {}, '日付'), h('th', {}, '区分'), h('th', {}, '科目'), h('th', {}, '内容'), h('th', {}, '金額'), h('th', {}, '按分%／源泉'), h('th', {}))),
        h('tbody', {}, list.slice(0, LIMIT).map(ledgerRow)),
      )) : h('p', { class: 'muted' }, '該当する取引はありません。'),
      list.length > LIMIT ? h('p', { class: 'muted' }, `先頭${LIMIT}件を表示しています。月や科目で絞り込んでください。`) : null,
      d.ledger.length ? h('div', { class: 'row-end' }, h('button', {
        class: 'danger small',
        onclick: () => { if (confirm(`${year}年分の取引 ${d.ledger.length} 件をすべて削除しますか？`)) { d.ledger = []; changed(true); } },
      }, 'すべて削除')) : null,
    ));
    return wrap;
  };

  const kpi = (label, value) => h('div', { class: 'kpi' }, h('span', {}, label), h('strong', {}, value));

  const ledgerRow = (t) => {
    const cats = t.type === 'in' ? TX.INCOME_CATS : TX.EXPENSE_CATS;
    const catSel = select(t, 'cat', (cats.includes(t.cat) ? cats : [t.cat, ...cats]).map((c) => [c, c]));
    if (t.cat === '未分類') catSel.classList.add('warn');
    catSel.addEventListener('change', () => catSel.classList.toggle('warn', t.cat === '未分類'));
    const typeSel = select(t, 'type', [['out', '経費'], ['in', '収入']]);
    typeSel.addEventListener('change', () => {
      t.cat = t.type === 'in' ? TX.INCOME_CATS[0] : '未分類';
      changed(true);
    });
    return h('tr', {},
      h('td', {}, dateInput(t, 'date')),
      h('td', {}, typeSel),
      h('td', {}, catSel),
      h('td', {}, text(t, 'desc')),
      h('td', {}, money(t, 'amount')),
      h('td', {}, t.type === 'in' ? money(t, 'withheld', { title: '源泉徴収された額' }) : h('input', {
        type: 'number', min: 0, max: 100, class: 'count', value: t.ratio ?? 100, title: '事業で使う割合（%）',
        oninput: (e) => { t.ratio = Math.min(100, Math.max(0, Number(e.target.value) || 0)); changed(); },
      })),
      h('td', {}, h('button', { class: 'ghost small', title: '削除', onclick: () => { d.ledger = d.ledger.filter((x) => x !== t); changed(true); } }, '✕')),
    );
  };

  const LEDGER_HEAD = ['日付', '区分', '科目', '内容', '金額', '按分%', '源泉徴収額'];
  const exportLedger = () => {
    const rows = [LEDGER_HEAD, ...[...d.ledger].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((t) => [
      t.date, t.type === 'in' ? '収入' : '経費', t.cat, t.desc, t.amount, t.type === 'out' ? t.ratio ?? 100 : '', t.type === 'in' ? t.withheld || 0 : '',
    ])];
    TX.download(`副業帳簿_${year}.csv`, TX.toCSV(rows), 'text/csv');
  };

  // ── CSV 取り込み ──
  const openCSV = async (file) => {
    const rows = TX.parseCSV(await TX.readText(file));
    if (!rows.length) { toast('CSV を読み取れませんでした'); return; }
    // このツールで書き出した形式ならそのまま取り込む
    if (LEDGER_HEAD.every((c, i) => (rows[0][i] || '').trim() === c)) {
      const add = rows.slice(1).map((r) => ({
        id: TX.uid(), date: TX.normDate(r[0]), type: r[1] === '収入' ? 'in' : 'out', cat: r[2] || '未分類', desc: r[3] || '',
        amount: TX.num(r[4]), ratio: r[5] === '' ? 100 : TX.num(r[5]), withheld: TX.num(r[6]),
      })).filter((t) => t.amount > 0);
      d.ledger.push(...add);
      changed(true);
      toast(`${add.length} 件を取り込みました`);
      return;
    }
    csvDialog(rows, file.name);
  };

  const csvDialog = (rows, name) => {
    const dlg = document.getElementById('csv-dialog');
    const width = Math.max(...rows.slice(0, 20).map((r) => r.length));
    const head = rows[0];
    const guess = (re) => {
      const i = head.findIndex((c) => re.test(c));
      return i >= 0 ? String(i) : '';
    };
    const opt = {
      header: !head.some((c) => TX.normDate(c)),
      date: guess(/日付|日時|利用日|取引日|年月日|date/i) || '0',
      desc: guess(/摘要|内容|利用店|ご利用先|取引先|お取引内容|店名|明細|description/i),
      mode: guess(/入金|預入|お預入/) && guess(/出金|引出|お引出|支払/) ? 'split' : 'single',
      amount: guess(/金額|利用額|amount/i),
      inCol: guess(/入金|預入|お預入/),
      outCol: guess(/出金|引出|お引出|支払/),
      sign: 'out', // single: すべて経費 / すべて収入 / マイナスを経費
    };
    const colOpts = [['', '（なし）'], ...Array.from({ length: width }, (_, i) => [String(i), `${i + 1}列目${opt.header && head[i] ? `：${head[i]}` : ''}`])];
    const preview = h('div', { class: 'tbl-wrap' });
    const showPreview = () => {
      preview.replaceChildren(h('table', { class: 'tbl compact' }, h('tbody', {},
        rows.slice(0, 6).map((r, ri) => h('tr', { class: ri === 0 && opt.header ? 'head-row' : '' }, Array.from({ length: width }, (_, i) => h('td', {}, r[i] ?? '')))))));
    };
    const body = h('div', { class: 'dlg-body' });
    const renderBody = () => {
      body.replaceChildren(
        h('h2', {}, `CSV 取り込み：${name}`),
        h('p', { class: 'lead' }, '銀行・クレジットカードの明細 CSV の列を対応づけます。取り込んだ経費は摘要から科目を自動推定し、分からないものは「未分類」になります。事業に関係ない行は取り込み後に削除してください。'),
        preview,
        h('div', { class: 'grid' },
          check(opt, 'header', '1行目は見出し'),
          field('日付の列', select(opt, 'date', colOpts)),
          field('内容（摘要）の列', select(opt, 'desc', colOpts)),
          field('金額の形式', select(opt, 'mode', [['single', '金額が1列'], ['split', '入金・出金が別の列']])),
          opt.mode === 'single' ? [
            field('金額の列', select(opt, 'amount', colOpts)),
            field('取り込み方', select(opt, 'sign', [['out', 'すべて経費として（カード明細など）'], ['in', 'すべて収入として'], ['minus', 'マイナスを経費、プラスを収入']])),
          ] : [field('入金の列（→収入）', select(opt, 'inCol', colOpts)), field('出金の列（→経費）', select(opt, 'outCol', colOpts))],
        ),
        h('div', { class: 'row-end' },
          h('button', { onclick: () => dlg.close() }, 'キャンセル'),
          h('button', { class: 'primary', onclick: doImport }, '取り込む')),
      );
      body.querySelectorAll('select, input').forEach((x) => x.addEventListener('change', renderBody));
      showPreview();
    };
    const doImport = () => {
      const data = opt.header ? rows.slice(1) : rows;
      let skipped = 0;
      const add = [];
      for (const r of data) {
        const date = TX.normDate(r[Number(opt.date)]);
        if (!date) { skipped++; continue; }
        if (!date.startsWith(String(year))) { skipped++; continue; }
        const desc = opt.desc === '' ? '' : (r[Number(opt.desc)] || '').trim();
        let type;
        let amount;
        if (opt.mode === 'split') {
          const inv = opt.inCol === '' ? 0 : TX.num(r[Number(opt.inCol)]);
          const outv = opt.outCol === '' ? 0 : TX.num(r[Number(opt.outCol)]);
          if (inv > 0) { type = 'in'; amount = inv; } else if (outv > 0) { type = 'out'; amount = outv; } else { skipped++; continue; }
        } else {
          const v = opt.amount === '' ? 0 : TX.num(r[Number(opt.amount)]);
          if (!v) { skipped++; continue; }
          if (opt.sign === 'minus') { type = v < 0 ? 'out' : 'in'; amount = Math.abs(v); }
          else { type = opt.sign; amount = Math.abs(v); }
        }
        let cat = type === 'in' ? TX.INCOME_CATS[0] : '未分類';
        if (type === 'out') for (const [re, c] of TX.AUTO_RULES) if (re.test(desc)) { cat = c; break; }
        add.push({ id: TX.uid(), date, type, cat, desc, amount, ratio: 100, withheld: 0 });
      }
      d.ledger.push(...add);
      dlg.close();
      changed(true);
      toast(`${add.length} 件を取り込みました${skipped ? `（${year}年以外・金額なしの ${skipped} 行は除外）` : ''}`);
    };
    renderBody();
    dlg.replaceChildren(body);
    dlg.showModal();
  };

  // ════════ ③ 控除 ════════
  const MED_KINDS = ['診療・治療', '医薬品購入', '介護保険サービス', 'その他の医療費'];
  const editTable = (rows, cols, make, emptyMsg) =>
    rows.length
      ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c)), h('th'))),
        h('tbody', {}, rows.map((r) => h('tr', {}, make(r).map((x) => h('td', {}, x)),
          h('td', {}, h('button', { class: 'ghost small', title: '削除', onclick: () => { rows.splice(rows.indexOf(r), 1); changed(true); } }, '✕')))))))
      : h('p', { class: 'muted' }, emptyMsg);

  const viewDeduct = () => {
    const wrap = h('div', { class: 'stack' });

    // 医療費
    wrap.append(section('医療費控除',
      '本人と生計を一にする家族が、この年に支払った医療費の合計です。医療費通知（健康保険組合などから届くもの）の金額をまとめて1行で入力しても構いません。',
      editTable(d.medical, ['受けた人', '病院・薬局など', '区分', '支払った額', '保険などで補填された額'],
        (m) => [text(m, 'who', { placeholder: '本人' }), text(m, 'payee'), select(m, 'kind', MED_KINDS.map((k) => [k, k])), money(m, 'amount'), money(m, 'covered')],
        'まだ入力がありません。'),
      h('div', { class: 'row-end' }, h('button', { onclick: () => { d.medical.push({ id: TX.uid(), who: '', payee: '', kind: MED_KINDS[0], amount: '', covered: '' }); changed(true); } }, '＋ 医療費を追加')),
      h('h3', {}, 'セルフメディケーション税制（どちらか一方だけ選べる）'),
      h('div', { class: 'grid' },
        field('対象の市販薬（スイッチOTC）の購入額', money(d.selfmed, 'amount'), 'レシートに★や「控除対象」と印字されたもの'),
        h('div', { class: 'field' }, h('span', { class: 'f-label' }, '条件'), check(d.selfmed, 'checkup', '健康診断・予防接種・人間ドックなどを受けた')),
        field('適用する方', select(d, 'medMode', [['auto', '有利な方を自動で選ぶ'], ['normal', '通常の医療費控除'], ['self', 'セルフメディケーション税制']])),
      ),
      liveBox(() => {
        const m = R.medical;
        return h('div', { class: 'kpis' },
          kpi('通常の医療費控除', `${yen(m.normal)}`), kpi('セルフメディケーション', yen(m.self)),
          kpi('適用する控除額', `${yen(m.amount)}（${m.mode === 'self' ? 'セルフメディケーション' : '通常'}）`),
          h('p', { class: 'muted full' }, `通常：支払額 ${yen(m.paid)} − 補填 ${yen(m.covered)} − 足切り ${yen(m.threshold)}（10万円か総所得等の5%の少ない方）`));
      }),
    ));

    // 寄附金
    wrap.append(section('ふるさと納税・寄附金控除',
      '確定申告をする場合、ワンストップ特例は使えなくなります。この年に寄附したものは全部入力してください。',
      editTable(d.donations, ['寄附日', '寄附先（自治体など）', '金額', 'ワンストップ特例を申請'],
        (x) => [dateInput(x, 'date'), text(x, 'name', { placeholder: '例：〇〇県〇〇市' }), money(x, 'amount'), check(x, 'oneStop', '申請済み')],
        'まだ入力がありません。'),
      h('div', { class: 'row-end' }, h('button', { onclick: () => { d.donations.push({ id: TX.uid(), date: '', name: '', amount: '', oneStop: false }); changed(true); } }, '＋ 寄附を追加')),
      liveBox(() => {
        const lim = R.resident.furusatoLimit;
        return [
          h('div', { class: 'kpis' }, kpi('寄附の合計', yen(R.donationTotal)), kpi('寄附金控除（所得税）', yen(R.ded.donation)),
            kpi('自己負担2,000円で済む上限の目安', lim ? yen(lim) : '—')),
          lim && R.donationTotal > lim ? note(`寄附額が上限の目安を ${yen(R.donationTotal - lim)} 超えています。超えた分は自己負担になります。`, 'warn') : null,
        ];
      }),
    ));

    // 年末調整で出していない控除
    const ex = d.extra;
    wrap.append(section('年末調整に含まれていない控除',
      '源泉徴収票の金額に入っていない分だけを入力します（年末調整で出した分は二重に入れない）。',
      h('div', { class: 'grid' },
        field('社会保険料（自分で払った分）', money(ex, 'social'), '国民年金・国民健康保険・家族の国民年金を払った分など'),
        field('小規模企業共済等掛金（自分で払った分）', money(ex, 'smallBiz'), 'iDeCo を口座振替で個人払込している分など'),
        field('生命保険料控除（追加分の控除額）', money(ex, 'life'), '控除証明書から計算した「控除額」。源泉徴収票分との合計12万円まで'),
        field('地震保険料控除（追加分の控除額）', money(ex, 'quake'), '源泉徴収票分との合計5万円まで'),
      )));

    // 家族・本人
    const p = d.people;
    wrap.append(section('家族・本人の状況', '源泉徴収票の「控除対象扶養親族の数」「障害者の数」欄と同じ内容を入力します。',
      h('div', { class: 'grid' },
        Object.entries(TX.PERSONAL).map(([k, def]) => field(def.label, counter(p, k), `1人 ${comma(def.tax / 10000)}万円`)),
        field('特定親族特別控除の額', money(p, 'specificRelative'), '19〜22歳の子などで所得が扶養の範囲を超える場合（源泉徴収票に記載）'),
        field('寡婦・ひとり親', select(p, 'selfStatus', Object.entries(TX.SELF_STATUS).map(([k, v]) => [k, v.label]))),
        h('div', { class: 'field' }, h('span', { class: 'f-label' }, 'その他'),
          check(p, 'student', '本人が勤労学生'),
          check(p, 'adjustSalary', '給与850万円超で、23歳未満の扶養親族か特別障害者がいる（所得金額調整控除）')),
      )));

    wrap.append(section('予定納税・その他の源泉徴収', null, h('div', { class: 'grid' },
      field('予定納税額（第1期・第2期の合計）', money(ex, 'prepaid'), '税務署から通知が来て納めた人のみ'),
      field('その他の源泉徴収税額', money(ex, 'otherWithheld'), '帳簿に入れていない報酬などの源泉徴収'),
    )));
    return wrap;
  };

  // ════════ ④ 計算結果 ════════
  const line = (label, value, cls = '') => h('tr', { class: cls }, h('th', {}, label), h('td', { class: 'num' }, typeof value === 'number' ? yen(value) : value));
  const resultTables = () => {
    const D = R.ded;
    const s = R.side;
    return [
      section('申告が必要かどうか', null,
        R.filing.required
          ? note(h('div', {}, h('strong', {}, '確定申告が必要です。'), h('ul', {}, R.filing.reasons.map((x) => h('li', {}, x)))), 'must')
          : R.balance < 0
            ? note(h('div', {}, h('strong', {}, `確定申告は義務ではありませんが、申告すると ${yen(-R.balance)} 戻ってくる見込みです。`), h('p', {}, '還付申告は翌年1月1日から5年間できます。')), 'good')
            : note('この入力内容では確定申告は不要の見込みです（副業所得がある場合は住民税の申告を忘れずに）。'),
        R.warnings.map((w) => note(w, 'warn')),
      ),
      section('所得', null, h('table', { class: 'tbl calc-tbl' }, h('tbody', {},
        line('給与の収入金額', R.salary.revenue),
        line('給与所得控除', -R.salary.deduction),
        R.salary.adjust ? line('所得金額調整控除', -R.salary.adjust) : null,
        line('給与所得', R.salary.income, 'sub'),
        s.revenue || s.expenses ? [
          line(`副業の収入（${s.kind === 'business' ? '事業' : '雑・業務'}）`, s.revenue),
          line('必要経費', -s.expenses),
          s.blue ? line('青色申告特別控除', -s.blue) : null,
          line(s.kind === 'business' ? '事業所得' : '雑所得', s.income, 'sub'),
        ] : null,
        line('所得の合計（合計所得金額）', R.totalIncome, 'total'),
      ))),
      section('所得から差し引かれる金額（所得控除）', null, h('table', { class: 'tbl calc-tbl' }, h('tbody', {},
        line('社会保険料控除', D.social), line('小規模企業共済等掛金控除', D.smallBiz), line('生命保険料控除', D.life), line('地震保険料控除', D.quake),
        D.status ? line('寡婦・ひとり親控除', D.status) : null, D.student || D.disability ? line('勤労学生・障害者控除', D.student + D.disability) : null,
        D.spouse ? line('配偶者（特別）控除', D.spouse) : null, D.dependents ? line('扶養控除', D.dependents) : null,
        D.specificRelative ? line('特定親族特別控除', D.specificRelative) : null,
        line(`基礎控除（${R.rules.label}）`, D.basic),
        line('医療費控除', D.medical), line('寄附金控除', D.donation),
        line('所得控除の合計', D.total, 'total'),
      ))),
      section('税額', null, h('table', { class: 'tbl calc-tbl' }, h('tbody', {},
        line('課税される所得金額（千円未満切捨て）', R.taxable),
        line(`上の金額に対する税額（税率 ${Math.round(R.rate * 100)}%）`, R.taxOnTaxable),
        R.housing ? line('住宅借入金等特別控除', -R.housing) : null,
        line('差引所得税額（基準所得税額）', R.baseTax, 'sub'),
        line('復興特別所得税（2.1%）', R.reconstruction),
        line('所得税及び復興特別所得税の額', R.totalTax, 'sub'),
        line('源泉徴収税額（給与＋副業）', -R.withheld),
        R.prepaid ? line('予定納税額', -R.prepaid) : null,
        line(R.balance < 0 ? '還付される税金' : '納める税金', Math.abs(R.balance), `total ${R.balance < 0 ? 'refund' : 'pay'}`),
      ))),
      section('住民税の概算（翌年6月から）', '所得税とは別に市区町村が計算します。控除の一部を簡略化した目安です。', h('table', { class: 'tbl calc-tbl' }, h('tbody', {},
        line('課税所得（住民税）', R.resident.taxable),
        line('所得割（10%・調整控除後）', R.resident.base),
        R.resident.donationCredit ? line('寄附金税額控除（ふるさと納税）', -R.resident.donationCredit) : null,
        line('均等割（森林環境税含む・目安）', R.resident.perCapita),
        line('住民税（年額）', R.resident.total, 'total'),
      ))),
    ];
  };
  const viewResult = () => h('div', { class: 'stack' }, liveBox(resultTables, 'stack'), note(R.rules.note));

  // ════════ ⑤ 転記ガイド ════════
  const copyCell = (v) => h('button', {
    class: 'copy', title: 'クリックで数字をコピー',
    onclick: async () => { try { await navigator.clipboard.writeText(String(Math.round(Math.abs(v)))); toast(`${comma(Math.abs(v))} をコピーしました`); } catch (e) { toast('コピーできませんでした'); } },
  }, comma(v));
  const gRow = (group, label, v, from, cls = '') => h('tr', { class: cls }, h('td', { class: 'grp' }, group), h('th', {}, label), h('td', { class: 'num' }, copyCell(v)), h('td', { class: 'from' }, from));
  const guideTables = () => {
    const D = R.ded;
    const s = R.side;
    const biz = s.kind === 'business';
    const payers = {};
    for (const t of d.ledger) if (t.type === 'in' && TX.num(t.withheld) > 0) {
      const k = t.desc || '（取引先未入力）';
      payers[k] = payers[k] || { rev: 0, wh: 0 };
      payers[k].rev += TX.num(t.amount);
      payers[k].wh += TX.num(t.withheld);
    }
    return [
      note('申告書の欄の番号は年分の様式で変わるため、欄の名前で探してください。e-Tax（確定申告書等作成コーナー）では、下の「入力場所」の画面に同じ数字を入れると申告書が自動で作られます。'),
      section('申告書 第一表', null, h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl guide' },
        h('thead', {}, h('tr', {}, h('th', {}, '区分'), h('th', {}, '欄'), h('th', {}, '金額'), h('th', {}, '入力場所・根拠'))),
        h('tbody', {},
          gRow('収入金額等', '給与', R.salary.revenue, '作成コーナー「給与所得」→ 源泉徴収票の内容を勤務先ごとに入力'),
          s.revenue ? gRow('収入金額等', biz ? '事業（営業等）' : '雑（業務）', s.revenue, biz ? '「事業所得（営業等）」→ 決算書・収支内訳書を作成' : '「雑所得（業務）」→ 収入金額と必要経費を入力') : null,
          gRow('所得金額等', '給与', R.salary.income, '源泉徴収票から自動計算されます'),
          s.revenue || s.expenses ? gRow('所得金額等', biz ? '事業（営業等）' : '雑（業務）', biz ? s.income : s.profit, `収入 ${comma(s.revenue)} − 経費 ${comma(s.expenses)}${s.blue ? ` − 青色控除 ${comma(s.blue)}` : ''}`) : null,
          gRow('所得金額等', '合計', R.totalIncome, '', 'sub'),
          gRow('所得控除', '社会保険料控除', D.social, '源泉徴収票の社会保険料等（小規模共済分を除く）＋追加分'),
          D.smallBiz ? gRow('所得控除', '小規模企業共済等掛金控除', D.smallBiz, '源泉徴収票の内書き＋iDeCo 個人払込分') : null,
          D.life ? gRow('所得控除', '生命保険料控除', D.life, '源泉徴収票＋追加分') : null,
          D.quake ? gRow('所得控除', '地震保険料控除', D.quake, '源泉徴収票＋追加分') : null,
          D.status ? gRow('所得控除', '寡婦、ひとり親控除', D.status, '') : null,
          D.student || D.disability ? gRow('所得控除', '勤労学生、障害者控除', D.student + D.disability, '') : null,
          D.spouse ? gRow('所得控除', '配偶者（特別）控除', D.spouse, '源泉徴収票。作成コーナーでは配偶者の所得を入力すると計算されます') : null,
          D.dependents ? gRow('所得控除', '扶養控除', D.dependents, '扶養親族の氏名・マイナンバーを第二表に記入') : null,
          D.specificRelative ? gRow('所得控除', '特定親族特別控除', D.specificRelative, '') : null,
          gRow('所得控除', '基礎控除', D.basic, `${R.rules.label}・合計所得 ${comma(R.totalIncome)} 円で判定`),
          D.medical ? gRow('所得控除', '医療費控除', D.medical, R.medical.mode === 'self' ? '「セルフメディケーション税制の明細書」を作成（区分欄に記入）' : '「医療費控除の明細書」を作成（医療費通知の添付も可）') : null,
          D.donation ? gRow('所得控除', '寄附金控除', D.donation, '寄附ごとに入力（証明書の XML を読み込むと楽）') : null,
          gRow('所得控除', '合計', D.total, '', 'sub'),
          gRow('税金の計算', '課税される所得金額', R.taxable, '千円未満切捨て'),
          gRow('税金の計算', '上の金額に対する税額', R.taxOnTaxable, `税率 ${Math.round(R.rate * 100)}%`),
          R.housing ? gRow('税金の計算', '住宅借入金等特別控除', R.housing, '源泉徴収票の住宅借入金等特別控除の額（2年目以降）') : null,
          gRow('税金の計算', '差引所得税額（基準所得税額）', R.baseTax, ''),
          gRow('税金の計算', '復興特別所得税額', R.reconstruction, '基準所得税額 × 2.1%'),
          gRow('税金の計算', '所得税及び復興特別所得税の額', R.totalTax, ''),
          gRow('税金の計算', '源泉徴収税額', R.withheld, `給与 ${comma(R.salary.withheld)}${s.withheld ? ` ＋ 副業 ${comma(s.withheld)}` : ''}`),
          R.prepaid ? gRow('税金の計算', '予定納税額', R.prepaid, '') : null,
          gRow('税金の計算', R.balance < 0 ? '還付される税金' : '第3期分の税額（納める税金）', Math.abs(R.balance), R.balance < 0 ? '還付金の受取口座を第一表に記入' : `納付期限 ${R.rules.deadline.replace(/-/g, '/')}（振替納税なら4月下旬）`, 'total'),
        )))),
      section('申告書 第二表「所得の内訳」', '源泉徴収された所得を支払者ごとに書きます。', h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl guide' },
        h('thead', {}, h('tr', {}, h('th', {}, '所得の種類'), h('th', {}, '支払者'), h('th', {}, '収入金額'), h('th', {}, '源泉徴収税額'))),
        h('tbody', {},
          d.slips.filter((x) => TX.num(x.pay)).map((x) => h('tr', {}, h('td', {}, '給与'), h('td', {}, x.name || '（勤務先）'), h('td', { class: 'num' }, copyCell(TX.num(x.pay))), h('td', { class: 'num' }, copyCell(TX.num(x.withheld))))),
          Object.entries(payers).map(([k, v]) => h('tr', {}, h('td', {}, biz ? '事業' : '雑（業務）'), h('td', {}, k), h('td', { class: 'num' }, copyCell(v.rev)), h('td', { class: 'num' }, copyCell(v.wh)))),
        )))),
      s.revenue || s.expenses ? section(biz ? '収支内訳書／青色申告決算書（経費の内訳）' : '雑所得（業務）の経費の内訳', null, h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl guide' }, h('tbody', {},
        Object.entries(s.income).map(([k, v]) => gRow('収入', k, v, '')),
        TX.EXPENSE_CATS.filter((c) => s.expense[c]).map((c) => gRow('経費', c, s.expense[c], c === '未分類' ? '科目を選び直してください' : '')),
        gRow('', '差引金額', s.profit, '', 'total'),
      )))) : null,
      section('確定申告書等作成コーナーでの手順', null, h('ol', { class: 'steps' },
        h('li', {}, '国税庁「確定申告書等作成コーナー」を開き「作成開始」→ e-Tax（マイナンバーカード方式）を選ぶ。スマホならマイナンバーカードを読み取るだけで送信まで完結。'),
        h('li', {}, `「所得税」→ ${R.rules.label}を選び、「給与・年金の方」を選択。`),
        h('li', {}, '給与所得：源泉徴収票を勤務先ごとに入力（マイナポータル連携で自動入力も可）。'),
        s.revenue ? h('li', {}, biz ? '事業所得：先に「決算書・収支内訳書」を作成してから申告書へ。' : '雑所得（業務）：「業務に係る雑所得」に、支払者ごとの収入金額・源泉徴収税額と必要経費を入力。') : null,
        D.medical ? h('li', {}, R.medical.mode === 'self' ? '所得控除 → 医療費控除 → セルフメディケーション税制を選び、明細を入力。' : '所得控除 → 医療費控除 → 医療費通知の金額か、明細を集計フォーム（Excel）で入力。') : null,
        D.donation ? h('li', {}, '所得控除 → 寄附金控除：寄附ごとに入力（ふるさと納税サイトの XML データを読み込むと自動入力）。') : null,
        h('li', {}, 'このページの金額と、作成コーナーの計算結果（還付金額／納付額）が一致するか確認。'),
        h('li', {}, R.balance < 0 ? '還付金の受取口座を入力して送信。数週間で振り込まれます（e-Tax なら早め）。' : '送信後、納付方法（振替納税・ダイレクト納付・クレジットカード・スマホ決済・コンビニ）を選んで期限までに納付。'),
      )),
    ];
  };
  const viewGuide = () => h('div', { class: 'stack' }, liveBox(guideTables, 'stack'));

  // ════════ ⑥ 書類チェック ════════
  const docItems = () => {
    const s = R.side;
    const ex = d.extra;
    const items = [
      ['mynumber', '必ず', 'マイナンバーカード（e-Tax 送信・スマホ申告に使用。暗証番号も確認）', '書面提出なら番号確認書類＋本人確認書類の写し'],
      ['slips', '必ず', `給与所得の源泉徴収票（${d.slips.filter((x) => TX.num(x.pay)).length || 1}枚・勤務先ごと）`, '提出は不要。転職した人は前職分も'],
    ];
    if (R.balance < 0) items.push(['bank', '還付', '還付金を受け取る本人名義の口座（銀行・支店・口座番号）', '公金受取口座を登録済みならそれも選べる']);
    if (s.revenue || s.expenses) {
      items.push(['sidepay', '副業', '副業の収入が分かる書類（支払明細・支払調書・入金記録）', '提出不要。源泉徴収額の確認に使う']);
      items.push(['receipts', '副業', '経費の領収書・レシート・クレジット明細', '提出不要。5年間保存（青色は7年）']);
      items.push(['book', '副業', '帳簿（このツールの CSV 書き出しで保存）', s.kind === 'business' ? '事業所得は記帳・保存が義務' : '前々年の業務収入300万円超なら書類の保存が義務']);
      if (s.kind === 'business') items.push(['kessan', '副業', d.side.blue ? '青色申告決算書（作成コーナーで作成）' : '収支内訳書（作成コーナーで作成）', d.side.blue >= 650000 ? '65万円控除は e-Tax で提出すること' : '']);
    }
    if (R.medical.mode === 'normal' && R.medical.paid) {
      items.push(['medrec', '医療費', '医療費の領収書', '提出不要。5年間保存（税務署から求められることがある）']);
      items.push(['mednotice', '医療費', '医療費通知（健康保険組合・協会けんぽ・市区町村から届く）', 'あれば明細の入力を省略できる']);
      if (R.medical.covered) items.push(['medcover', '医療費', '保険金・高額療養費などの補填額が分かる書類', '']);
    }
    if (R.medical.mode === 'self' && R.medical.smPaid) {
      items.push(['otc', '医療費', '対象医薬品のレシート', '提出不要・5年保存']);
      items.push(['checkup', '医療費', '健康診断・予防接種などを受けたことが分かる書類（結果通知・領収書）', '提出不要・保存']);
    }
    if (d.donations.length) items.push(['donation', '寄附金', `寄附金受領証明書 ${d.donations.length}件（またはふるさと納税サイトの「寄附金控除に関する証明書」XML）`, 'e-Tax なら提出省略可（5年保存）']);
    if (TX.num(ex.social)) items.push(['nenkin', '控除', '社会保険料控除証明書（国民年金など）', '国民健康保険は領収書や納付額の通知で金額を確認']);
    if (TX.num(ex.smallBiz)) items.push(['ideco', '控除', '小規模企業共済等掛金払込証明書（iDeCo）', '']);
    if (TX.num(ex.life)) items.push(['lifecert', '控除', '生命保険料控除証明書', '']);
    if (TX.num(ex.quake)) items.push(['quakecert', '控除', '地震保険料控除証明書', '']);
    if (TX.num(ex.prepaid)) items.push(['prepaid', '税額', '予定納税額の通知書・納付記録', '']);
    return items;
  };
  const viewDocs = () => {
    const wrap = h('div', { class: 'stack' });
    wrap.append(section('集める書類', '入力内容から必要なものを出しています。チェックはこのブラウザに保存されます。', liveBox(() => {
      const items = docItems();
      const done = items.filter(([id]) => d.checks[id]).length;
      return [
        h('div', { class: 'progress' }, h('div', { class: 'bar', style: `width:${items.length ? (done / items.length) * 100 : 0}%` }), h('span', {}, `${done} / ${items.length}`)),
        h('ul', { class: 'checklist' }, items.map(([id, tag, label, sub]) => {
          const cb = h('input', { type: 'checkbox', checked: !!d.checks[id], onchange: (e) => { d.checks[id] = e.target.checked; changed(); } });
          return h('li', { class: d.checks[id] ? 'done' : '' }, h('label', {}, cb, h('span', { class: 'tag' }, tag), h('span', { class: 'lbl' }, label, sub ? h('small', {}, sub) : null)));
        })),
      ];
    })));
    wrap.append(section('スケジュール', null, h('table', { class: 'tbl calc-tbl' }, h('tbody', {},
      line('申告期間', R.rules.filing),
      line('還付申告', `${year + 1}年1月1日から5年間いつでも（混雑前の1〜2月がおすすめ）`),
      line('納付期限', `${R.rules.deadline.replace(/-/g, '/')}（振替納税は4月下旬に引き落とし）`),
      line('住民税', '確定申告をすれば住民税の申告は不要。6月ごろ通知が届く'),
      line('副業分の住民税', '確定申告書第二表「住民税・事業税に関する事項」で「自分で納付（普通徴収）」を選ぶと、副業分を勤務先の給与天引きと分けられる（給与・公的年金以外の所得のみ）'),
    ))));
    return wrap;
  };

  // ── 印刷 ──
  const buildPrint = () => {
    let p = document.getElementById('print-area');
    if (!p) document.body.append((p = h('div', { id: 'print-area' })));
    live = [];
    p.replaceChildren(h('h1', {}, `確定申告メモ（${R.rules.label}）`), ...resultTables(), ...guideTables());
    renderTab();
  };
  window.addEventListener('beforeprint', buildPrint);

  // ── ヘッダー ──
  const yearSel = document.getElementById('year');
  yearSel.replaceChildren(...Object.entries(TX.RULES).map(([y, r]) => h('option', { value: y, selected: Number(y) === year }, `${r.label}（${y}年）`)));
  yearSel.addEventListener('change', () => {
    year = state.year = Number(yearSel.value);
    d = TX.yearData(state, year);
    ledgerFilter = { month: '', cat: '', type: '' };
    changed(true);
    toast(`${TX.RULES[year].label}に切り替えました`);
  });
  document.getElementById('btn-print').addEventListener('click', () => { buildPrint(); window.print(); });
  document.getElementById('btn-backup').addEventListener('click', () => {
    TX.download(`確定申告ナビ_バックアップ_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2));
  });
  const restoreInput = document.getElementById('restore-input');
  document.getElementById('btn-restore').addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', async () => {
    const f = restoreInput.files[0];
    restoreInput.value = '';
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (!obj || !obj.years) throw new Error('形式が違います');
      if (!confirm('現在の入力内容をバックアップの内容で置き換えます。よろしいですか？')) return;
      for (const k of Object.keys(state)) delete state[k];
      Object.assign(state, obj);
      year = TX.RULES[state.year] ? Number(state.year) : TX.DEFAULT_YEAR;
      state.year = year;
      d = TX.yearData(state, year);
      yearSel.value = String(year);
      changed(true);
      toast('復元しました');
    } catch (e) {
      toast(`読み込めませんでした：${e.message}`);
    }
  });

  renderSummary();
  renderTabs();
  renderTab();
})();
