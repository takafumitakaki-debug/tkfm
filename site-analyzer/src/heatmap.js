// 予測ヒートマップ（GA4・計測タグ不要）
// 実ブラウザでページを描画し、要素の種類・サイズ・コントラスト・位置（F型視線・スクロール到達率）から
// 「注視（アテンション）」「クリック」「スクロール到達」を推定する。
// ※ 実測データではなく視線研究の一般則に基づく予測モデル。実測は tracker.js（自前計測）で補完する。
import fs from 'node:fs';
import path from 'node:path';

const CTA_RE = /(お問い?合わせ|問合せ|資料請求|ダウンロード|申し?込|予約|購入|カート|無料|相談|見積|登録|応募|エントリー|体験|試す|始める|contact|inquiry|buy|order|book|sign ?up|get started|try|download|apply|subscribe|request)/i;

export async function loadBrowser() {
  let pw;
  try {
    pw = await import('playwright');
  } catch {
    return null;
  }
  const candidates = [undefined, process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'].filter((x, i) => i === 0 || (x && fs.existsSync(x)));
  for (const executablePath of candidates) {
    try {
      return await pw.chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
    } catch { /* 次の候補 */ }
  }
  return null;
}

/** ページ内で実行：要素の幾何情報と注目度を推定 */
function collectInPage(ctaSource) {
  const CTA = new RegExp(ctaSource, 'i');
  const vw = window.innerWidth;
  const fold = window.innerHeight;
  const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const lum = (rgb) => {
    const m = (rgb || '').match(/\d+(\.\d+)?/g);
    if (!m) return 1;
    const [r, g, b] = m.slice(0, 3).map((v) => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
    }
    return 'rgb(255,255,255)';
  };
  const reach = (y) => (y <= fold ? 1 : Math.exp((-0.35 * (y - fold)) / fold));
  const items = [];
  const sel = 'h1,h2,h3,h4,p,li,a,button,[role=button],input,select,textarea,img,video,picture,svg,figure,label,td,th,dt,dd,span,strong,b';
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) continue;
    const tag = el.tagName.toLowerCase();
    if ((tag === 'span' || tag === 'strong' || tag === 'b') && (el.children.length || (el.textContent || '').trim().length < 2)) continue;
    const x = r.left + window.scrollX;
    const y = r.top + window.scrollY;
    const text = (el.innerText || el.getAttribute('alt') || el.getAttribute('aria-label') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const fs = parseFloat(st.fontSize) || 16;
    const bold = +st.fontWeight >= 600;
    const contrast = (() => { const a = lum(st.color); const b = lum(bgOf(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); })();
    const ownBg = st.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(st.backgroundColor);
    const clickable = tag === 'a' || tag === 'button' || el.getAttribute('role') === 'button' || tag === 'input' || tag === 'select' || st.cursor === 'pointer';
    const buttonLike = clickable && (tag === 'button' || ownBg || st.borderStyle !== 'none' && parseFloat(st.borderWidth) > 0 && r.height >= 28);
    const isCta = clickable && CTA.test(text);
    const inNav = !!el.closest('nav,header,footer');
    let base = { h1: 1, h2: 0.7, h3: 0.5, h4: 0.4, img: 0.55, video: 0.8, picture: 0.55, svg: 0.2, figure: 0.4, button: 0.85, input: 0.6, select: 0.5, textarea: 0.5, a: 0.35, p: 0.28, li: 0.25, td: 0.2, th: 0.25, dt: 0.3, dd: 0.2, label: 0.25, span: 0.22, strong: 0.35, b: 0.35 }[tag] ?? 0.2;
    if (buttonLike) base = Math.max(base, 0.8);
    if (isCta) base += 0.35;
    if (inNav) base *= 0.6;
    const area = r.width * Math.min(r.height, fold);
    const sizeF = Math.min(1.6, Math.sqrt(area) / Math.sqrt(vw * fold) * 3 + 0.3);
    const textF = /^(h\d|p|li|a|button|span|strong|b|label|td|th|dt|dd)$/.test(tag) ? Math.min(1.8, (fs / 16) * (bold ? 1.15 : 1)) * Math.min(1.2, 0.55 + contrast / 12) : 1;
    const fPattern = 1 - 0.35 * Math.min(1, (x + r.width / 2) / vw);
    const w = base * sizeF * textF * fPattern * reach(y + Math.min(r.height, fold) / 2);
    items.push({ tag, text, x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height), attention: +w.toFixed(4), clickable, isCta, buttonLike, inNav, fontSize: fs, contrast: +contrast.toFixed(1) });
  }
  // 大きい親要素と子要素の二重カウントを緩和：上位のみ残す
  items.sort((a, b) => b.attention - a.attention);
  const top = items.slice(0, 400);
  const maxA = top[0]?.attention || 1;
  for (const it of top) it.attention = +(it.attention / maxA).toFixed(3);

  const sections = [...document.querySelectorAll('h1,h2')].map((h) => {
    const y = h.getBoundingClientRect().top + window.scrollY;
    return { level: +h.tagName[1], text: (h.innerText || '').trim().slice(0, 60), y: Math.round(y), reach: Math.round(reach(y) * 100) };
  });
  const smallTaps = [...document.querySelectorAll('a,button,input,select')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 32 || r.height < 32) && !el.closest('p,li,td'); }).length;
  const smallFonts = [...document.querySelectorAll('p,li,a,span,td')].filter((el) => el.innerText && el.innerText.trim().length > 5 && parseFloat(getComputedStyle(el).fontSize) < 12).length;
  const overflowX = document.documentElement.scrollWidth > vw + 2;
  return { vw, fold, docH, items: top, sections, smallTaps, smallFonts, overflowX };
}

export async function captureHeatmap(browser, url, outDir, { device = 'desktop', maxHeight = 7000 } = {}) {
  const vp = device === 'mobile' ? { width: 390, height: 844 } : { width: 1366, height: 768 };
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: device === 'mobile', hasTouch: device === 'mobile', locale: 'ja-JP',
    userAgent: device === 'mobile' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 SiteAnalyzer' : undefined });
  const page = await ctx.newPage();
  try {
    await page.addInitScript(() => {
      window.__cwv = { lcp: 0, cls: 0 };
      try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cwv.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cwv.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      } catch { /* 非対応 */ }
    });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const loadMs = Date.now() - t0;
    // 遅延読み込みを発火させるため一度スクロール
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < Math.min(document.body.scrollHeight, 12000); y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 300));
    });
    const data = await page.evaluate(collectInPage, CTA_RE.source);
    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource');
      return { lcp: Math.round(window.__cwv?.lcp || 0), cls: +(window.__cwv?.cls || 0).toFixed(3), ttfb: Math.round(nav?.responseStart || 0), domContentLoaded: Math.round(nav?.domContentLoadedEventEnd || 0), requests: res.length + 1, transferKB: Math.round((res.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav?.transferSize || 0)) / 1024) };
    });
    const height = Math.min(data.docH, maxHeight);
    const file = `${device}-${Buffer.from(url).toString('base64url').slice(-40)}.jpg`;
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, file), type: 'jpeg', quality: 62, fullPage: true, clip: { x: 0, y: 0, width: vp.width, height } });
    return { url, device, screenshot: file, width: vp.width, height, fullHeight: data.docH, fold: data.fold, loadMs, perf, ...data, insights: insights(data, perf, device) };
  } finally {
    await ctx.close();
  }
}

function insights(d, perf, device) {
  const out = [];
  const fold = d.fold;
  const ctas = d.items.filter((i) => i.isCta && !i.inNav);
  const ctaAbove = ctas.filter((i) => i.y < fold);
  if (!ctas.length) out.push({ level: 'warning', text: 'コンバージョン導線（お問い合わせ・資料請求・予約など）のボタンが本文中に見つかりません。', how: 'ページの目的に合ったCTAボタンを、ファーストビュー・本文の区切り・ページ末尾の3か所に設置してください。' });
  else if (!ctaAbove.length) out.push({ level: 'warning', text: `ファーストビューにCTAがありません（最初のCTAは ${(ctas.sort((a, b) => a.y - b.y)[0].y / fold).toFixed(1)} 画面目、予測到達率 ${Math.round(Math.exp(-0.35 * (ctas[0].y - fold) / fold) * 100)}%）。`, how: 'メインビジュアル内か直下に、背景色付きのコントラストの高いCTAボタンを配置してください。' });
  else out.push({ level: 'ok', text: `ファーストビューにCTAがあります（「${ctaAbove[0].text}」）。` });
  const h1 = d.items.find((i) => i.tag === 'h1');
  if (!h1) out.push({ level: 'warning', text: '描画後のh1が見つかりません（画像のみ・非表示の可能性）。', how: 'ページの主題をテキストのh1でファーストビューに表示してください。' });
  else if (h1.y > fold) out.push({ level: 'warning', text: 'h1（ページの主題）がファーストビュー外にあります。', how: '訪問者が3秒で「何のページか」分かるよう、h1をファーストビュー内に配置してください。' });
  const bigImgAbove = d.items.filter((i) => (i.tag === 'img' || i.tag === 'picture' || i.tag === 'video') && i.y < fold).reduce((s, i) => s + Math.min(i.h, fold - i.y) * i.w, 0) / (d.vw * fold);
  const textAbove = d.items.filter((i) => /^(h1|h2|p)$/.test(i.tag) && i.y < fold).length;
  if (bigImgAbove > 0.6 && textAbove < 2) out.push({ level: 'notice', text: `ファーストビューの約${Math.round(bigImgAbove * 100)}%が画像で、テキスト情報が少なめです。`, how: '画像にキャッチコピー（価値提案）と補足1文、CTAを重ねると離脱を抑えられます。' });
  const screens = d.docH / fold;
  if (screens > 8) out.push({ level: 'notice', text: `ページが長い（約${screens.toFixed(1)}画面分）。後半の到達率は${Math.round(Math.exp(-0.35 * (screens - 1)) * 100)}%程度と予測されます。`, how: '重要情報・CTAは前半に。後半には目次（ページ内リンク）や途中CTAを置いてください。' });
  const lowSections = d.sections.filter((s) => s.level === 2 && s.reach < 35);
  if (lowSections.length) out.push({ level: 'notice', text: `予測到達率35%未満のセクション：${lowSections.slice(0, 5).map((s) => `「${s.text}」(${s.reach}%)`).join('、')}`, how: '重要度の高いセクションなら上に移動するか、冒頭に目次リンクを設けてください。' });
  const lowContrast = d.items.filter((i) => /^(p|li|a|span)$/.test(i.tag) && i.contrast < 4.5 && i.text.length > 5).length;
  if (lowContrast > 5) out.push({ level: 'notice', text: `文字と背景のコントラストが不足している要素が ${lowContrast} 個あります（WCAG基準4.5:1未満）。`, how: '本文色を濃くする（例：#333以上）か背景を明るくしてください。' });
  if (device === 'mobile') {
    if (d.overflowX) out.push({ level: 'warning', text: 'スマホで横スクロールが発生しています。', how: '幅固定の要素（表・画像・iframe）に max-width:100% や overflow-x:auto を設定してください。' });
    if (d.smallTaps > 5) out.push({ level: 'notice', text: `タップしにくい小さなリンク/ボタンが ${d.smallTaps} 個あります（32px未満）。`, how: 'タップ領域は44×44px以上を目安に、paddingで広げてください。' });
    if (d.smallFonts > 5) out.push({ level: 'notice', text: `12px未満の小さい文字が ${d.smallFonts} 箇所あります。`, how: 'スマホ本文は16px前後を推奨します。' });
  }
  if (perf.lcp > 4000) out.push({ level: 'warning', text: `LCP（最大コンテンツの表示）が ${(perf.lcp / 1000).toFixed(1)}秒 と遅いです（良好は2.5秒以下）。`, how: 'メイン画像をWebP/AVIF化・サイズ最適化し、fetchpriority="high" とプリロードを設定、レンダリングを妨げるCSS/JSを削減してください。' });
  else if (perf.lcp > 2500) out.push({ level: 'notice', text: `LCPが ${(perf.lcp / 1000).toFixed(1)}秒 です（良好は2.5秒以下）。`, how: 'ファーストビュー画像の軽量化・プリロードを行ってください。' });
  if (perf.cls > 0.1) out.push({ level: 'warning', text: `CLS（レイアウトのずれ）が ${perf.cls} です（良好は0.1以下）。`, how: '画像・広告・埋め込みにサイズを指定し、後から挿入される要素の領域を確保してください。' });
  if (perf.transferKB > 3000) out.push({ level: 'notice', text: `ページ総転送量が ${(perf.transferKB / 1024).toFixed(1)}MB と大きいです。`, how: '画像圧縮・不要スクリプト削除・遅延読み込みで2MB以下を目指してください。' });
  return out;
}

export async function runHeatmaps(urls, outDir, { onProgress = () => {} } = {}) {
  const browser = await loadBrowser();
  if (!browser) return { available: false, reason: 'Playwright/Chromium が利用できないため、ヒートマップはスキップしました（npm i playwright && npx playwright install chromium で有効化）。', results: [] };
  const results = [];
  try {
    let n = 0;
    for (const url of urls) {
      for (const device of ['desktop', 'mobile']) {
        onProgress({ phase: 'heatmap', message: `ヒートマップ生成中 (${++n}/${urls.length * 2}) ${device}` });
        try {
          results.push(await captureHeatmap(browser, url, outDir, { device }));
        } catch (e) {
          results.push({ url, device, error: e.message.split('\n')[0] });
        }
      }
    }
  } finally {
    await browser.close();
  }
  return { available: true, results };
}
