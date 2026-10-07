/* Site Analyzer レポート UI（依存ライブラリなし） */
(function () {
  'use strict';
  const D = JSON.parse(document.getElementById('data').textContent);
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const app = $('#app');
  const pages = D.crawl.pages;
  const htmlPages = pages.filter((p) => p.title !== undefined && !p.isRedirect);
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const aioBy = new Map(D.aio.pages.map((p) => [p.url, p]));
  const sevLabel = { error: 'エラー', warning: '警告', notice: '注意' };
  const shortUrl = (u) => { try { const x = new URL(u); return (x.pathname + x.search) || '/'; } catch { return u; } };
  const width = (t) => { let w = 0; for (const ch of t || '') w += /[\u0000-ÿ｡-ﾟ]/.test(ch) ? 1 : 2; return w; };
  const scoreColor = (s) => (s >= 80 ? 'var(--good)' : s >= 60 ? 'var(--warn)' : 'var(--bad)');
  const ring = (v, label, sub) => `<div class="card score"><div class="ring" style="--p:${v ?? 0};--c:${v == null ? 'var(--line)' : scoreColor(v)}"><span>${v ?? '-'}</span></div><div><div class="t">${label}</div><div class="muted small">${sub || ''}</div></div></div>`;

  // ---------- テーマ ----------
  const root = document.documentElement;
  try { const t = localStorage.getItem('sa-theme'); if (t) root.dataset.theme = t; } catch (e) { /* 無視 */ }
  $('#themeBtn').onclick = () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('sa-theme', root.dataset.theme); } catch (e) { /* 無視 */ }
    if (current === 'heatmap') drawHeat();
  };
  $('#sub').textContent = `${new Date(D.crawl.crawledAt).toLocaleString('ja-JP')} ・ ${htmlPages.length}ページ解析 ・ ${(D.elapsedMs / 1000).toFixed(0)}秒`;

  // ---------- 簡易Markdown ----------
  function md(src) {
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    let out = ''; let list = null; let table = null; let code = false; let codeBuf = '';
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const closeList = () => { if (list) { out += `</${list}>`; list = null; } };
    const closeTable = () => { if (table) { out += '</table>'; table = null; } };
    for (const line of lines) {
      if (/^```/.test(line)) { if (code) { out += `<pre>${esc(codeBuf)}</pre>`; codeBuf = ''; code = false; } else { closeList(); closeTable(); code = true; } continue; }
      if (code) { codeBuf += line + '\n'; continue; }
      if (/^\s*\|.*\|\s*$/.test(line)) {
        closeList();
        if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
        const cells = line.trim().slice(1, -1).split('|').map((c) => inline(c.trim()));
        if (!table) { table = true; out += '<table><tr>' + cells.map((c) => `<th>${c}</th>`).join('') + '</tr>'; } else out += '<tr>' + cells.map((c) => `<td>${c}</td>`).join('') + '</tr>';
        continue;
      }
      closeTable();
      let m;
      if ((m = line.match(/^(#{1,4})\s+(.*)/))) { closeList(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
      if ((m = line.match(/^\s*[-*・]\s+(.*)/))) { if (list !== 'ul') { closeList(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = line.match(/^>\s?(.*)/))) { closeList(); out += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
      closeList();
      if (line.trim()) out += `<p>${inline(line)}</p>`;
    }
    closeList(); closeTable();
    if (code) out += `<pre>${esc(codeBuf)}</pre>`;
    return `<div class="md">${out}</div>`;
  }

  // ---------- タブ ----------
  const totalIssues = D.audit.summary.error + D.audit.summary.warning + D.audit.summary.notice;
  const TABS = [
    ['dash', 'ダッシュボード'], ['issues', `課題と改善 <span class="badge b-error">${D.audit.summary.error}</span>`], ['pages', `ページリスト <span class="badge b-accent">${htmlPages.length}</span>`],
    ['structure', 'サイト構造'], ['headings', '見出し(H)'], ['aio', 'AI対策・チャンク'], ['keywords', 'キーワード'], ['links', 'リンク'], ['heatmap', 'ヒートマップ'], ['files', '改善ファイル'],
  ];
  if (D.ai && D.ai.available) TABS.push(['ai', 'AI改善提案']);
  let current = (location.hash || '#dash').slice(1);
  if (!TABS.some((t) => t[0] === current)) current = 'dash';
  const tabs = $('#tabs');
  tabs.innerHTML = TABS.map(([id, l]) => `<button data-t="${id}">${l}</button>`).join('');
  tabs.onclick = (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.t); };
  function show(id) {
    current = id;
    history.replaceState(null, '', '#' + id);
    [...tabs.children].forEach((b) => b.classList.toggle('on', b.dataset.t === id));
    app.innerHTML = '';
    ({ dash, issues, pages: pageList, structure, headings, aio, keywords, links, heatmap, files, ai: aiTab })[id]();
    window.scrollTo(0, 0);
  }

  // ---------- ダッシュボード ----------
  function dash() {
    const s = D.scores;
    const ok = htmlPages.filter((p) => p.status === 200);
    const avgMs = ok.length ? Math.round(ok.reduce((a, p) => a + (p.ms || 0), 0) / ok.length) : 0;
    const types = {};
    htmlPages.forEach((p) => { types[p.pageType] = (types[p.pageType] || 0) + 1; });
    const maxT = Math.max(...Object.values(types), 1);
    const dd = D.structure.depthDist; const maxD = Math.max(...Object.values(dd), 1);
    const statuses = {};
    pages.forEach((p) => { const k = p.isRedirect ? '3xx' : p.status >= 500 ? '5xx' : p.status >= 400 ? '4xx' : p.status === 0 ? 'エラー' : '2xx'; statuses[k] = (statuses[k] || 0) + 1; });
    app.innerHTML = `
      <div class="grid g5">
        ${ring(s.overall, '総合スコア', '全指標の加重平均')}
        ${ring(s.seo, 'SEO監査', `ヘルス ${s.health}%（エラーのないページ率）`)}
        ${ring(s.aio, 'AI検索対策', 'チャンク設計・llms.txt・構造化データ')}
        ${ring(s.structure, 'サイト構造', '深度・孤立・内部リンク')}
        ${ring(s.ux, 'UX（予測）', s.ux == null ? 'ヒートマップ未実行' : '予測ヒートマップ所見')}
      </div>
      <div class="grid g4" style="margin-top:16px">
        <div class="card kpi"><div class="v">${pages.length}</div><div class="l">クロールURL（HTML ${htmlPages.length}）</div></div>
        <div class="card kpi"><div class="v">${totalIssues}</div><div class="l">課題の種類（<span style="color:var(--bad)">エラー${D.audit.summary.error}</span> / <span style="color:var(--warn)">警告${D.audit.summary.warning}</span> / 注意${D.audit.summary.notice}）</div></div>
        <div class="card kpi"><div class="v">${avgMs}<small>ms</small></div><div class="l">平均サーバー応答</div></div>
        <div class="card kpi"><div class="v">${D.crawl.sitemap.count}</div><div class="l">sitemap.xml 掲載URL ${D.crawl.llmsTxt ? '・llms.txt あり' : '・llms.txt なし'}</div></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>優先して直すべき課題</h3>${D.audit.issues.slice(0, 8).map((i) => `<div class="check"><span class="badge b-${i.severity}">${sevLabel[i.severity]}</span><div><b>${esc(i.title)}</b> <span class="muted">${i.count}件</span><div class="small muted">${esc(i.how)}</div></div></div>`).join('') || '<div class="muted">大きな課題は見つかりませんでした。</div>'}
          <p><a href="#issues" onclick="return false" id="toIssues">すべての課題を見る →</a></p></div>
        <div class="card"><h3>AI検索対策チェック</h3>${D.aio.siteChecks.map((c) => `<div class="check"><span class="ic ${c.ok ? 'ok' : 'ng'}">${c.ok ? '✓' : '!'}</span><div>${esc(c.label)}${c.ok ? '' : `<div class="small muted">${esc(c.how)}</div>`}</div></div>`).join('')}</div>
      </div>
      <div class="grid g3" style="margin-top:16px">
        <div class="card"><h3>ページ種別</h3>${Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="barrow"><span>${esc(k)}</span><div class="bar"><i style="width:${(v / maxT) * 100}%"></i></div><span class="n">${v}</span></div>`).join('')}</div>
        <div class="card"><h3>クリック深度</h3>${['0', '1', '2', '3', '4', '5+', '到達不可'].filter((k) => dd[k]).map((k) => `<div class="barrow"><span>${k === '到達不可' ? k : k + 'クリック'}</span><div class="bar"><i style="width:${(dd[k] / maxD) * 100}%;${k === '到達不可' || k === '5+' || k === '4' ? 'background:var(--warn)' : ''}"></i></div><span class="n">${dd[k]}</span></div>`).join('')}</div>
        <div class="card"><h3>HTTPステータス</h3>${Object.entries(statuses).map(([k, v]) => `<div class="barrow"><span>${k}</span><div class="bar"><i style="width:${(v / pages.length) * 100}%;${k !== '2xx' ? 'background:' + (k === '3xx' ? 'var(--warn)' : 'var(--bad)') : 'background:var(--good)'}"></i></div><span class="n">${v}</span></div>`).join('')}
          ${D.crawl.notCrawled ? `<p class="small muted">※ 上限 ${D.crawl.maxPages} ページに達したため、未クロールのURLが ${D.crawl.notCrawled} 件あります。</p>` : ''}</div>
      </div>
      ${D.ai && !D.ai.available ? `<p class="small muted" style="margin-top:16px">💡 ${esc(D.ai.reason)}</p>` : ''}`;
    $('#toIssues').onclick = () => show('issues');
  }

  // ---------- 課題 ----------
  function issues() {
    const cats = [...new Set(D.audit.issues.map((i) => i.category))];
    app.innerHTML = `<div class="toolbar"><div class="seg" id="sev"><button class="on" data-v="">すべて</button><button data-v="error">エラー</button><button data-v="warning">警告</button><button data-v="notice">注意</button></div>
      <select id="cat"><option value="">全カテゴリ</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <a class="btn" href="files/issues.csv" download>CSV</a></div><div id="list"></div>
      ${D.audit.brokenLinks.internal.length || D.audit.brokenLinks.external.length ? '<h2>リンク切れ詳細</h2><div class="tablewrap"><table><tr><th>リンク先</th><th>ステータス</th><th>リンク元</th></tr>' + [...D.audit.brokenLinks.internal, ...D.audit.brokenLinks.external].map((b) => `<tr><td><a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.url)}</a></td><td>${b.status || '接続不可'}</td><td>${b.sources.map((s) => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(shortUrl(s))}</a>`).join('<br>')}</td></tr>`).join('') + '</table></div>' : ''}`;
    let sev = ''; let cat = '';
    const render = () => {
      const list = D.audit.issues.filter((i) => (!sev || i.severity === sev) && (!cat || i.category === cat));
      $('#list').innerHTML = list.map((i) => `<details class="issue"><summary><span class="badge b-${i.severity}">${sevLabel[i.severity]}</span><span class="badge b-accent">${esc(i.category)}</span><b>${esc(i.title)}</b><span class="cnt">${i.count} URL</span></summary>
        <div class="body"><div class="muted">${esc(i.why)}</div><div class="how"><b>改善方法：</b>${esc(i.how)}</div><ol class="urls">${i.urls.map((u) => `<li><a href="#" data-page="${esc(u)}">${esc(u)}</a></li>`).join('')}</ol></div></details>`).join('') || '<div class="empty">該当する課題はありません</div>';
    };
    $('#sev').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; sev = b.dataset.v; [...$('#sev').children].forEach((x) => x.classList.toggle('on', x === b)); render(); };
    $('#cat').onchange = (e) => { cat = e.target.value; render(); };
    render();
  }

  // ---------- ページリスト ----------
  function pageList() {
    const cols = [
      ['url', 'URL', (p) => shortUrl(p.url)], ['status', 'ステータス', (p) => p.status], ['pageType', '種別', (p) => p.pageType || (p.isRedirect ? 'リダイレクト' : '')],
      ['title', 'title', (p) => p.title], ['textLength', '文字数', (p) => p.textLength], ['h', 'h1/h2', (p) => p.headings ? `${p.headings.filter((h) => h.level === 1).length}/${p.headings.filter((h) => h.level === 2).length}` : ''],
      ['depth', '深度', (p) => p.depth], ['inlinks', '被リンク', (p) => p.inlinks], ['internalRank', '内部ランク', (p) => p.internalRank], ['aio', 'AI対策', (p) => aioBy.get(p.url)?.score], ['issues', '課題', (p) => issueCount(p.url)], ['ms', '応答ms', (p) => p.ms],
    ];
    const num = new Set(['status', 'textLength', 'depth', 'inlinks', 'internalRank', 'aio', 'issues', 'ms']);
    let sortKey = 'internalRank'; let dir = -1; let q = ''; let type = '';
    const types = [...new Set(pages.map((p) => p.pageType || (p.isRedirect ? 'リダイレクト' : '')))].filter(Boolean);
    app.innerHTML = `<div class="toolbar"><input type="search" id="q" placeholder="URL・titleで絞り込み"><select id="ty"><option value="">全種別</option>${types.map((t) => `<option>${esc(t)}</option>`).join('')}</select><a class="btn" href="files/pages.csv" download>CSVダウンロード</a></div><div class="tablewrap"><table id="tbl"></table></div><p class="small muted">行をクリックするとページ詳細（見出し・改善案・構造化データ）を表示します。</p>`;
    const render = () => {
      const rows = pages.filter((p) => (!q || (p.url + ' ' + (p.title || '')).toLowerCase().includes(q)) && (!type || (p.pageType || (p.isRedirect ? 'リダイレクト' : '')) === type));
      const get = cols.find((c) => c[0] === sortKey)[2];
      rows.sort((a, b) => { const x = get(a); const y = get(b); return (x == null) - (y == null) || (x > y ? 1 : x < y ? -1 : 0) * dir; });
      $('#tbl').innerHTML = `<tr>${cols.map(([k, l]) => `<th data-k="${k}" class="${num.has(k) ? 'num' : ''}">${l}${k === sortKey ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr>` + rows.map((p) => `<tr class="click" data-page="${esc(p.url)}">${cols.map(([k, , f]) => {
        let v = f(p);
        if (k === 'status') v = `<span class="badge ${p.status === 200 && !p.isRedirect ? 'b-ok' : p.isRedirect ? 'b-warning' : 'b-error'}">${p.status}${p.isRedirect ? '→' : ''}</span>`;
        else if (k === 'aio' && v != null) v = `<b style="color:${scoreColor(v)}">${v}</b>`;
        else if (k === 'title') v = `<div class="trunc" title="${esc(v)}">${esc(v || '(なし)')}</div>`;
        else if (k === 'url') v = `<div class="trunc" title="${esc(p.url)}">${esc(v)}</div>`;
        else v = esc(v ?? '-');
        return `<td class="${num.has(k) ? 'num' : ''}">${v}</td>`;
      }).join('')}</tr>`).join('');
    };
    $('#tbl').onclick = (e) => { const th = e.target.closest('th'); if (th) { const k = th.dataset.k; if (k === sortKey) dir *= -1; else { sortKey = k; dir = num.has(k) ? -1 : 1; } render(); } };
    $('#q').oninput = (e) => { q = e.target.value.toLowerCase(); render(); };
    $('#ty').onchange = (e) => { type = e.target.value; render(); };
    render();
  }
  const issueIndex = new Map();
  D.audit.issues.forEach((i) => i.urls.forEach((u) => issueIndex.set(u, [...(issueIndex.get(u) || []), i])));
  const issueCount = (u) => (issueIndex.get(u) || []).length;

  // ---------- ページ詳細ドロワー ----------
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-page]');
    if (!a) return;
    e.preventDefault();
    openPage(a.dataset.page);
  });
  $('#drawerClose').onclick = () => { $('#drawer').hidden = true; };
  $('#drawer').onclick = (e) => { if (e.target.id === 'drawer') $('#drawer').hidden = true; };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#drawer').hidden = true; });
  function openPage(url) {
    const p = byUrl.get(url);
    if (!p) { window.open(url, '_blank', 'noopener'); return; }
    const meta = D.gen.meta[url];
    const ap = aioBy.get(url);
    const iss = issueIndex.get(url) || [];
    const kws = D.keywords.pageKeywords[url] || [];
    $('#drawerBody').innerHTML = `
      <h2 style="margin-top:0">${esc(p.title || shortUrl(url))}</h2><p><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>
      <div class="kv"><div>ステータス</div><div>${p.status}${p.isRedirect ? ` → ${esc(p.redirectTo)}` : ''} ・ ${p.ms ?? '-'}ms ・ ${p.bytes ? Math.round(p.bytes / 1024) + 'KB' : ''}</div>
      <div>種別 / 深度</div><div>${esc(p.pageType || '-')} ・ ${p.depth ?? '到達不可'}クリック ・ 被内部リンク ${p.inlinks ?? 0} ・ 内部ランク ${p.internalRank ?? '-'}</div>
      <div>canonical</div><div>${esc(p.canonical || '(なし)')}</div><div>robots</div><div>${esc([p.robotsMeta, p.xRobots].filter(Boolean).join(' / ') || '(指定なし)')}</div>
      <div>構造化データ</div><div>${(p.jsonld || []).map((j) => `<span class="badge b-accent">${esc(j.type)}</span>`).join(' ') || '(なし)'}</div>
      <div>本文文字数</div><div>${p.textLength ?? '-'}字 ・ 画像 ${(p.images || []).length}（alt欠落 ${(p.images || []).filter((i) => !i.hasAlt).length}）</div>
      <div>主要キーワード</div><div>${kws.slice(0, 8).map((k) => esc(k.term)).join('、') || '-'}</div></div>
      ${meta ? `<h3>検索結果プレビュー（現在 → 改善案）</h3><div class="grid g2"><div class="card serp"><div class="u">${esc(url)}</div><div class="t">${esc(p.title || '(titleなし)')}</div><div class="d">${esc(p.metaDescription || '(descriptionなし：本文から自動抽出されます)')}</div><div class="small muted">title ${width(p.title) / 2}字 / desc ${width(p.metaDescription) / 2}字（全角換算）</div></div>
        <div class="card serp" style="border-color:var(--accent)"><div class="u">${esc(url)}</div><div class="t">${esc(meta.title)}</div><div class="d">${esc(meta.description)}</div><div class="small muted">${meta.needTitle || meta.needDesc ? '<span class="badge b-warning">修正推奨</span>' : '<span class="badge b-ok">現状で概ね良好</span>'}</div></div></div>` : ''}
      ${iss.length ? `<h3>このページの課題</h3>${iss.map((i) => `<div class="insight"><span class="badge b-${i.severity}">${sevLabel[i.severity]}</span> <b>${esc(i.title)}</b><div class="how"><b>改善方法：</b>${esc(i.how)}</div></div>`).join('')}` : ''}
      ${p.headings ? `<h3>見出し構造（現在 / 修正案）</h3><div class="grid g2"><div class="card outline">${outlineHtml(p.headings)}</div><div class="card outline">${fixedOutline(D.gen.headings[url])}</div></div>` : ''}
      ${ap ? `<h3>AI対策：チャンク評価（スコア ${ap.score}）</h3>${ap.chunks.map(chunkHtml).join('')}` : ''}
      ${(D.gen.jsonld[url] || []).length ? `<h3>追加推奨の構造化データ（&lt;head&gt;に貼り付け）</h3><pre>${esc(D.gen.jsonld[url].map((d) => '<script type="application/ld+json">\n' + JSON.stringify(d, null, 2) + '\n<\/script>').join('\n'))}</pre>` : ''}
      ${p.anchors && p.anchors.length ? `<h3>このページへのアンカーテキスト</h3><div class="cloud">${[...new Set(p.anchors)].slice(0, 30).map((a) => `<span>${esc(a)}</span>`).join('')}</div>` : ''}`;
    $('#drawer').hidden = false;
    $('#drawer .drawer-inner').scrollTop = 0;
  }
  function outlineHtml(hs) {
    let prev = 0;
    return hs.map((h) => { const skip = prev && h.level > prev + 1; prev = h.level; return `<div class="h" style="padding-left:${(h.level - 1) * 16}px"><span class="tag">H${h.level}</span><span class="${h.empty || skip ? 'bad' : ''}">${esc(h.text || '(空)')}${skip ? ' ⚠飛び' : ''}</span></div>`; }).join('') || '<div class="muted">見出しなし</div>';
  }
  function fixedOutline(hs) {
    return (hs || []).map((h) => `<div class="h" style="padding-left:${(h.level - 1) * 16}px"><span class="tag">H${h.level}</span><span>${esc(h.text)}${h.notes.length ? `<div class="note">${esc(h.notes.join('、'))}</div>` : ''}</span></div>`).join('');
  }
  function chunkHtml(c) {
    const cls = c.score >= 80 ? '' : c.score >= 60 ? 'mid' : 'low';
    return `<div class="chunk ${cls}"><div class="head"><span class="tag" style="font-family:var(--mono);font-size:11px">${c.level ? 'H' + c.level : '本文'}</span><b>${esc(c.heading)}</b><span class="muted small">${c.chars}字</span>
      ${c.hasDefinition ? '<span class="badge b-ok">定義文あり</span>' : ''}${c.hasNumber ? '<span class="badge b-ok">数値・事実</span>' : ''}${c.questionHeading ? '<span class="badge b-ok">質問形見出し</span>' : ''}${c.lists ? '<span class="badge b-accent">リスト</span>' : ''}${c.tables ? '<span class="badge b-accent">表</span>' : ''}
      <span style="margin-left:auto;font-weight:700;color:${scoreColor(c.score)}">${c.score}</span></div>
      <div class="txt">${esc(c.text.slice(0, 260))}</div>
      ${c.issues.length || c.suggestions.length ? `<ul>${c.issues.map((i) => `<li class="iss">${esc(i)}</li>`).join('')}${c.suggestions.map((s) => `<li class="sug">${esc(s)}</li>`).join('')}</ul>` : ''}</div>`;
  }

  // ---------- サイト構造 ----------
  function structure() {
    const S = D.structure;
    app.innerHTML = `<div class="toolbar"><div class="seg" id="mode"><button class="on" data-v="diagram">図</button><button data-v="tree">ツリー</button></div><span class="muted small">URL階層ベース。色＝内部ランク（濃いほどリンク評価が集まっている）。破線＝ページが存在しない階層</span></div>
      <div id="view"></div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h3>構造の改善提案</h3>${S.proposals.map((p) => `<div class="insight"><b>${esc(p.title)}</b><div class="how">${esc(p.detail)}</div><ul class="urls">${p.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('') || '<div class="muted">大きな構造上の問題はありません。</div>'}</div>
      <div class="card"><h3>内部リンク評価が集まるページ TOP20</h3><table>${S.rankTop.map((r) => `<tr class="click" data-page="${esc(r.url)}"><td class="trunc">${esc(r.title || shortUrl(r.url))}<div class="small muted">${esc(shortUrl(r.url))}</div></td><td class="num" style="width:120px"><div class="bar"><i style="width:${r.rank}%"></i></div></td><td class="num">${r.rank}</td></tr>`).join('')}</table></div></div>`;
    const render = (m) => { $('#view').innerHTML = m === 'tree' ? `<div class="card tree">${treeHtml(S.tree)}</div>` : `<div class="svgwrap">${treeSvg(S.tree)}</div>`; };
    $('#mode').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; [...$('#mode').children].forEach((x) => x.classList.toggle('on', x === b)); render(b.dataset.v); };
    render('diagram');
  }
  function treeHtml(n) {
    const label = n.url ? `<a href="#" data-page="${esc(n.url)}">${esc(n.title || n.name)}</a> <span class="muted small">${esc(n.path)}</span> <span class="badge b-accent">ランク${n.rank}</span> <span class="muted small">深度${n.depth ?? '-'} / 被リンク${n.inlinks}</span>` : `<span class="virtual">${esc(n.name)}/（ページなし）</span>`;
    return `<ul><li><span class="node">${label}</span>${n.children.map(treeHtml).join('')}</li></ul>`;
  }
  function treeSvg(tree) {
    // 左→右のツリー図（葉を縦に並べ、親は子の中央）
    const nodes = []; let leaf = 0; const LH = 26; const CW = 230;
    const MAX = 400;
    const lay = (n, d) => {
      const kids = nodes.length < MAX ? n.children : [];
      const me = { n, d, kids: [] };
      nodes.push(me);
      if (!kids.length) { me.y = leaf++ * LH; } else { me.kids = kids.map((c) => lay(c, d + 1)); me.y = (me.kids[0].y + me.kids[me.kids.length - 1].y) / 2; }
      return me;
    };
    lay(tree, 0);
    const maxD = Math.max(...nodes.map((x) => x.d));
    const W = (maxD + 1) * CW + 40; const H = leaf * LH + 30;
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    for (const me of nodes) for (const k of me.kids) {
      const x1 = me.d * CW + 20 + 8; const y1 = me.y + 20; const x2 = k.d * CW + 20; const y2 = k.y + 20; const mx = (x1 + x2) / 2;
      s += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="var(--line)" stroke-width="1.5"/>`;
    }
    for (const me of nodes) {
      const x = me.d * CW + 20; const y = me.y + 20; const n = me.n;
      const r = n.url ? 5 + Math.round((n.rank || 0) / 25) : 4;
      const fill = n.url ? `color-mix(in srgb, var(--accent) ${20 + (n.rank || 0) * 0.8}%, var(--panel))` : 'var(--panel)';
      const label = (n.url ? (n.title || n.name).split(/[|｜]/)[0] : n.name + '/').slice(0, 22);
      s += `<g${n.url ? ` data-page="${esc(n.url)}" style="cursor:pointer"` : ''}><title>${esc(n.path)}${n.url ? '\n' + esc(n.title) + `\n深度${n.depth ?? '-'} 被リンク${n.inlinks} ランク${n.rank}` : '（ページなし）'}</title><circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${n.url ? 'var(--accent)' : 'var(--muted)'}" ${n.url ? '' : 'stroke-dasharray="2 2"'} stroke-width="1.5"/>
        <text x="${x + r + 5}" y="${y + 4}">${esc(label)}</text></g>`;
    }
    if (nodes.length >= MAX) s += `<text x="20" y="${H - 6}">※ ${MAX}ノードまで表示（全体はツリー表示/CSVを参照）</text>`;
    return s + '</svg>';
  }

  // ---------- 見出し ----------
  function headings() {
    const list = htmlPages.filter((p) => p.headings);
    const bad = (p) => (D.gen.headings[p.url] || []).filter((h) => h.notes.length).length;
    list.sort((a, b) => bad(b) - bad(a));
    app.innerHTML = `<div class="toolbar"><select id="pg" style="max-width:100%">${list.map((p) => `<option value="${esc(p.url)}">${bad(p) ? '⚠ ' : '✓ '}${esc(shortUrl(p.url))} — ${esc((p.title || '').slice(0, 40))}</option>`).join('')}</select><a class="btn" href="files/headings-fix.md" target="_blank">修正案（Markdown）</a></div>
      <div class="grid g4" style="margin-bottom:16px">
        <div class="card kpi"><div class="v">${list.filter((p) => !p.headings.some((h) => h.level === 1)).length}</div><div class="l">h1なし</div></div>
        <div class="card kpi"><div class="v">${list.filter((p) => p.headings.filter((h) => h.level === 1).length > 1).length}</div><div class="l">h1が複数</div></div>
        <div class="card kpi"><div class="v">${list.filter((p) => bad(p)).length}</div><div class="l">構造の修正が必要なページ</div></div>
        <div class="card kpi"><div class="v">${list.length ? (list.reduce((s, p) => s + p.headings.length, 0) / list.length).toFixed(1) : 0}</div><div class="l">1ページ平均の見出し数</div></div>
      </div><div id="hv"></div>`;
    const render = (u) => {
      const p = byUrl.get(u);
      $('#hv').innerHTML = `<div class="grid g2"><div class="card"><h3>現在の見出し構造</h3><div class="outline">${outlineHtml(p.headings)}</div></div><div class="card"><h3>修正案</h3><div class="outline">${fixedOutline(D.gen.headings[u])}</div>
        <p class="small muted">ルール：h1は1つ／階層を飛ばさない／見出しだけで内容が分かる具体的な文言にする（AIは見出しを手がかりに段落を引用します）。</p></div></div>`;
    };
    $('#pg').onchange = (e) => render(e.target.value);
    if (list.length) render(list[0].url); else $('#hv').innerHTML = '<div class="empty">見出しのあるページがありません</div>';
  }

  // ---------- AI対策 ----------
  function aio() {
    const A = D.aio;
    const list = A.pages.slice().sort((a, b) => a.score - b.score);
    app.innerHTML = `<div class="grid g2"><div class="card"><h3>サイト全体のAI検索対策（スコア ${A.score}）</h3>${A.siteChecks.map((c) => `<div class="check"><span class="ic ${c.ok ? 'ok' : 'ng'}">${c.ok ? '✓' : '!'}</span><div>${esc(c.label)}${c.ok ? '' : `<div class="small muted">${esc(c.how)}</div>`}</div></div>`).join('')}</div>
      <div class="card"><h3>AIクローラーのアクセス可否（robots.txt）</h3><table><tr><th>ボット</th><th>用途</th><th>状態</th></tr>${A.bots.map((b) => `<tr><td><code>${b.ua}</code></td><td class="small">${esc(b.owner)}</td><td>${b.allowed ? '<span class="badge b-ok">許可</span>' : '<span class="badge b-error">拒否</span>'}${b.explicitlyMentioned ? ' <span class="small muted">明示</span>' : ''}</td></tr>`).join('')}</table>
      <h3>構造化データの種類</h3><div>${Object.entries(A.structuredTypes).map(([t, n]) => `<span class="badge b-accent">${esc(t)} ×${n}</span>`).join(' ') || '<span class="muted">なし</span>'}</div></div></div>
      <h2>チャンク設計の考え方</h2><div class="card small">AI検索（ChatGPT検索・Perplexity・Google AI Overviews など）は、ページを見出しや段落ごとの「チャンク」に分けてベクトル化し、質問に最も合うチャンクを引用します。
      そのため各チャンクが <b>①見出しだけで何の話か分かる</b> <b>②1チャンク＝1トピックで300〜800字</b> <b>③冒頭が結論（定義文）</b> <b>④指示語で始まらず単独で意味が通る</b> <b>⑤数値・固有名詞などの事実を含む</b> <b>⑥列挙は箇条書き・表</b> であるほど引用されやすくなります。下記は全ページのチャンクをこの基準で採点したものです。</div>
      <h2>ページ別チャンク評価</h2><div class="toolbar"><select id="pg" style="max-width:100%">${list.map((p) => `<option value="${esc(p.url)}">[${p.score}] ${esc(shortUrl(p.url))} — ${esc((p.title || '').slice(0, 40))}</option>`).join('')}</select><a class="btn" href="files/chunk-rewrite.md" target="_blank">書き換え指示書</a><a class="btn" href="files/llms.txt" target="_blank">llms.txt</a></div><div id="cv"></div>
      ${D.crawl.llmsTxt ? `<h2>現在の llms.txt</h2><pre>${esc(D.crawl.llmsTxt)}</pre>` : ''}`;
    const labels = { structuredData: '構造化データ', headingsStructured: 'h2で構造化', hasDate: '日付情報', hasAuthor: '著者情報', hasQA: 'Q&A見出し', mainLandmark: '<main>要素', textEnough: '本文600字以上', notNoindex: 'インデックス可', definitions: '定義文', facts: '数値・事実' };
    const render = (u) => {
      const p = aioBy.get(u);
      $('#cv').innerHTML = `<div class="card"><div class="toolbar" style="margin:0">${Object.entries(p.checks).map(([k, v]) => `<span class="badge ${v ? 'b-ok' : 'b-error'}">${v ? '✓' : '✕'} ${esc(labels[k])}</span>`).join(' ')}</div>
        <p class="small muted">チャンク数 ${p.chunkCount} ・ チャンク平均 ${p.chunkScore} ・ 主題（推定）「${esc(p.topic)}」</p>${p.chunks.map(chunkHtml).join('') || '<div class="muted">本文チャンクが見つかりません</div>'}</div>`;
    };
    $('#pg').onchange = (e) => render(e.target.value);
    if (list.length) render(list[0].url);
  }

  // ---------- キーワード ----------
  function keywords() {
    const K = D.keywords;
    const max = Math.max(...K.site.map((k) => k.score), 1);
    app.innerHTML = `<div class="grid g2"><div class="card"><h3>サイトの主要トピック（本文・見出し・titleから抽出）</h3><div class="cloud">${K.site.map((k) => `<span style="font-size:${12 + (k.score / max) * 18}px" title="${k.pages}ページに出現">${esc(k.term)}</span>`).join('')}</div>
      <p class="small muted">※ 検索ボリューム・順位は外部データが必要なため含みません。サイトが「何について書かれているか」の自己分析です。</p></div>
      <div class="card"><h3>カニバリゼーション候補（同じ主要語を狙うページ群）</h3>${K.cannibal.map((c) => `<div class="insight"><b>「${esc(c.term)}」</b> ${c.urls.length}ページ<ul class="urls">${c.urls.map((u) => `<li><a href="#" data-page="${esc(u)}">${esc(shortUrl(u))}</a></li>`).join('')}</ul></div>`).join('') || '<div class="muted">検出なし</div>'}
      ${D.duplicates.length ? `<h3>重複・酷似コンテンツ</h3><table>${D.duplicates.map((d) => `<tr><td><a href="#" data-page="${esc(d.a)}">${esc(shortUrl(d.a))}</a></td><td><a href="#" data-page="${esc(d.b)}">${esc(shortUrl(d.b))}</a></td><td class="num">${Math.round(d.similarity * 100)}%</td></tr>`).join('')}</table>` : ''}</div></div>
      <h2>ページ別キーワード</h2><div class="tablewrap"><table><tr><th>ページ</th><th>主要キーワード（上位）</th><th>titleに含む</th><th>h1に含む</th></tr>${htmlPages.map((p) => { const ks = K.pageKeywords[p.url] || []; const m = ks[0]?.term || ''; const h1 = (p.headings || []).find((h) => h.level === 1)?.text || ''; return `<tr class="click" data-page="${esc(p.url)}"><td class="trunc">${esc(p.title || shortUrl(p.url))}<div class="small muted">${esc(shortUrl(p.url))}</div></td><td>${ks.slice(0, 6).map((k) => esc(k.term)).join('、')}</td><td>${m ? ((p.title || '').includes(m) ? '<span class="badge b-ok">✓</span>' : '<span class="badge b-warning">✕</span>') : '-'}</td><td>${m ? (h1.includes(m) ? '<span class="badge b-ok">✓</span>' : '<span class="badge b-warning">✕</span>') : '-'}</td></tr>`; }).join('')}</table></div>`;
  }

  // ---------- リンク ----------
  function links() {
    const ext = D.crawl.externalLinks;
    const domains = {};
    ext.forEach((e) => { try { const h = new URL(e.url).hostname; domains[h] = (domains[h] || 0) + e.sources.length; } catch (x) { /* 無視 */ } });
    const top = htmlPages.slice().sort((a, b) => (b.inlinks || 0) - (a.inlinks || 0));
    const anchors = {};
    htmlPages.forEach((p) => (p.links || []).filter((l) => l.internal && !l.inNav && l.text).forEach((l) => { anchors[l.text] = (anchors[l.text] || 0) + 1; }));
    app.innerHTML = `<div class="grid g4"><div class="card kpi"><div class="v">${htmlPages.reduce((s, p) => s + (p.links || []).filter((l) => l.internal).length, 0)}</div><div class="l">内部リンク総数</div></div>
      <div class="card kpi"><div class="v">${ext.length}</div><div class="l">外部リンク先（ユニーク）</div></div>
      <div class="card kpi"><div class="v" style="color:var(--bad)">${D.audit.brokenLinks.internal.length}</div><div class="l">内部リンク切れ</div></div>
      <div class="card kpi"><div class="v" style="color:var(--warn)">${D.audit.brokenLinks.external.length}</div><div class="l">外部リンク切れ</div></div></div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h3>被内部リンクの多いページ</h3><table><tr><th>ページ</th><th class="num">被リンク</th><th class="num">深度</th></tr>${top.slice(0, 25).map((p) => `<tr class="click" data-page="${esc(p.url)}"><td class="trunc">${esc(p.title || shortUrl(p.url))}</td><td class="num">${p.inlinks}</td><td class="num">${p.depth ?? '-'}</td></tr>`).join('')}</table>
        <h3>被内部リンクが少ないページ</h3><table>${top.slice(-15).reverse().map((p) => `<tr class="click" data-page="${esc(p.url)}"><td class="trunc">${esc(p.title || shortUrl(p.url))}</td><td class="num">${p.inlinks}</td></tr>`).join('')}</table></div>
      <div class="card"><h3>本文内アンカーテキスト（ナビ除く）</h3><div class="cloud">${Object.entries(anchors).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([t, n]) => `<span title="${n}回">${esc(t)}<small class="muted">${n}</small></span>`).join('') || '<span class="muted">本文内リンクがほとんどありません。関連ページへの文脈リンクを増やしましょう。</span>'}</div>
        <h3>外部リンク先ドメイン</h3><table>${Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([d, n]) => `<tr><td>${esc(d)}</td><td class="num">${n}</td></tr>`).join('')}</table></div></div>
      <p class="small muted">※ 被リンク（他サイトからのバックリンク）は外部のリンクデータベースが必要なため対象外です。本ツールはサイト内のリンク構造（内部リンク・内部ランク）を解析します。</p>`;
  }

  // ---------- ヒートマップ ----------
  let heatState = { idx: 0, mode: 'attention', real: null };
  function heatmap() {
    const H = D.heatmap;
    const res = (H.results || []).filter((r) => !r.error);
    const trackerHost = location.protocol.startsWith('http') ? location.origin : 'http://localhost:3000';
    const trackerInfo = `<h2>実測ヒートマップ（GA4不要の自前計測）</h2><div class="card small">予測ではなく実際のクリック・スクロールを計測したい場合は、Site Analyzer サーバー（<code>npm start</code>）を公開できる場所で動かし、対象サイトの &lt;/body&gt; 直前に次の1行を設置してください。Cookieは使用せず、個人を特定する情報は送信しません。
      <pre>&lt;script src="${esc(trackerHost)}/t.js" defer&gt;&lt;/script&gt;</pre>データが溜まると、このタブの「実測クリック」「実測スクロール」に表示されます（サーバー経由でレポートを開いた場合）。</div>`;
    if (!H.available || !res.length) { app.innerHTML = `<div class="empty">${esc(H.reason || 'ヒートマップデータがありません')}</div>${trackerInfo}`; return; }
    app.innerHTML = `<div class="toolbar"><select id="hp">${res.map((r, i) => `<option value="${i}">${r.device === 'mobile' ? '📱' : '🖥'} ${esc(shortUrl(r.url))}</option>`).join('')}</select>
      <div class="seg" id="hm"><button data-v="attention" class="on">注視（予測）</button><button data-v="click">クリック（予測）</button><button data-v="scroll">スクロール到達（予測）</button><button data-v="real">実測クリック</button><button data-v="realscroll">実測スクロール</button></div>
      <label class="small"><input type="range" id="op" min="20" max="100" value="70"> 不透明度</label></div>
      <div class="grid" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)" id="hgrid"><div><div class="heatwrap" id="hw"><img id="himg" alt="スクリーンショット"><canvas id="hcv"></canvas></div><div class="legend" style="margin-top:8px"><span>低</span><span class="grad"></span><span>高</span><span id="hnote"></span></div></div><div id="hside"></div></div>${trackerInfo}`;
    if (matchMedia('(max-width: 900px)').matches) $('#hgrid').style.gridTemplateColumns = '1fr';
    $('#hp').onchange = (e) => { heatState.idx = +e.target.value; heatState.real = null; loadHeat(); };
    $('#hm').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; heatState.mode = b.dataset.v; [...$('#hm').children].forEach((x) => x.classList.toggle('on', x === b)); drawHeat(); };
    $('#op').oninput = (e) => { $('#hcv').style.opacity = e.target.value / 100; };
    $('#hcv').style.opacity = 0.7;
    heatState.idx = 0;
    loadHeat();
  }
  function curHeat() { return D.heatmap.results.filter((r) => !r.error)[heatState.idx]; }
  function loadHeat() {
    const r = curHeat();
    const img = $('#himg');
    $('#hw').classList.toggle('mobile', r.device === 'mobile');
    img.onload = drawHeat;
    img.src = 'shots/' + r.screenshot;
    const p = r.perf || {};
    const metric = (l, v, good, ok, unit) => `<div class="card kpi"><div class="v" style="color:${v <= good ? 'var(--good)' : v <= ok ? 'var(--warn)' : 'var(--bad)'}">${v}${unit}</div><div class="l">${l}</div></div>`;
    $('#hside').innerHTML = `<div class="grid g2">${metric('LCP（表示速度）', +(p.lcp / 1000).toFixed(2), 2.5, 4, '秒')}${metric('CLS（レイアウトずれ）', p.cls, 0.1, 0.25, '')}${metric('TTFB', p.ttfb, 800, 1800, 'ms')}<div class="card kpi"><div class="v">${p.transferKB}<small>KB</small></div><div class="l">転送量・${p.requests}リクエスト</div></div></div>
      <h3>所見と改善方法</h3>${r.insights.map((i) => `<div class="insight"><span class="badge b-${i.level === 'ok' ? 'ok' : i.level}">${i.level === 'ok' ? '良好' : sevLabel[i.level]}</span> ${esc(i.text)}${i.how ? `<div class="how"><b>改善：</b>${esc(i.how)}</div>` : ''}</div>`).join('')}
      <h3>セクション別 予測到達率</h3>${r.sections.filter((s) => s.text).map((s) => `<div class="barrow" style="grid-template-columns:1fr 90px 40px"><span class="trunc" style="max-width:none">${s.level === 1 ? '<b>' : ''}${esc(s.text)}${s.level === 1 ? '</b>' : ''}</span><div class="bar"><i style="width:${s.reach}%;background:${s.reach >= 60 ? 'var(--good)' : s.reach >= 35 ? 'var(--warn)' : 'var(--bad)'}"></i></div><span class="n">${s.reach}%</span></div>`).join('')}
      <p class="small muted">予測モデル：要素の種類・大きさ・文字サイズ・コントラスト・F型の視線パターン・スクロール到達率（1画面ごとに約30%減衰）から推定。実測データではありません。</p>`;
  }
  const PALETTE = (() => {
    const stops = [[0, [44, 123, 182]], [0.25, [0, 204, 188]], [0.5, [144, 235, 157]], [0.65, [255, 255, 140]], [0.8, [242, 158, 46]], [1, [215, 25, 28]]];
    const pal = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [t0, c0] = stops[k]; const [t1, c1] = stops[k + 1]; const f = (t - t0) / (t1 - t0 || 1);
      for (let j = 0; j < 3; j++) pal[i * 3 + j] = c0[j] + (c1[j] - c0[j]) * f;
    }
    return pal;
  })();
  async function drawHeat() {
    const r = curHeat(); const img = $('#himg'); const cv = $('#hcv');
    if (!r || !img.naturalWidth) return;
    const W = r.width; const Hh = r.height;
    cv.width = W; cv.height = Hh;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, Hh);
    const note = $('#hnote');
    note.textContent = '';
    if (heatState.mode === 'scroll' || heatState.mode === 'realscroll') {
      let reachAt = (y) => (y <= r.fold ? 1 : Math.exp((-0.35 * (y - r.fold)) / r.fold));
      if (heatState.mode === 'realscroll') {
        const ev = await realEvents(r.url);
        if (!ev || !ev.scrolls.length) { note.textContent = ev ? '実測スクロールデータがまだありません' : 'サーバー経由で開いた場合のみ表示できます'; return; }
        const depths = ev.scrolls.map((s) => s.maxY).sort((a, b) => a - b);
        reachAt = (y) => depths.filter((d) => d >= y).length / depths.length;
        note.textContent = `実測 ${depths.length} セッション`;
      }
      for (let y = 0; y < Hh; y += 4) {
        const v = reachAt(y); const i = Math.round(v * 255) * 3;
        ctx.fillStyle = `rgba(${PALETTE[i]},${PALETTE[i + 1]},${PALETTE[i + 2]},0.55)`;
        ctx.fillRect(0, y, W, 4);
      }
      ctx.font = `bold ${r.device === 'mobile' ? 14 : 16}px sans-serif`;
      for (const pct of [75, 50, 25, 10]) {
        let y = null;
        for (let yy = 0; yy < Hh; yy += 4) if (reachAt(yy) * 100 <= pct) { y = yy; break; }
        if (y == null) continue;
        ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, y - 1, W, 2);
        ctx.fillRect(8, y - 24, 140, 22); ctx.fillStyle = '#fff'; ctx.fillText(`${pct}% が到達`, 14, y - 8);
      }
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(0, r.fold - 1, W, 2);
      return;
    }
    let pts = [];
    if (heatState.mode === 'attention') pts = r.items.map((it) => ({ x: it.x + it.w / 2, y: it.y + Math.min(it.h, 400) / 2, w: it.attention, rad: Math.max(24, Math.min(170, Math.sqrt(it.w * Math.min(it.h, 400)) * 0.55)) }));
    else if (heatState.mode === 'click') pts = r.items.filter((it) => it.clickable).map((it) => ({ x: it.x + it.w / 2, y: it.y + it.h / 2, w: Math.min(1, it.attention * (it.isCta ? 2 : it.buttonLike ? 1.4 : 0.8)), rad: Math.max(18, Math.min(70, Math.sqrt(it.w * it.h) * 0.6)) }));
    else {
      const ev = await realEvents(r.url);
      if (!ev) { note.textContent = 'サーバー（npm start）経由でレポートを開いた場合のみ実測データを表示できます'; return; }
      const clicks = ev.clicks.filter((c) => (r.device === 'mobile' ? c.vw < 768 : c.vw >= 768));
      if (!clicks.length) { note.textContent = '実測クリックデータがまだありません（t.js を設置してください）'; return; }
      note.textContent = `実測 ${clicks.length} クリック`;
      pts = clicks.map((c) => ({ x: c.xr * W, y: c.y, w: 0.35, rad: 28 }));
    }
    // グレースケールで強度を加算 → パレットで着色
    const off = document.createElement('canvas'); off.width = W; off.height = Hh;
    const o = off.getContext('2d');
    for (const p of pts) {
      if (p.y > Hh) continue;
      const g = o.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.rad);
      g.addColorStop(0, `rgba(0,0,0,${Math.min(1, p.w * 0.55)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g; o.fillRect(p.x - p.rad, p.y - p.rad, p.rad * 2, p.rad * 2);
    }
    const id = o.getImageData(0, 0, W, Hh); const d = id.data;
    let maxA = 1; for (let i = 3; i < d.length; i += 4) if (d[i] > maxA) maxA = d[i];
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]; if (!a) continue;
      const v = Math.min(255, Math.round((a / maxA) * 255)); const k = v * 3;
      d[i] = PALETTE[k]; d[i + 1] = PALETTE[k + 1]; d[i + 2] = PALETTE[k + 2]; d[i + 3] = Math.min(220, 40 + v);
    }
    ctx.putImageData(id, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(0, r.fold - 1, W, 2);
    ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(W - 128, r.fold - 20, 124, 18); ctx.fillStyle = '#fff'; ctx.fillText('ファーストビュー境界', W - 122, r.fold - 7);
  }
  const realCache = new Map();
  async function realEvents(url) {
    if (!location.protocol.startsWith('http')) return null;
    if (realCache.has(url)) return realCache.get(url);
    try {
      const res = await fetch('/api/events?url=' + encodeURIComponent(url));
      const j = res.ok ? await res.json() : null;
      realCache.set(url, j);
      return j;
    } catch (e) { return null; }
  }

  // ---------- 改善ファイル ----------
  function files() {
    app.innerHTML = `<div class="card"><h3>生成された改善ファイル</h3><p class="small muted">そのまま実装・配布に使えるファイルです。レポートと同じフォルダの files/ に保存されています。</p><table>${D.files.map((f) => `<tr><td><a href="files/${esc(f.name)}" target="_blank">${esc(f.name)}</a></td><td>${esc(f.desc)}</td></tr>`).join('')}</table></div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h3>llms.txt（AI向けサイト案内）</h3><pre>${esc(D.gen.llmsTxt)}</pre></div><div class="card"><h3>robots.txt 案</h3><pre>${esc(D.gen.robots)}</pre>${D.crawl.robotsTxt ? `<h3>現在の robots.txt</h3><pre>${esc(D.crawl.robotsTxt)}</pre>` : '<p class="muted">現在 robots.txt はありません。</p>'}</div></div>
      <h2>title / meta description 改善案</h2><div class="tablewrap"><table><tr><th>ページ</th><th>現在</th><th>改善案</th></tr>${htmlPages.filter((p) => D.gen.meta[p.url]).sort((a, b) => (D.gen.meta[b.url].needTitle + D.gen.meta[b.url].needDesc) - (D.gen.meta[a.url].needTitle + D.gen.meta[a.url].needDesc)).map((p) => { const m = D.gen.meta[p.url]; return `<tr><td class="trunc"><a href="#" data-page="${esc(p.url)}">${esc(shortUrl(p.url))}</a>${m.needTitle || m.needDesc ? '<br><span class="badge b-warning">要修正</span>' : ''}</td><td class="small"><b>${esc(p.title || '(なし)')}</b><br><span class="muted">${esc(p.metaDescription || '(なし)')}</span></td><td class="small"><b>${esc(m.title)}</b><br><span class="muted">${esc(m.description)}</span></td></tr>`; }).join('')}</table></div>`;
  }

  // ---------- Claude 改善提案 ----------
  function aiTab() {
    const A = D.ai;
    app.innerHTML = `<p class="small muted">Claude（${esc(A.model)}）が解析結果をもとに作成した改善案です。事実関係（数値・実績など）は公開前に必ず確認してください。</p>
      ${A.errors && A.errors.length ? `<div class="insight"><span class="badge b-warning">一部失敗</span> ${A.errors.map(esc).join('<br>')}</div>` : ''}
      <div class="toolbar"><select id="aisel">${A.strategy ? '<option value="-1">サイト改善戦略書</option>' : ''}${(A.pages || []).map((p, i) => `<option value="${i}">${esc(shortUrl(p.url))} の改善原稿</option>`).join('')}</select></div><div class="card" id="aiv"></div>`;
    const render = (v) => { $('#aiv').innerHTML = md(+v < 0 ? A.strategy : A.pages[+v].markdown); };
    $('#aisel').onchange = (e) => render(e.target.value);
    render($('#aisel').value);
  }

  show(current);
})();
