/* Site Analyzer 計測タグ（GA4不要・Cookie不使用）: クリック位置とスクロール深度のみ送信 */
(function () {
  if (navigator.doNotTrack === '1' || window.__saTracker) return;
  window.__saTracker = 1;
  var EP = '__ENDPOINT__';
  var sid;
  try { sid = sessionStorage.getItem('__sa') || Math.random().toString(36).slice(2, 12); sessionStorage.setItem('__sa', sid); } catch (e) { sid = Math.random().toString(36).slice(2, 12); }
  var q = [];
  var maxY = 0;
  function sel(el) {
    var s = [];
    for (var i = 0; el && el.nodeType === 1 && i < 4; i++, el = el.parentElement) s.unshift(el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''));
    return s.join('>');
  }
  document.addEventListener('click', function (e) {
    var w = Math.max(document.documentElement.scrollWidth, 1);
    q.push({ t: 'c', xr: +(e.pageX / w).toFixed(4), y: Math.round(e.pageY), sel: sel(e.target) });
    if (q.length >= 20) flush();
  }, true);
  addEventListener('scroll', function () { maxY = Math.max(maxY, scrollY + innerHeight); }, { passive: true });
  maxY = innerHeight;
  function flush() {
    var ev = q.splice(0, q.length);
    ev.push({ t: 's', maxY: Math.round(maxY) });
    var body = JSON.stringify({ u: location.href.split('#')[0], s: sid, vw: innerWidth, e: ev });
    if (navigator.sendBeacon) navigator.sendBeacon(EP, new Blob([body], { type: 'text/plain' }));
    else fetch(EP, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' });
  }
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
})();
