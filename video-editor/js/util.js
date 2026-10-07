/* 共通ユーティリティ */
(() => {
  const VE = (window.VE = window.VE || {});

  VE.uid = () => Math.random().toString(36).slice(2, 10);
  VE.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  VE.round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

  VE.fmtTime = (t, frac = true) => {
    t = Math.max(0, t || 0);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const cs = Math.floor((t % 1) * 100);
    const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return frac ? `${base}.${String(cs).padStart(2, '0')}` : base;
  };

  /** 簡易 DOM ビルダー */
  VE.h = (tag, props = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : String(c));
    }
    return el;
  };

  /** イベントバス */
  VE.bus = {
    map: {},
    on(evt, fn) { (this.map[evt] ||= []).push(fn); },
    emit(evt, ...args) { (this.map[evt] || []).forEach((fn) => fn(...args)); },
  };

  let toastTimer = null;
  VE.toast = (msg, ms = 2600) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  };

  VE.download = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = VE.h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  VE.isTyping = (e) => {
    const t = e.target;
    if (!t) return false;
    if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return true;
    if (t.tagName === 'INPUT') return !['checkbox', 'range', 'button', 'color'].includes(t.type);
    return false;
  };

  VE.hexToRgba = (hex, a = 1) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  /** フェード係数 (0〜1) */
  VE.fade = (local, dur, fin, fout) => {
    let a = 1;
    if (fin > 0 && local < fin) a = Math.min(a, local / fin);
    if (fout > 0 && local > dur - fout) a = Math.min(a, (dur - local) / fout);
    return VE.clamp(a, 0, 1);
  };

  VE.once = (target, evt, timeout = 8000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => { cleanup(); reject(new Error(`timeout: ${evt}`)); }, timeout);
      const ok = () => { cleanup(); resolve(); };
      const ng = () => { cleanup(); reject(new Error(`error waiting ${evt}`)); };
      const cleanup = () => {
        clearTimeout(t);
        target.removeEventListener(evt, ok);
        target.removeEventListener('error', ng);
      };
      target.addEventListener(evt, ok);
      target.addEventListener('error', ng);
    });
})();
