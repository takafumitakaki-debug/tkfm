/* 入力データの保存（ブラウザ内 localStorage）と JSON バックアップ */
(() => {
  const TX = (window.TX = window.TX || {});
  const KEY = 'tkfm-tax-return-v1';

  TX.uid = () => Math.random().toString(36).slice(2, 10);

  TX.emptyYear = () => ({
    slips: [{ id: TX.uid(), name: '本業', pay: '', withheld: '', social: '', smallBiz: '', life: '', quake: '', spouse: '', housing: '', nencho: true }],
    side: { kind: 'misc', blue: 0, name: '' },
    ledger: [],
    medical: [],
    selfmed: { amount: '', checkup: false },
    medMode: 'auto',
    donations: [],
    extra: { social: '', smallBiz: '', life: '', quake: '', prepaid: '', otherWithheld: '' },
    people: {
      dependentGeneral: 0, dependentSpecific: 0, dependentElder: 0, dependentElderLiving: 0,
      disabled: 0, disabledSpecial: 0, disabledSpecialLiving: 0,
      specificRelative: '', selfStatus: 'none', student: false, adjustSalary: false,
    },
    checks: {},
  });

  TX.load = () => {
    let s = null;
    try {
      s = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (e) {
      s = null;
    }
    if (!s || typeof s !== 'object' || !s.years) s = { version: 1, year: TX.DEFAULT_YEAR, years: {}, tab: 'salary' };
    if (!TX.RULES[s.year]) s.year = TX.DEFAULT_YEAR;
    return s;
  };

  TX.save = (state) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  };

  /** 年分データを取得（足りない項目は既定値で補う） */
  TX.yearData = (state, year) => {
    const def = TX.emptyYear();
    const d = (state.years[year] = state.years[year] || def);
    for (const k of Object.keys(def)) {
      if (d[k] == null) d[k] = def[k];
      else if (!Array.isArray(def[k]) && typeof def[k] === 'object') d[k] = { ...def[k], ...d[k] };
    }
    return d;
  };

  TX.download = (filename, text, type = 'application/json') => {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  };

  /** CSV パーサ（ダブルクォート・改行入りセル対応） */
  TX.parseCSV = (text) => {
    text = text.replace(/^﻿/, '');
    const delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  };

  TX.toCSV = (rows) =>
    '﻿' + rows.map((r) => r.map((c) => {
      const s = String(c ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\r\n');

  /** 日付文字列を YYYY-MM-DD に正規化（2026/4/1, 2026年4月1日, 20260401 など） */
  TX.normDate = (s) => {
    s = String(s || '').trim();
    let m = s.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
    if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return '';
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  };

  /** ファイルを文字コード自動判定で読む（UTF-8 で読めなければ Shift_JIS） */
  TX.readText = async (file) => {
    const buf = await file.arrayBuffer();
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      return new TextDecoder('shift_jis').decode(buf);
    }
  };
})();
