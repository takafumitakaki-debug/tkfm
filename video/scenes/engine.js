// 手書き風アニメーションの共通処理。
// 各シーンは <svg id="stage"> を置き、window.SCENE = { duration, view: { h, v }, update(t) } を定義する。
// render.mjs が window.renderAt(t) を1コマずつ呼んで撮影する。
//
// 要素に付けられる属性(秒で指定):
//   data-draw="開始 長さ"  … 線がペンで描かれるように現れる(path に pathLength="1" を付ける)
//   data-fade="開始 長さ"  … ふわっと現れる
//   data-out="開始 長さ"   … ふわっと消える

const clamp = (x) => Math.min(1, Math.max(0, x));
export const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
export const easeIn = (x) => x * x * x;
export const progress = (t, start, dur) => clamp((t - start) / dur);

const aspect = new URLSearchParams(location.search).get('aspect') === 'v' ? 'v' : 'h';
document.documentElement.dataset.aspect = aspect;

// 全シーン共通の質感(紙・鉛筆の線・水彩のにじみ)
const DEFS = `
<defs>
  <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="1" data-boil="0" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="3" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.35" result="g"/>
    <feComposite in="d" in2="g" operator="in"/>
  </filter>
  <filter id="wash" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" seed="2" data-boil="10" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="0.8" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="3" seed="7" result="blot"/>
    <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0.62" result="ba"/>
    <feComposite in="b" in2="ba" operator="in"/>
  </filter>
  <filter id="wash-solid" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="4" data-boil="20" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="paper" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.24  0 0 0 0.22 0"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
</defs>`;
document.getElementById('stage').insertAdjacentHTML('afterbegin', DEFS);

function span(el, name) {
  const [start, dur] = el.dataset[name].split(/\s+/).map(Number);
  return [start, dur];
}

window.renderAt = async (t) => {
  const scene = window.SCENE;
  const svg = document.getElementById('stage');
  svg.setAttribute('viewBox', scene.view[aspect].join(' '));

  for (const el of svg.querySelectorAll('[data-draw]')) {
    const p = ease(progress(t, ...span(el, 'draw')));
    // 描き終わった線は破線指定を外す(残すと Chromium で線が消えることがある)
    el.style.strokeDasharray = p >= 1 ? '' : '1 1';
    el.style.strokeDashoffset = p >= 1 ? '' : String(1 - p);
    el.style.visibility = p > 0 ? 'visible' : 'hidden';
  }
  for (const el of svg.querySelectorAll('[data-fade], [data-out]')) {
    let o = el.dataset.fade ? ease(progress(t, ...span(el, 'fade'))) : 1;
    if (el.dataset.out) o *= 1 - ease(progress(t, ...span(el, 'out')));
    // 図形は fill-opacity でフェードする。style.opacity と水彩・鉛筆のフィルターが
    // 重なると、Chromium で手前の線が消えるため。グループや文字だけ opacity を使う
    const base = Number(el.getAttribute('opacity') ?? 1);
    if (el.tagName === 'g' || el.tagName === 'text') el.style.opacity = o >= 1 ? '' : String(o * base);
    else el.style.fillOpacity = o >= 1 ? '' : String(o);
  }

  // 線の「ゆらぎ」:1秒に8回だけ形を変える(手描きアニメのコマ打ち風)
  const seed = Math.floor(t * 8) % 5;
  for (const turb of svg.querySelectorAll('feTurbulence[data-boil]')) {
    turb.setAttribute('seed', String(seed + Number(turb.dataset.boil)));
  }

  scene.update?.(t, aspect);
  await document.fonts.ready;
};
