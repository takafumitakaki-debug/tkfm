import { readTakenAt } from './meta.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { me: null, album: null, albums: null };

// ---------------------------------------------------------------- API

class ApiError extends Error {
  constructor(status, body) { super(body.error || `エラー (${status})`); this.status = status; this.body = body; }
}

async function api(method, url, body, { raw } = {}) {
  const opts = { method, headers: { 'X-TKFM': '1' }, credentials: 'same-origin' };
  if (body instanceof Blob) { opts.body = body; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(url, opts);
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.me) { state.me = null; route(); }
    throw new ApiError(res.status, data);
  }
  return data;
}

// ---------------------------------------------------------------- 表示ユーティリティ

function fmtBytes(n) {
  if (n == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)}${u[i]}`;
}
const WD = ['日', '月', '火', '水', '木', '金', '土'];
function fmtDay(t) {
  const d = new Date(t);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`;
}
function fmtDateTime(t) {
  const d = new Date(t);
  return `${fmtDay(t)} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtAgo(t) {
  if (!t) return '—';
  const s = (Date.now() - t) / 1000;
  if (s < 3600) return 'さっき';
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}日前`;
  return fmtDay(t);
}
function fmtDuration(sec) {
  if (!sec) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

let toastTimer;
function toast(msg, { error } = {}) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (error ? ' error' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, error ? 5000 : 2600);
}
const showError = (e) => toast(e.message || String(e), { error: true });

function setBar({ title, back, actions = '' }) {
  $('#bar-title').textContent = title;
  document.title = title === appName() ? title : `${title} – ${appName()}`;
  const b = $('#bar-back');
  b.hidden = !back;
  b.onclick = back ? () => { location.hash = back; } : null;
  $('#bar-actions').innerHTML = actions;
}
const appName = () => (state.me && state.me.appName) || 'TKFM Share';
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ダイアログ（Promise で結果を返す）
function openDialog(html, onMount) {
  const d = $('#dialog');
  d.innerHTML = html;
  return new Promise((resolve) => {
    const close = (v) => { d.close(); resolve(v); };
    d.onclose = () => resolve(undefined);
    d.onclick = (e) => {
      const act = e.target.closest('[data-close]');
      if (act) close(act.dataset.close || undefined);
      else if (e.target === d) close(undefined);
    };
    d.showModal();
    if (onMount) onMount(d, close);
  });
}

function askText({ title, label, value = '', ok = 'OK' }) {
  return openDialog(`
    <form method="dialog" id="ask-form">
      <h2>${esc(title)}</h2>
      <label class="field"><span>${esc(label)}</span><input class="input" name="v" value="${esc(value)}" maxlength="80" required autocomplete="off"></label>
      <div class="actions"><button type="button" class="btn" data-close>キャンセル</button><button class="btn primary">${esc(ok)}</button></div>
    </form>`, (d, close) => {
    const f = $('#ask-form', d);
    const inp = f.elements.v;
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
    f.onsubmit = (e) => { e.preventDefault(); const v = inp.value.trim(); if (v) close(v); };
  });
}

function confirmDialog({ title, body = '', ok = 'OK', danger }) {
  return openDialog(`
    <h2>${esc(title)}</h2>${body ? `<p>${body}</p>` : ''}
    <div class="actions"><button class="btn" data-close>キャンセル</button>
    <button class="btn ${danger ? 'danger' : 'primary'}" data-close="ok">${esc(ok)}</button></div>`).then((v) => v === 'ok');
}

async function shareOrCopy(url, text) {
  if (navigator.share) {
    try { await navigator.share({ title: appName(), text, url }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  await copyText(url);
}
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); toast('コピーしました'); }
  catch { toast('コピーできませんでした。長押しで選択してコピーしてください', { error: true }); }
}

// ---------------------------------------------------------------- ルーティング

// 非同期の読み込み中に別の画面へ移動したら、古い画面の描画を捨てる
let navSeq = 0;
const navGuard = () => { const n = navSeq; return () => n === navSeq; };

async function route() {
  navSeq++;
  closeViewer(true);
  const path = location.pathname;
  const inviteMatch = /^\/invite\/([A-Za-z0-9_-]+)$/.exec(path);
  if (inviteMatch) return viewInvite(inviteMatch[1]);
  if (path !== '/') { history.replaceState(null, '', '/' + location.hash); }

  if (!state.me) {
    try { state.me = await api('GET', '/api/me'); }
    catch (e) {
      if (e.status === 401) return viewLogin();
      $('#view').innerHTML = `<div class="empty"><span class="big">⚠︎</span>サーバーにつながりません。<br>通信状態を確認して再読み込みしてください。</div>`;
      return;
    }
  }

  const h = location.hash.replace(/^#/, '') || '/';
  let m;
  window.scrollTo(0, 0);
  if ((m = /^\/a\/([A-Za-z0-9_-]+)$/.exec(h))) return viewAlbum(m[1]);
  if (h === '/members' && state.me.role === 'admin') return viewMembers();
  if (h === '/settings') return viewSettings();
  return viewAlbums();
}
window.addEventListener('hashchange', route);
window.addEventListener('popstate', () => { if (!$('#viewer').hidden) closeViewer(true); });

// ---------------------------------------------------------------- 入口：招待リンク

async function viewInvite(token) {
  setBar({ title: 'ご招待' });
  const v = $('#view');
  v.innerHTML = '<div class="empty">確認しています…</div>';
  let info;
  try { info = await api('GET', `/api/invites/${token}`); } catch (e) { info = { valid: false }; }
  if (!info.valid) {
    v.innerHTML = `<div class="gate card center">
      <img class="gate-logo" src="/icon.svg" alt="">
      <h2>このリンクは使えません</h2>
      <p class="muted">使用済みか、有効期限が切れています。招待してくれた人に新しいリンクをお願いしてください。</p>
      <a class="btn" href="/">トップへ</a></div>`;
    return;
  }
  setBar({ title: info.appName });
  v.innerHTML = `<div class="gate">
    <img class="gate-logo" src="/icon.svg" alt="">
    <h2>${esc(info.name)} さん</h2>
    <p class="lead">${info.existing ? 'この端末でログインします。' : `「${esc(info.appName)}」に招待されています。<br>招待された人だけが見られる写真・動画の共有スペースです。`}</p>
    <button class="btn primary block" id="accept">${info.existing ? 'ログインする' : '参加する'}</button>
    <p class="small muted center" style="margin-top:14px">このリンクは1回だけ使えます。他の人には転送しないでください。</p></div>`;
  $('#accept').onclick = async (e) => {
    e.target.disabled = true;
    try {
      await api('POST', `/api/invites/${token}/accept`);
      state.me = null;
      // 招待トークンを履歴から消してトップへ
      history.replaceState(null, '', '/#/');
      sessionStorage.setItem('tkfm-welcome', '1');
      route();
    } catch (err) { showError(err); e.target.disabled = false; }
  };
}

// ---------------------------------------------------------------- 入口：ログインコード

function viewLogin() {
  setBar({ title: appName() });
  $('#view').innerHTML = `<div class="gate">
    <img class="gate-logo" src="/icon.svg" alt="">
    <h2>${esc(appName())}</h2>
    <p class="lead">招待されたメンバーだけが使えます。</p>
    <div class="card">
      <h2>はじめての方</h2>
      <p class="small">招待してくれた人から届いた<strong>招待リンク</strong>を開いてください。</p>
    </div>
    <form class="card" id="code-form">
      <h2>ほかの端末でログイン済みの方</h2>
      <p class="small">ログイン済みの端末で「設定 → この端末以外でログイン」を開くと、8桁のコードが表示されます。</p>
      <input class="input code-input" name="code" placeholder="XXXX-XXXX" maxlength="9" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required>
      <button class="btn primary block" style="margin-top:12px">ログイン</button>
    </form></div>`;
  const f = $('#code-form');
  f.code.addEventListener('input', () => {
    const s = f.code.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
    f.code.value = s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
  });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      await api('POST', '/api/login-codes/redeem', { code: f.code.value });
      state.me = null;
      route();
    } catch (err) { showError(err); btn.disabled = false; }
  };
}

// ---------------------------------------------------------------- アルバム一覧

async function viewAlbums() {
  const admin = state.me.role === 'admin';
  setBar({
    title: appName(),
    actions: `${admin ? '<a class="btn small" href="#/members">メンバー</a>' : ''}<a class="btn small icon-btn" href="#/settings" aria-label="設定">⚙︎</a>`,
  });
  const v = $('#view');
  if (!state.albums) v.innerHTML = '<div class="empty">読み込み中…</div>';
  const current = navGuard();
  let albums;
  try { albums = state.albums = await api('GET', '/api/albums'); } catch (e) { return showError(e); }
  if (!current()) return;

  const welcome = sessionStorage.getItem('tkfm-welcome');
  sessionStorage.removeItem('tkfm-welcome');
  const homeTip = isIOS() && !isStandalone() && !localStorage.getItem('tkfm-hide-hometip');

  v.innerHTML = `
    ${welcome ? `<div class="storage-note"><span>🎉</span><div>ようこそ、${esc(state.me.name)} さん。</div></div>` : ''}
    ${homeTip ? `<div class="storage-note" id="hometip"><span>📲</span><div>
      共有ボタン <b>⬆︎</b> →「<b>ホーム画面に追加</b>」でアプリのように使えます。
      <br><span class="small muted">ホーム画面から開いた後は、ここ（Safari）の「設定 → この端末以外でログイン」のコードで一度ログインしてください。</span>
      <br><button class="btn small" id="hide-tip" style="margin-top:6px">閉じる</button></div></div>` : ''}
    <div class="row" style="margin-bottom:16px">
      <span class="muted small spacer">写真・動画はサーバーに保存されます。iPhone本体の容量は使いません。</span>
      <button class="btn primary" id="new-album">＋ アルバム</button>
    </div>
    ${albums.length ? `<div class="albums">${albums.map((a) => `
      <a class="album" href="#/a/${a.id}">
        <div class="album-cover">${a.coverId ? `<img src="/media/${a.coverId}/thumb" alt="" loading="lazy">` : '🖼'}</div>
        <div class="album-title">${esc(a.title)}</div>
        <div class="album-meta">${a.count}件 · ${fmtAgo(a.updatedAt)}</div>
      </a>`).join('')}</div>`
    : `<div class="empty"><span class="big">🖼</span>まだアルバムがありません。<br>「＋ アルバム」から作ってみましょう。</div>`}`;

  $('#new-album').onclick = async () => {
    const title = await askText({ title: '新しいアルバム', label: 'アルバム名', value: fmtDay(Date.now()).replace(/\(.\)$/, ''), ok: '作成' });
    if (!title) return;
    try {
      const a = await api('POST', '/api/albums', { title });
      location.hash = `/a/${a.id}`;
    } catch (e) { showError(e); }
  };
  const hide = $('#hide-tip');
  if (hide) hide.onclick = () => { localStorage.setItem('tkfm-hide-hometip', '1'); $('#hometip').remove(); };
}

// ---------------------------------------------------------------- アルバム

async function viewAlbum(id, { keepScroll } = {}) {
  setBar({ title: state.album?.id === id ? state.album.title : 'アルバム', back: '/' });
  const v = $('#view');
  if (state.album?.id !== id) v.innerHTML = '<div class="empty">読み込み中…</div>';
  const current = navGuard();
  let album;
  try { album = await api('GET', `/api/albums/${id}`); }
  catch (e) {
    if (!current()) return;
    if (e.status === 404) { v.innerHTML = '<div class="empty">アルバムが見つかりません。</div>'; return; }
    return showError(e);
  }
  if (!current() || location.hash !== `#/a/${id}`) return;
  state.album = album;
  const canManage = state.me.role === 'admin' || state.me.id === album.createdBy;
  setBar({
    title: album.title, back: '/',
    actions: canManage ? '<button class="btn small icon-btn" id="album-menu" aria-label="アルバムの設定">⋯</button>' : '',
  });

  const total = album.media.reduce((s, m) => s + m.size, 0);
  const photos = album.media.filter((m) => m.kind === 'photo').length;
  const videos = album.media.length - photos;

  let html = `<div class="album-head"><div class="meta">${[photos && `写真 ${photos}`, videos && `動画 ${videos}`].filter(Boolean).join(' · ') || '空のアルバム'}
    ${total ? ` · ${fmtBytes(total)}` : ''}${album.creator ? ` · 作成：${esc(album.creator)}` : ''}</div></div>`;

  if (!album.media.length) {
    html += `<div class="empty"><span class="big">📷</span>右下の「＋ 追加」から写真・動画を入れてください。<br>
      <span class="small">アップロードが終わったら、iPhoneの写真アプリからは削除しても大丈夫です。</span></div>`;
  } else {
    let lastDay = '';
    let open = false;
    album.media.forEach((m, i) => {
      const day = fmtDay(m.takenAt || m.createdAt);
      if (day !== lastDay) {
        if (open) html += '</div>';
        html += `<h3 class="day">${day}</h3><div class="grid">`;
        open = true;
        lastDay = day;
      }
      html += `<button class="tile" data-i="${i}" aria-label="${esc(m.name)}">
        ${m.hasThumb ? `<img src="/media/${m.id}/thumb" alt="" loading="lazy">` : `<span class="nothumb">${m.kind === 'video' ? '🎬' : '🖼'}<br>${esc(m.name)}</span>`}
        ${m.kind === 'video' ? `<span class="badge">▶ ${fmtDuration(m.duration)}</span>` : ''}</button>`;
    });
    if (open) html += '</div>';
  }
  const y = window.scrollY;
  v.innerHTML = html + `
    <input type="file" id="picker" accept="image/*,video/*" multiple hidden>
    <button class="fab" id="add">＋ 追加</button>`;
  if (keepScroll) window.scrollTo(0, y);

  v.querySelectorAll('.tile').forEach((t) => { t.onclick = () => openViewer(album.media, Number(t.dataset.i)); });
  const picker = $('#picker');
  $('#add').onclick = () => picker.click();
  picker.onchange = () => {
    const files = [...picker.files];
    picker.value = '';
    if (files.length) enqueueUploads(files, album.id, album.title);
  };

  const menu = $('#album-menu');
  if (menu) menu.onclick = async () => {
    const act = await openDialog(`<h2>${esc(album.title)}</h2>
      <div class="stack"><button class="btn block" data-close="rename">名前を変更</button>
      <button class="btn block danger" data-close="delete">アルバムを削除</button>
      <button class="btn block" data-close>閉じる</button></div>`);
    if (act === 'rename') {
      const title = await askText({ title: 'アルバム名を変更', label: 'アルバム名', value: album.title, ok: '変更' });
      if (!title) return;
      try { await api('PATCH', `/api/albums/${album.id}`, { title }); viewAlbum(album.id); } catch (e) { showError(e); }
    } else if (act === 'delete') {
      const ok = await confirmDialog({
        title: 'アルバムを削除しますか？', ok: '削除する', danger: true,
        body: `中の写真・動画 ${album.media.length}件もサーバーから完全に削除され、元に戻せません。`,
      });
      if (!ok) return;
      try { await api('DELETE', `/api/albums/${album.id}`); state.albums = null; location.hash = '/'; } catch (e) { showError(e); }
    }
  };
}

// ---------------------------------------------------------------- ビューア

const viewer = { list: [], index: 0, chromeOff: false };

function openViewer(list, index) {
  viewer.list = list;
  viewer.index = index;
  $('#viewer').hidden = false;
  document.body.classList.add('no-scroll');
  history.pushState({ viewer: true }, '', location.href);
  renderViewer();
}

function closeViewer(fromHistory) {
  const el = $('#viewer');
  if (el.hidden) return;
  el.hidden = true;
  $('#v-stage').innerHTML = '';
  document.body.classList.remove('no-scroll');
  if (!fromHistory && history.state?.viewer) history.back();
}

function renderViewer() {
  const m = viewer.list[viewer.index];
  const stage = $('#v-stage');
  stage.innerHTML = '';
  const slide = document.createElement('div');
  slide.className = 'slide';
  if (m.kind === 'video') {
    const vid = document.createElement('video');
    vid.controls = true;
    vid.playsInline = true;
    vid.preload = 'metadata';
    if (m.hasThumb) vid.poster = `/media/${m.id}/thumb`;
    vid.src = `/media/${m.id}/original`;
    vid.onerror = () => {
      slide.innerHTML = `<div class="noview">この端末では再生できない形式です。<br>「保存」からダウンロードして再生してください。</div>`;
    };
    slide.appendChild(vid);
  } else {
    slide.innerHTML = '<div class="spinner"></div>';
    const img = new Image();
    img.alt = m.name;
    img.onload = () => { slide.innerHTML = ''; slide.appendChild(img); };
    img.onerror = () => {
      slide.innerHTML = `<div class="noview">この端末では表示できない形式です（${esc(m.mime)}）。<br>「保存」からダウンロードできます。</div>`;
    };
    img.src = m.hasPreview ? `/media/${m.id}/preview` : `/media/${m.id}/original`;
    // 次の1枚を先読み（軽いプレビュー画像だけ）
    const next = viewer.list[viewer.index + 1];
    if (next && next.kind === 'photo') new Image().src = next.hasPreview ? `/media/${next.id}/preview` : `/media/${next.id}/thumb`;
  }
  stage.appendChild(slide);

  $('#v-count').textContent = `${viewer.index + 1} / ${viewer.list.length}`;
  const dims = m.width && m.height ? ` · ${m.width}×${m.height}` : '';
  $('#v-info').innerHTML = `${esc(fmtDateTime(m.takenAt || m.createdAt))}${m.uploader ? ` · ${esc(m.uploader)} さんが追加` : ''}<br>
    <span class="small">${esc(m.name)} · ${fmtBytes(m.size)}${dims}${m.kind === 'video' && m.duration ? ` · ${fmtDuration(m.duration)}` : ''}</span>`;
  $('#v-prev').hidden = viewer.index === 0;
  $('#v-next').hidden = viewer.index === viewer.list.length - 1;
  $('#v-full').hidden = !(m.kind === 'photo' && m.hasPreview);
  $('#v-delete').hidden = !(state.me.role === 'admin' || state.me.id === m.uploaderId);
}

function stepViewer(d) {
  const i = viewer.index + d;
  if (i < 0 || i >= viewer.list.length) return;
  viewer.index = i;
  renderViewer();
}

function setupViewer() {
  $('#v-close').onclick = () => closeViewer();
  $('#v-prev').onclick = () => stepViewer(-1);
  $('#v-next').onclick = () => stepViewer(1);
  $('#v-full').onclick = () => {
    const m = viewer.list[viewer.index];
    const img = $('#v-stage img');
    if (img) img.src = `/media/${m.id}/original`;
    $('#v-full').hidden = true;
  };
  $('#v-save').onclick = () => saveMedia(viewer.list[viewer.index]);
  $('#v-delete').onclick = async () => {
    const m = viewer.list[viewer.index];
    const ok = await confirmDialog({ title: 'この写真・動画を削除しますか？', body: 'サーバーから完全に削除され、メンバー全員から見えなくなります。', ok: '削除する', danger: true });
    if (!ok) return;
    try {
      await api('DELETE', `/api/media/${m.id}`);
      viewer.list.splice(viewer.index, 1);
      toast('削除しました');
      if (!viewer.list.length) { closeViewer(); }
      else { viewer.index = Math.min(viewer.index, viewer.list.length - 1); renderViewer(); }
      if (state.album) viewAlbum(state.album.id, { keepScroll: true });
    } catch (e) { showError(e); }
  };
  document.addEventListener('keydown', (e) => {
    if ($('#viewer').hidden || $('#dialog').open) return;
    if (e.key === 'ArrowLeft') stepViewer(-1);
    else if (e.key === 'ArrowRight') stepViewer(1);
    else if (e.key === 'Escape') closeViewer();
  });

  // スワイプで前後へ。タップで操作ボタンの表示切り替え
  const stage = $('#v-stage');
  let sx = 0, sy = 0, dx = 0, tracking = false, moved = false;
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; tracking = true; moved = false;
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    if (!tracking || e.touches.length !== 1 || (window.visualViewport && window.visualViewport.scale > 1.01)) { tracking = false; return; }
    dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      const slide = $('.slide', stage);
      if (slide) slide.style.transform = `translateX(${dx}px)`;
    }
  }, { passive: true });
  stage.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = false;
    const slide = $('.slide', stage);
    if (Math.abs(dx) > 60) {
      const dir = dx < 0 ? 1 : -1;
      const target = viewer.index + dir;
      if (target >= 0 && target < viewer.list.length) { stepViewer(dir); return; }
    }
    if (slide) { slide.classList.add('anim'); slide.style.transform = ''; }
  });
  stage.addEventListener('click', (e) => {
    if (e.target.tagName === 'VIDEO' || moved) return;
    viewer.chromeOff = !viewer.chromeOff;
    $('#viewer').classList.toggle('chrome-off', viewer.chromeOff);
  });
}

async function saveMedia(m) {
  const url = `/media/${m.id}/original`;
  // iPhone では共有シートの「画像を保存」「ビデオを保存」で写真アプリに戻せる
  const SHARE_LIMIT = 300 * 1024 * 1024;
  if (navigator.canShare && m.size <= SHARE_LIMIT) {
    try {
      toast('準備しています…');
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], m.name, { type: m.mime });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = `${url}?dl=1`;
  a.download = m.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------------------------------------------------------------- アップロード

const uploads = { jobs: [], active: 0, max: 2, wakeLock: null, expanded: false };
const MAX_RETRIES = 6;

function enqueueUploads(files, albumId, albumTitle) {
  for (const file of files) {
    uploads.jobs.push({ file, albumId, albumTitle, name: file.name || 'file', size: file.size, sent: 0, state: 'waiting', mediaId: null, error: null });
  }
  document.body.classList.add('uploading');
  acquireWakeLock();
  renderUploads();
  pumpUploads();
}

function pumpUploads() {
  while (uploads.active < uploads.max) {
    const job = uploads.jobs.find((j) => j.state === 'waiting');
    if (!job) break;
    uploads.active++;
    job.state = 'working';
    runUpload(job)
      .then((r) => { job.state = r === 'duplicate' ? 'duplicate' : 'done'; job.sent = job.size; })
      .catch((e) => { job.state = 'error'; job.netError = !(e instanceof ApiError); job.error = job.netError ? '通信が切れました' : e.message; })
      .finally(() => {
        uploads.active--;
        renderUploads();
        refreshAlbumSoon(job.albumId);
        pumpUploads();
        if (!uploads.jobs.some((j) => j.state === 'waiting' || j.state === 'working')) releaseWakeLock();
      });
  }
  renderUploads();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      const retryable = !(e instanceof ApiError) || e.status >= 500 || e.status === 408 || e.status === 429;
      if (!retryable || e.status === 507 || attempt >= MAX_RETRIES) throw e;
      await sleep(Math.min(30000, 1000 * 2 ** attempt));
    }
  }
}

async function runUpload(job) {
  const { file } = job;
  if (!job.mediaId) {
    job.phase = '準備中';
    renderUploads();
    const meta = await describeFile(file);
    const created = await withRetry(() => api('POST', `/api/albums/${job.albumId}/media`, {
      name: job.name, size: file.size, mime: meta.mime,
      width: meta.width, height: meta.height, duration: meta.duration, takenAt: meta.takenAt,
    }));
    if (created.duplicate) return 'duplicate';
    job.mediaId = created.id;
    job.chunkSize = created.chunkSize;
    if (meta.thumb) await withRetry(() => api('PUT', `/api/media/${job.mediaId}/thumb`, meta.thumb)).catch(() => {});
    if (meta.preview) await withRetry(() => api('PUT', `/api/media/${job.mediaId}/preview`, meta.preview)).catch(() => {});
    job.sent = 0;
  } else {
    const st = await withRetry(() => api('GET', `/api/media/${job.mediaId}/status`));
    if (st.status === 'ready') return 'done';
    job.sent = st.received;
  }

  job.phase = '送信中';
  const chunkSize = job.chunkSize || 8 * 1024 * 1024;
  while (job.sent < file.size) {
    const end = Math.min(file.size, job.sent + chunkSize);
    const offset = job.sent;
    try {
      const r = await withRetry(() => api('PUT', `/api/media/${job.mediaId}/chunk?offset=${offset}`, file.slice(offset, end)));
      job.sent = r.received;
    } catch (e) {
      // 送信位置がずれた（再送が二重に届いた等）→ サーバーの受信済みサイズから続ける
      if (e instanceof ApiError && typeof e.body.received === 'number' && e.status !== 507) { job.sent = e.body.received; continue; }
      throw e;
    }
    renderUploads();
  }
  await withRetry(() => api('POST', `/api/media/${job.mediaId}/complete`));
  return 'done';
}

let refreshTimer;
function refreshAlbumSoon(albumId) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    state.albums = null;
    if (location.hash === `#/a/${albumId}` && $('#viewer').hidden) viewAlbum(albumId, { keepScroll: true });
  }, 600);
}

function renderUploads() {
  const el = $('#uploads');
  const jobs = uploads.jobs;
  if (!jobs.length) { el.hidden = true; document.body.classList.remove('uploading'); return; }
  el.hidden = false;
  document.body.classList.add('uploading');
  const total = jobs.reduce((s, j) => s + j.size, 0);
  const sent = jobs.reduce((s, j) => s + (j.state === 'done' || j.state === 'duplicate' ? j.size : j.sent), 0);
  const done = jobs.filter((j) => j.state === 'done').length;
  const dup = jobs.filter((j) => j.state === 'duplicate').length;
  const err = jobs.filter((j) => j.state === 'error').length;
  const busy = jobs.some((j) => j.state === 'waiting' || j.state === 'working');
  const pct = total ? Math.floor((sent / total) * 100) : 100;

  const statusText = (j) => ({
    waiting: '待機中', working: `${j.phase || ''} ${j.size ? Math.floor((j.sent / j.size) * 100) : 0}%`,
    done: '✓ 保存済み', duplicate: '追加済みのためスキップ', error: `失敗：${j.error}`,
  }[j.state]);

  el.innerHTML = `
    <div class="up-head">
      <div class="spacer">
        <strong>${busy ? `アップロード中 ${done + dup}/${jobs.length}` : err ? `${err}件が失敗しました` : `${done}件をサーバーに保存しました`}</strong>
        <div class="muted">${fmtBytes(sent)} / ${fmtBytes(total)}${busy ? ' · この画面を開いたままにしてください' : ''}</div>
      </div>
      ${err && !busy ? '<button class="btn small" id="up-retry">再試行</button>' : ''}
      <button class="btn small" id="up-toggle">${uploads.expanded ? '閉じる' : '詳細'}</button>
      ${busy ? '' : '<button class="btn small icon-btn" id="up-close" aria-label="閉じる">✕</button>'}
    </div>
    <div class="up-bar"><i style="width:${pct}%"></i></div>
    ${!busy && !err && done ? `<div class="up-done">✅ すべてサーバーに保存されました。iPhoneの写真アプリから削除しても、ここでいつでも見られます。</div>` : ''}
    ${uploads.expanded ? `<ul class="up-list">${jobs.map((j) => `
      <li><span class="name">${esc(j.name)}</span><span class="st ${j.state === 'error' ? 'err' : j.state === 'done' ? 'done' : ''}">${esc(statusText(j))}</span></li>`).join('')}</ul>` : ''}`;

  document.body.style.setProperty('--up-h', `${el.offsetHeight + 8}px`);
  $('#up-toggle').onclick = () => { uploads.expanded = !uploads.expanded; renderUploads(); };
  const close = $('#up-close');
  if (close) close.onclick = () => { uploads.jobs = []; uploads.expanded = false; renderUploads(); };
  const retry = $('#up-retry');
  if (retry) retry.onclick = () => {
    uploads.jobs.forEach((j) => { if (j.state === 'error') { j.state = 'waiting'; j.error = null; } });
    acquireWakeLock();
    pumpUploads();
  };
}

window.addEventListener('beforeunload', (e) => {
  if (uploads.jobs.some((j) => j.state === 'waiting' || j.state === 'working')) { e.preventDefault(); e.returnValue = ''; }
});

async function acquireWakeLock() {
  try {
    if (!uploads.wakeLock && navigator.wakeLock) {
      uploads.wakeLock = await navigator.wakeLock.request('screen');
      uploads.wakeLock.addEventListener('release', () => { uploads.wakeLock = null; });
    }
  } catch { /* 非対応・省電力モード */ }
}
function releaseWakeLock() {
  if (uploads.wakeLock) { uploads.wakeLock.release().catch(() => {}); uploads.wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // 別アプリに切り替えて通信が止まった分は、戻ってきたら自動で続きから再開
  let resumed = false;
  uploads.jobs.forEach((j) => { if (j.state === 'error' && j.netError) { j.state = 'waiting'; j.error = null; resumed = true; } });
  if (resumed) pumpUploads();
  if (uploads.jobs.some((j) => j.state === 'working' || j.state === 'waiting')) acquireWakeLock();
});

// ---- サムネイル等の作成（端末側で行い、サーバーには小さな JPEG だけ追加で送る）

function guessMime(file) {
  if (file.type) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif', mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/x-m4v',
  }[ext] || 'application/octet-stream';
}

function canvasJpeg(source, sw, sh, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise((resolve) => c.toBlob((b) => { c.width = c.height = 0; resolve(b); }, 'image/jpeg', quality));
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

async function describeFile(file) {
  const mime = guessMime(file);
  const meta = { mime, takenAt: null, width: null, height: null, duration: null, thumb: null, preview: null };
  try { meta.takenAt = await readTakenAt(file); } catch { /* 読めなければ無視 */ }
  if (!meta.takenAt && file.lastModified) meta.takenAt = file.lastModified;
  const url = URL.createObjectURL(file);
  try {
    if (mime.startsWith('image/')) {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await withTimeout(img.decode(), 30000);
      meta.width = img.naturalWidth; meta.height = img.naturalHeight;
      meta.thumb = await canvasJpeg(img, meta.width, meta.height, 480, 0.8);
      // 大きい写真は閲覧用に軽いプレビューを作る（元画像は「元の画質で表示」「保存」の時だけ読む）
      if (Math.max(meta.width, meta.height) > 2048 || file.size > 1.5 * 1024 * 1024 || mime !== 'image/jpeg') {
        meta.preview = await canvasJpeg(img, meta.width, meta.height, 2048, 0.85);
      }
    } else if (mime.startsWith('video/')) {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      await withTimeout(new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video')); }), 20000);
      meta.duration = Number.isFinite(v.duration) ? v.duration : null;
      meta.width = v.videoWidth || null; meta.height = v.videoHeight || null;
      if (v.videoWidth) {
        v.currentTime = Math.min(1, (v.duration || 2) / 2);
        await withTimeout(new Promise((res) => { v.onseeked = res; }), 15000);
        meta.thumb = await canvasJpeg(v, v.videoWidth, v.videoHeight, 480, 0.8);
      }
      v.removeAttribute('src'); v.load();
    }
  } catch { /* サムネイルが作れなくても本体のアップロードは続ける */ }
  finally { URL.revokeObjectURL(url); }
  return meta;
}

// ---------------------------------------------------------------- 設定

async function viewSettings() {
  setBar({ title: '設定', back: '/' });
  const v = $('#view');
  v.innerHTML = `
    <div class="card">
      <h2>${esc(state.me.name)} さん${state.me.role === 'admin' ? '<span class="pill admin">管理者</span>' : ''}</h2>
      <p class="small muted">写真・動画はすべてサーバーに保存されています。この端末に保存されるのは表示中の一時データだけです。</p>
    </div>
    <div class="card">
      <h2>この端末以外でログイン</h2>
      <p class="small">iPad・PC、またはホーム画面に追加したアプリで使うときに、8桁のコードを発行します（10分間有効）。</p>
      <button class="btn primary" id="new-code">コードを発行</button>
    </div>
    <div class="card">
      <h2>ログイン中の端末</h2>
      <ul class="list" id="devices"><li class="muted">読み込み中…</li></ul>
    </div>
    ${isIOS() ? `<div class="card">
      <h2>iPhoneでアプリのように使う</h2>
      <ol class="howto small">
        <li>Safari でこのページを開き、共有ボタン <b>⬆︎</b> →「ホーム画面に追加」</li>
        <li>ホーム画面のアイコンから開く</li>
        <li>上の「コードを発行」で出たコードを入力してログイン</li>
      </ol></div>` : ''}
    <div class="card"><button class="btn danger" id="logout">この端末からログアウト</button></div>`;

  $('#new-code').onclick = async () => {
    try {
      const r = await api('POST', '/api/login-codes');
      await openDialog(`<h2>ログインコード</h2>
        <p class="small">ログインしたい端末で、このコードを入力してください。</p>
        <div class="big-code">${esc(r.code)}</div>
        <p class="small muted center" id="code-left"></p>
        <div class="actions"><button class="btn primary" data-close>閉じる</button></div>`, (d, close) => {
        const tick = () => {
          const left = Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000));
          const el = $('#code-left', d);
          if (!el) return;
          el.textContent = left ? `あと ${Math.floor(left / 60)}分${String(left % 60).padStart(2, '0')}秒 有効` : '有効期限が切れました';
          if (left && d.open) setTimeout(tick, 1000);
        };
        tick();
      });
      loadDevices();
    } catch (e) { showError(e); }
  };
  $('#logout').onclick = async () => {
    if (!await confirmDialog({ title: 'ログアウトしますか？', body: 'もう一度使うには、招待リンクかログインコードが必要です。', ok: 'ログアウト', danger: true })) return;
    try { await api('POST', '/api/logout'); } catch { /* 失敗しても画面は戻す */ }
    state.me = null;
    location.hash = '/';
    route();
  };

  async function loadDevices() {
    try {
      const list = await api('GET', '/api/me/devices');
      const ul = $('#devices');
      if (!ul) return;
      ul.innerHTML = list.map((d) => `<li><div class="grow"><div class="name">${esc(d.device)}${d.current ? '<span class="pill admin">この端末</span>' : ''}</div>
        <div class="small muted">最終利用：${fmtAgo(d.lastSeen)}・登録：${fmtDay(d.createdAt)}</div></div>
        ${d.current ? '' : `<button class="btn small danger" data-dev="${esc(d.id)}">ログアウトさせる</button>`}</li>`).join('');
      ul.querySelectorAll('[data-dev]').forEach((b) => {
        b.onclick = async () => {
          try { await api('DELETE', `/api/me/devices/${b.dataset.dev}`); loadDevices(); } catch (e) { showError(e); }
        };
      });
    } catch (e) { showError(e); }
  }
  loadDevices();
}

// ---------------------------------------------------------------- メンバー管理（管理者）

async function viewMembers() {
  setBar({ title: 'メンバー', back: '/' });
  const v = $('#view');
  v.innerHTML = '<div class="empty">読み込み中…</div>';
  const current = navGuard();
  let data, storage;
  try {
    [data, storage] = await Promise.all([api('GET', '/api/admin/members'), api('GET', '/api/admin/storage')]);
  } catch (e) { return showError(e); }
  if (!current()) return;
  const active = data.users.filter((u) => !u.disabled);
  const disabled = data.users.filter((u) => u.disabled);
  const cap = storage.freeBytes != null ? storage.usedBytes + storage.freeBytes : null;

  const userRow = (u) => `<li>
    <div class="grow"><div class="name">${esc(u.name)}${u.role === 'admin' ? '<span class="pill admin">管理者</span>' : ''}${u.id === state.me.id ? '<span class="pill">あなた</span>' : ''}${u.disabled ? '<span class="pill">停止中</span>' : ''}</div>
    <div class="small muted">追加 ${u.uploads}件・端末 ${u.devices}台・最終利用 ${fmtAgo(u.lastSeen)}</div></div>
    ${u.id === state.me.id ? '' : `<button class="btn small" data-user="${u.id}">管理</button>`}</li>`;

  v.innerHTML = `
    <div class="card">
      <h2>メンバーを招待</h2>
      <p class="small">招待リンクを作って、LINEやメールで本人だけに送ってください。リンクは<strong>1回だけ・7日間</strong>有効です。</p>
      <form id="invite-form" class="row">
        <input class="input" name="name" placeholder="名前（例：ゆうこ）" maxlength="40" required style="flex:1;min-width:160px">
        <select class="input" name="role" style="width:auto"><option value="member">メンバー</option><option value="admin">管理者</option></select>
        <button class="btn primary">招待リンクを作成</button>
      </form>
    </div>
    ${data.invites.length ? `<div class="card"><h2>未使用の招待リンク</h2><ul class="list">${data.invites.map((i) => `<li>
      <div class="grow"><div class="name">${esc(i.name)}${i.role === 'admin' ? '<span class="pill admin">管理者</span>' : ''}</div>
      <div class="small muted">有効期限 ${fmtDateTime(i.expiresAt)}</div></div>
      <button class="btn small danger" data-revoke="${i.id}">取り消す</button></li>`).join('')}</ul></div>` : ''}
    <div class="card"><h2>メンバー（${active.length}人）</h2><ul class="list">${active.map(userRow).join('')}</ul></div>
    ${disabled.length ? `<div class="card"><h2>停止中</h2><ul class="list">${disabled.map(userRow).join('')}</ul></div>` : ''}
    <div class="card">
      <h2>サーバーの容量</h2>
      ${cap ? `<div class="meter"><i style="width:${Math.min(100, (storage.usedBytes / cap) * 100).toFixed(1)}%"></i></div>` : ''}
      <p class="small">写真・動画 ${storage.count}件で ${fmtBytes(storage.usedBytes)} 使用${storage.freeBytes != null ? `・空き ${fmtBytes(storage.freeBytes)}` : ''}</p>
    </div>`;

  $('#invite-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await api('POST', '/api/admin/invites', { name: f.name.value, role: f.role.value });
      await showInviteLink(f.name.value.trim(), r.url, '7日間');
      viewMembers();
    } catch (err) { showError(err); }
  };
  v.querySelectorAll('[data-revoke]').forEach((b) => {
    b.onclick = async () => {
      try { await api('DELETE', `/api/admin/invites/${b.dataset.revoke}`); viewMembers(); } catch (e) { showError(e); }
    };
  });
  v.querySelectorAll('[data-user]').forEach((b) => {
    b.onclick = () => manageMember(data.users.find((u) => u.id === b.dataset.user));
  });
}

async function showInviteLink(name, url, ttl) {
  const text = `${name} さん、${appName()} への招待です。下のリンクを iPhone の Safari で開いてください（${ttl}・1回だけ有効）`;
  await openDialog(`<h2>${esc(name)} さんへの招待リンク</h2>
    <p class="small">本人だけに送ってください。開くとその端末でログインされます（${esc(ttl)}・1回だけ有効）。</p>
    <div class="share-url">${esc(url)}</div>
    <div class="actions"><button class="btn" id="copy-link">コピー</button>
    ${navigator.share ? '<button class="btn" id="share-link">送る…</button>' : ''}
    <button class="btn primary" data-close>完了</button></div>`, (d) => {
    $('#copy-link', d).onclick = () => copyText(url);
    const s = $('#share-link', d);
    if (s) s.onclick = () => shareOrCopy(url, text);
  });
}

async function manageMember(u) {
  const act = await openDialog(`<h2>${esc(u.name)}</h2>
    <div class="stack">
      ${u.disabled ? '<button class="btn block" data-close="enable">利用を再開</button>' : `
      <button class="btn block" data-close="relogin">再ログイン用リンクを発行</button>
      <button class="btn block" data-close="rename">名前を変更</button>
      <button class="btn block" data-close="role">${u.role === 'admin' ? 'メンバーに戻す' : '管理者にする'}</button>
      <button class="btn block danger" data-close="disable">利用を停止（全端末からログアウト）</button>`}
      <button class="btn block" data-close>閉じる</button>
    </div>
    <p class="small muted" style="margin-top:12px">再ログイン用リンクは、機種変更やログアウトで入れなくなった時に使います（24時間・1回だけ有効）。</p>`);
  try {
    if (act === 'relogin') {
      const r = await api('POST', '/api/admin/invites', { userId: u.id });
      await showInviteLink(u.name, r.url, '24時間');
    } else if (act === 'rename') {
      const name = await askText({ title: '名前を変更', label: '名前', value: u.name, ok: '変更' });
      if (name) await api('PATCH', `/api/admin/members/${u.id}`, { name });
    } else if (act === 'role') {
      await api('PATCH', `/api/admin/members/${u.id}`, { role: u.role === 'admin' ? 'member' : 'admin' });
    } else if (act === 'disable') {
      if (!await confirmDialog({ title: `${u.name} さんの利用を停止しますか？`, body: 'すべての端末からログアウトされ、アクセスできなくなります。追加した写真・動画は残ります。', ok: '停止する', danger: true })) return;
      await api('PATCH', `/api/admin/members/${u.id}`, { disabled: true });
    } else if (act === 'enable') {
      await api('PATCH', `/api/admin/members/${u.id}`, { disabled: false });
      toast('再開しました。再ログイン用リンクを発行して送ってください');
    } else return;
    viewMembers();
  } catch (e) { showError(e); }
}

// ---------------------------------------------------------------- 起動

setupViewer();
route();
