import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const DAY = 86400_000;
const SESSION_COOKIE = 'tkfm_s';
const SESSION_MAX_AGE = 400 * DAY;          // ブラウザが許す上限
const INVITE_TTL = 7 * DAY;
const RELOGIN_TTL = 1 * DAY;
const LOGIN_CODE_TTL = 10 * 60_000;
const CHUNK_MAX = 32 * 1024 * 1024;
const DERIVED_MAX = 8 * 1024 * 1024;        // サムネイル・プレビュー画像の上限
const FREE_SPACE_MARGIN = 1024 ** 3;        // 空き容量に常に残しておく分
const STALE_UPLOAD_AGE = 7 * DAY;
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const newId = () => crypto.randomBytes(12).toString('base64url');
const isId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{16}$/.test(s);

function newLoginCode() {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}
const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function deviceLabel(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'その他';
  const br = /EdgA?\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : /Mobile\//.test(ua) ? 'ホーム画面アプリ' : 'ブラウザ';
  return `${os} / ${br}`;
}

function cleanText(v, max) {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return s.slice(0, max);
}

function contentDisposition(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function createApp(opts = {}) {
  const dataDir = path.resolve(opts.dataDir || './data');
  const mediaRoot = path.join(dataDir, 'media');
  fs.mkdirSync(mediaRoot, { recursive: true });
  const db = openDb(path.join(dataDir, 'tkfm-share.db'));
  const trustProxy = !!opts.trustProxy;
  const publicUrl = opts.publicUrl ? opts.publicUrl.replace(/\/$/, '') : '';
  const maxUpload = opts.maxUploadBytes || 20 * 1024 ** 3;
  const appName = opts.appName || 'TKFM Share';

  const ffmpeg = opts.ffmpeg === undefined ? 'ffmpeg' : opts.ffmpeg;   // 空文字で無効
  const mediaDir = (id) => path.join(mediaRoot, id.slice(0, 2), id);
  const busyUploads = new Set();
  const failedCodeAttempts = new Map();   // ip -> { count, since }

  // ---- 招待 ----
  function createInvite({ name, role = 'member', userId = null, createdBy = null }) {
    const token = newToken();
    const now = Date.now();
    const id = newId();
    db.run(`INSERT INTO invites (id, token_hash, name, role, user_id, created_by, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, sha256(token), name, role, userId, createdBy, now, now + (userId ? RELOGIN_TTL : INVITE_TTL));
    return { id, token, path: `/invite/${token}` };
  }

  function baseUrl(req) {
    if (publicUrl) return publicUrl;
    const proto = trustProxy && req.headers['x-forwarded-proto'] ? req.headers['x-forwarded-proto'].split(',')[0] : (req.socket.encrypted ? 'https' : 'http');
    const host = (trustProxy && req.headers['x-forwarded-host']) || req.headers.host;
    return `${proto}://${host}`;
  }

  function isSecure(req) {
    if (publicUrl) return publicUrl.startsWith('https:');
    return req.socket.encrypted || (trustProxy && /^https/.test(req.headers['x-forwarded-proto'] || ''));
  }

  function clientIp(req) {
    if (trustProxy) {
      const f = req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (f) return f;
    }
    return req.socket.remoteAddress || '';
  }

  // ---- セッション ----
  function startSession(req, res, userId) {
    const token = newToken();
    const now = Date.now();
    db.run('INSERT INTO sessions (token_hash, user_id, device, created_at, last_seen) VALUES (?, ?, ?, ?, ?)',
      sha256(token), userId, deviceLabel(req.headers['user-agent']), now, now);
    const attrs = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_MAX_AGE / 1000}`];
    if (isSecure(req)) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
  }

  function currentUser(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const hash = sha256(token);
    const row = db.get(`SELECT u.id, u.name, u.role, s.last_seen, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id
                        WHERE s.token_hash = ? AND u.disabled_at IS NULL`, hash);
    if (!row) return null;
    const now = Date.now();
    if (now - row.last_seen > 3600_000) db.run('UPDATE sessions SET last_seen = ? WHERE token_hash = ?', now, hash);
    return { id: row.id, name: row.name, role: row.role, sessionHash: hash };
  }

  // ---- HTTP 補助 ----
  function sendJson(res, status, body) {
    const buf = Buffer.from(JSON.stringify(body));
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
    res.end(buf);
  }

  async function readJson(req, limit = 64 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new HttpError(413, 'リクエストが大きすぎます');
      chunks.push(c);
    }
    if (!size) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new HttpError(400, 'JSON の形式が正しくありません'); }
  }

  async function readBody(req, limit) {
    const len = Number(req.headers['content-length']);
    if (len > limit) throw new HttpError(413, 'ファイルが大きすぎます');
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new HttpError(413, 'ファイルが大きすぎます');
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  async function freeBytes() {
    try {
      const st = await fsp.statfs(dataDir);
      return st.bavail * st.bsize;
    } catch { return Infinity; }
  }

  async function serveFile(req, res, file, type, { download, filename, immutable } = {}) {
    let st;
    try { st = await fsp.stat(file); } catch { throw new HttpError(404, '見つかりません'); }
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': immutable ? 'private, max-age=31536000, immutable' : 'no-cache',
      'Last-Modified': st.mtime.toUTCString(),
    };
    if (download) headers['Content-Disposition'] = contentDisposition(filename || 'download');
    let start = 0, end = st.size - 1, status = 200;
    const range = req.headers.range;
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && st.size > 0) {
      if (m[1] === '') { start = Math.max(0, st.size - Number(m[2])); }
      else { start = Number(m[1]); if (m[2] !== '') end = Math.min(end, Number(m[2])); }
      if (start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
    }
    headers['Content-Length'] = st.size ? end - start + 1 : 0;
    res.writeHead(status, headers);
    if (req.method === 'HEAD' || st.size === 0) return res.end();
    await pipeline(fs.createReadStream(file, { start, end }), res).catch(() => {});
  }

  async function serveStatic(req, res, pathname) {
    let rel = pathname === '/' ? '/index.html' : pathname;
    let file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // SPA: 拡張子なしのパスは index.html を返す
      if (path.extname(pathname)) throw new HttpError(404, '見つかりません');
      file = path.join(PUBLIC_DIR, 'index.html');
    }
    const type = STATIC_TYPES[path.extname(file)] || 'application/octet-stream';
    await serveFile(req, res, file, type);
  }

  // ---- 表示用の整形 ----
  function mediaJson(m) {
    return {
      id: m.id, albumId: m.album_id, kind: m.kind, mime: m.mime, name: m.name, size: m.size,
      width: m.width, height: m.height, duration: m.duration,
      takenAt: m.taken_at, createdAt: m.created_at,
      uploader: m.uploader_name || null, uploaderId: m.uploader_id,
      hasThumb: !!m.has_thumb, hasPreview: !!m.has_preview,
    };
  }

  function loadMedia(id) {
    if (!isId(id)) throw new HttpError(404, '見つかりません');
    const m = db.get('SELECT * FROM media WHERE id = ?', id);
    if (!m) throw new HttpError(404, '見つかりません');
    return m;
  }

  function loadAlbum(id) {
    if (!isId(id)) throw new HttpError(404, 'アルバムが見つかりません');
    const a = db.get('SELECT * FROM albums WHERE id = ?', id);
    if (!a) throw new HttpError(404, 'アルバムが見つかりません');
    return a;
  }

  const canManage = (user, ownerId) => user.role === 'admin' || user.id === ownerId;

  async function removeMediaFiles(id) {
    await fsp.rm(mediaDir(id), { recursive: true, force: true });
  }

  async function cleanupStaleUploads() {
    const old = db.all("SELECT id FROM media WHERE status = 'uploading' AND created_at < ?", Date.now() - STALE_UPLOAD_AGE);
    for (const { id } of old) {
      await removeMediaFiles(id);
      db.run('DELETE FROM media WHERE id = ?', id);
    }
    db.run('DELETE FROM login_codes WHERE expires_at < ?', Date.now());
  }

  // 端末側でサムネイルを作れなかった動画（PC の Chrome で HEVC など）は、ffmpeg があればサーバーで作る
  function ffmpegThumb(id) {
    if (!ffmpeg) return;
    const dir = mediaDir(id);
    const run = (seek) => new Promise((resolve) => {
      execFile(ffmpeg, ['-loglevel', 'error', '-ss', seek, '-i', path.join(dir, 'original'), '-frames:v', '1',
        '-vf', 'scale=480:480:force_original_aspect_ratio=decrease', '-q:v', '4', '-y', path.join(dir, 'thumb.jpg')],
      { timeout: 60_000 }, (err) => resolve(!err && fs.existsSync(path.join(dir, 'thumb.jpg'))));
    });
    run('1').then((ok) => ok || run('0')).then((ok) => {
      if (ok) db.run('UPDATE media SET has_thumb = 1 WHERE id = ?', id);
    }).catch(() => {});
  }

  // ---- ルーティング ----
  const routes = [];
  const route = (method, pattern, handler, { auth = true, admin = false } = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler, auth, admin });
  };

  // 招待リンク
  route('GET', '/api/invites/:token', (req, res, { params }) => {
    const inv = db.get('SELECT * FROM invites WHERE token_hash = ?', sha256(params.token));
    if (!inv || inv.used_at || inv.expires_at < Date.now()) return sendJson(res, 200, { valid: false });
    sendJson(res, 200, { valid: true, name: inv.name, existing: !!inv.user_id, appName });
  }, { auth: false });

  route('POST', '/api/invites/:token/accept', (req, res, { params }) => {
    const now = Date.now();
    const userId = db.tx(() => {
      const inv = db.get('SELECT * FROM invites WHERE token_hash = ?', sha256(params.token));
      if (!inv || inv.used_at || inv.expires_at < now) throw new HttpError(410, 'この招待リンクは使用済みか、有効期限が切れています');
      db.run('UPDATE invites SET used_at = ? WHERE id = ?', now, inv.id);
      if (inv.user_id) {
        const u = db.get('SELECT * FROM users WHERE id = ? AND disabled_at IS NULL', inv.user_id);
        if (!u) throw new HttpError(410, 'このメンバーは利用停止されています');
        return u.id;
      }
      const id = newId();
      db.run('INSERT INTO users (id, name, role, created_at) VALUES (?, ?, ?, ?)', id, inv.name, inv.role, now);
      return id;
    });
    startSession(req, res, userId);
    sendJson(res, 200, { ok: true });
  }, { auth: false });

  // 別端末用ログインコード
  route('POST', '/api/login-codes', (req, res, { user }) => {
    const code = newLoginCode();
    const expiresAt = Date.now() + LOGIN_CODE_TTL;
    db.run('INSERT INTO login_codes (code_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(code), user.id, expiresAt);
    sendJson(res, 200, { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt });
  });

  route('POST', '/api/login-codes/redeem', async (req, res) => {
    const ip = clientIp(req);
    const now = Date.now();
    const rec = failedCodeAttempts.get(ip);
    if (rec && now - rec.since < 15 * 60_000 && rec.count >= 10) {
      throw new HttpError(429, '試行回数が多すぎます。15分ほど待ってからお試しください');
    }
    const body = await readJson(req);
    const code = normalizeCode(body.code);
    const row = code.length === 8 && db.get('SELECT * FROM login_codes WHERE code_hash = ?', sha256(code));
    if (!row || row.expires_at < now) {
      const r = rec && now - rec.since < 15 * 60_000 ? rec : { count: 0, since: now };
      r.count++;
      failedCodeAttempts.set(ip, r);
      throw new HttpError(400, 'コードが正しくないか、有効期限（10分）が切れています');
    }
    db.run('DELETE FROM login_codes WHERE code_hash = ?', row.code_hash);
    const u = db.get('SELECT id FROM users WHERE id = ? AND disabled_at IS NULL', row.user_id);
    if (!u) throw new HttpError(403, 'このメンバーは利用停止されています');
    failedCodeAttempts.delete(ip);
    startSession(req, res, u.id);
    sendJson(res, 200, { ok: true });
  }, { auth: false });

  // 自分
  route('GET', '/api/me', (req, res, { user }) => {
    sendJson(res, 200, { id: user.id, name: user.name, role: user.role, appName });
  });

  route('POST', '/api/logout', (req, res, { user }) => {
    db.run('DELETE FROM sessions WHERE token_hash = ?', user.sessionHash);
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    sendJson(res, 200, { ok: true });
  });

  route('GET', '/api/me/devices', (req, res, { user }) => {
    const rows = db.all('SELECT token_hash, device, created_at, last_seen FROM sessions WHERE user_id = ? ORDER BY last_seen DESC', user.id);
    sendJson(res, 200, rows.map((r) => ({
      id: r.token_hash.slice(0, 16), device: r.device, createdAt: r.created_at, lastSeen: r.last_seen,
      current: r.token_hash === user.sessionHash,
    })));
  });

  route('DELETE', '/api/me/devices/:id', (req, res, { user, params }) => {
    const rows = db.all('SELECT token_hash FROM sessions WHERE user_id = ?', user.id);
    const hit = rows.find((r) => r.token_hash.slice(0, 16) === params.id);
    if (!hit) throw new HttpError(404, '見つかりません');
    db.run('DELETE FROM sessions WHERE token_hash = ?', hit.token_hash);
    sendJson(res, 200, { ok: true });
  });

  // アルバム
  route('GET', '/api/albums', (req, res) => {
    const rows = db.all(`
      SELECT a.*, u.name AS creator_name,
        (SELECT COUNT(*) FROM media m WHERE m.album_id = a.id AND m.status = 'ready') AS count,
        (SELECT COALESCE(SUM(size), 0) FROM media m WHERE m.album_id = a.id AND m.status = 'ready') AS bytes,
        (SELECT m.id FROM media m WHERE m.album_id = a.id AND m.status = 'ready' AND m.has_thumb = 1
           ORDER BY m.created_at DESC LIMIT 1) AS cover_id
      FROM albums a LEFT JOIN users u ON u.id = a.created_by
      ORDER BY a.updated_at DESC`);
    sendJson(res, 200, rows.map((a) => ({
      id: a.id, title: a.title, createdBy: a.created_by, creator: a.creator_name,
      createdAt: a.created_at, updatedAt: a.updated_at, count: a.count, bytes: a.bytes, coverId: a.cover_id,
    })));
  });

  route('POST', '/api/albums', async (req, res, { user }) => {
    const body = await readJson(req);
    const title = cleanText(body.title, 80);
    if (!title) throw new HttpError(400, 'アルバム名を入力してください');
    const id = newId();
    const now = Date.now();
    db.run('INSERT INTO albums (id, title, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', id, title, user.id, now, now);
    sendJson(res, 201, { id, title });
  });

  route('GET', '/api/albums/:id', (req, res, { params }) => {
    const a = loadAlbum(params.id);
    const media = db.all(`SELECT m.*, u.name AS uploader_name FROM media m LEFT JOIN users u ON u.id = m.uploader_id
                          WHERE m.album_id = ? AND m.status = 'ready'
                          ORDER BY COALESCE(m.taken_at, m.created_at), m.created_at`, a.id);
    const creator = a.created_by && db.get('SELECT name FROM users WHERE id = ?', a.created_by);
    sendJson(res, 200, {
      id: a.id, title: a.title, createdBy: a.created_by, creator: creator ? creator.name : null,
      createdAt: a.created_at, media: media.map(mediaJson),
    });
  });

  route('PATCH', '/api/albums/:id', async (req, res, { user, params }) => {
    const a = loadAlbum(params.id);
    if (!canManage(user, a.created_by)) throw new HttpError(403, 'アルバムを作った人か管理者だけが変更できます');
    const body = await readJson(req);
    const title = cleanText(body.title, 80);
    if (!title) throw new HttpError(400, 'アルバム名を入力してください');
    db.run('UPDATE albums SET title = ? WHERE id = ?', title, a.id);
    sendJson(res, 200, { ok: true });
  });

  route('DELETE', '/api/albums/:id', async (req, res, { user, params }) => {
    const a = loadAlbum(params.id);
    if (!canManage(user, a.created_by)) throw new HttpError(403, 'アルバムを作った人か管理者だけが削除できます');
    const ids = db.all('SELECT id FROM media WHERE album_id = ?', a.id).map((r) => r.id);
    db.run('DELETE FROM albums WHERE id = ?', a.id);
    for (const id of ids) await removeMediaFiles(id);
    sendJson(res, 200, { ok: true });
  });

  // アップロード
  route('POST', '/api/albums/:id/media', async (req, res, { user, params }) => {
    const a = loadAlbum(params.id);
    const body = await readJson(req);
    const name = cleanText(body.name, 200) || 'untitled';
    const size = Number(body.size);
    const mime = cleanText(body.mime, 100).toLowerCase() || 'application/octet-stream';
    const kind = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'photo' : null;
    if (!kind) throw new HttpError(415, '写真・動画以外のファイルは追加できません');
    if (!Number.isSafeInteger(size) || size <= 0) throw new HttpError(400, 'ファイルサイズが不正です');
    if (size > maxUpload) throw new HttpError(413, `1ファイル ${Math.round(maxUpload / 1024 ** 3)}GB までです`);

    // 同じ人が同じアルバムに同じファイルを上げ直した場合は重複としてスキップ
    const dup = db.get(`SELECT id FROM media WHERE album_id = ? AND uploader_id = ? AND name = ? AND size = ? AND status = 'ready'`,
      a.id, user.id, name, size);
    if (dup) return sendJson(res, 200, { duplicate: true, id: dup.id });

    const pendingBytes = db.get("SELECT COALESCE(SUM(size), 0) AS s FROM media WHERE status = 'uploading'").s;
    if (await freeBytes() < size + pendingBytes + FREE_SPACE_MARGIN) {
      throw new HttpError(507, 'サーバーの空き容量が足りません。管理者に連絡してください');
    }

    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    const takenAt = num(body.takenAt);
    const id = newId();
    db.run(`INSERT INTO media (id, album_id, uploader_id, kind, mime, name, size, width, height, duration, taken_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, a.id, user.id, kind, mime, name, size,
      num(body.width) && Math.round(num(body.width)), num(body.height) && Math.round(num(body.height)),
      num(body.duration), takenAt && Math.round(takenAt), Date.now());
    await fsp.mkdir(mediaDir(id), { recursive: true });
    sendJson(res, 201, { id, received: 0, chunkSize: 8 * 1024 * 1024 });
  });

  function loadOwnUpload(user, id) {
    const m = loadMedia(id);
    if (m.uploader_id !== user.id) throw new HttpError(403, '自分のアップロードだけ操作できます');
    return m;
  }

  async function partSize(id) {
    try { return (await fsp.stat(path.join(mediaDir(id), 'original.part'))).size; } catch { return 0; }
  }

  route('GET', '/api/media/:id/status', async (req, res, { user, params }) => {
    const m = loadOwnUpload(user, params.id);
    sendJson(res, 200, { status: m.status, size: m.size, received: m.status === 'ready' ? m.size : await partSize(m.id) });
  });

  route('PUT', '/api/media/:id/chunk', async (req, res, { user, params, query }) => {
    const m = loadOwnUpload(user, params.id);
    if (m.status !== 'uploading') throw new HttpError(409, 'アップロード済みです', { received: m.size });
    if (busyUploads.has(m.id)) throw new HttpError(409, '同じファイルを同時に送信しています', { received: await partSize(m.id) });
    busyUploads.add(m.id);
    try {
      const offset = Number(query.get('offset'));
      const current = await partSize(m.id);
      const len = Number(req.headers['content-length']);
      if (!Number.isSafeInteger(len) || len <= 0 || len > CHUNK_MAX) throw new HttpError(411, 'Content-Length が必要です（32MB まで）');
      if (offset !== current) {
        req.resume();
        throw new HttpError(409, '送信位置がずれています', { received: current });
      }
      if (offset + len > m.size) throw new HttpError(400, '申告されたサイズを超えています');
      const file = path.join(mediaDir(m.id), 'original.part');
      await fsp.mkdir(path.dirname(file), { recursive: true });
      try {
        let got = 0;
        req.on('data', (c) => { got += c.length; });
        await pipeline(req, fs.createWriteStream(file, { flags: 'a' }));
        if (got !== len) throw new Error('short body');
      } catch {
        // 途中で切れた分は捨てて、次回は同じ位置から再送してもらう
        await fsp.truncate(file, current).catch(() => {});
        throw new HttpError(400, '送信が途中で切れました', { received: current });
      }
      sendJson(res, 200, { received: current + len });
    } finally {
      busyUploads.delete(m.id);
    }
  });

  route('PUT', '/api/media/:id/:variant', async (req, res, { user, params }) => {
    if (params.variant !== 'thumb' && params.variant !== 'preview') throw new HttpError(404, '見つかりません');
    const m = loadOwnUpload(user, params.id);
    const buf = await readBody(req, DERIVED_MAX);
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new HttpError(415, 'JPEG 画像を送ってください');
    await fsp.mkdir(mediaDir(m.id), { recursive: true });
    await fsp.writeFile(path.join(mediaDir(m.id), `${params.variant}.jpg`), buf);
    db.run(`UPDATE media SET has_${params.variant} = 1 WHERE id = ?`, m.id);
    sendJson(res, 200, { ok: true });
  });

  route('POST', '/api/media/:id/complete', async (req, res, { user, params }) => {
    const m = loadOwnUpload(user, params.id);
    if (m.status === 'ready') return sendJson(res, 200, { ok: true, media: mediaJson(m) });
    const got = await partSize(m.id);
    if (got !== m.size) throw new HttpError(409, `まだ全部届いていません（${got} / ${m.size} バイト）`, { received: got });
    const dir = mediaDir(m.id);
    await fsp.rename(path.join(dir, 'original.part'), path.join(dir, 'original'));
    const now = Date.now();
    db.run("UPDATE media SET status = 'ready' WHERE id = ?", m.id);
    db.run('UPDATE albums SET updated_at = ? WHERE id = ?', now, m.album_id);
    if (m.kind === 'video' && !m.has_thumb) ffmpegThumb(m.id);
    sendJson(res, 200, { ok: true, media: mediaJson({ ...m, status: 'ready', uploader_name: user.name }) });
  });

  route('DELETE', '/api/media/:id', async (req, res, { user, params }) => {
    const m = loadMedia(params.id);
    if (!canManage(user, m.uploader_id)) throw new HttpError(403, '追加した人か管理者だけが削除できます');
    db.run('DELETE FROM media WHERE id = ?', m.id);
    await removeMediaFiles(m.id);
    sendJson(res, 200, { ok: true });
  });

  // 管理
  route('GET', '/api/admin/members', (req, res) => {
    const users = db.all(`SELECT u.*, (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS devices,
                            (SELECT MAX(last_seen) FROM sessions s WHERE s.user_id = u.id) AS last_seen,
                            (SELECT COUNT(*) FROM media m WHERE m.uploader_id = u.id AND m.status = 'ready') AS uploads
                          FROM users u ORDER BY u.disabled_at IS NOT NULL, u.created_at`);
    const invites = db.all(`SELECT * FROM invites WHERE used_at IS NULL AND expires_at > ? AND user_id IS NULL ORDER BY created_at DESC`, Date.now());
    sendJson(res, 200, {
      users: users.map((u) => ({
        id: u.id, name: u.name, role: u.role, createdAt: u.created_at, disabled: !!u.disabled_at,
        devices: u.devices, lastSeen: u.last_seen, uploads: u.uploads,
      })),
      invites: invites.map((i) => ({ id: i.id, name: i.name, role: i.role, createdAt: i.created_at, expiresAt: i.expires_at })),
    });
  }, { admin: true });

  route('GET', '/api/admin/storage', async (req, res) => {
    const used = db.get("SELECT COALESCE(SUM(size), 0) AS s, COUNT(*) AS n FROM media WHERE status = 'ready'");
    const free = await freeBytes();
    sendJson(res, 200, { usedBytes: used.s, count: used.n, freeBytes: Number.isFinite(free) ? free : null });
  }, { admin: true });

  route('POST', '/api/admin/invites', async (req, res, { user }) => {
    const body = await readJson(req);
    let name, role = 'member', userId = null;
    if (body.userId) {
      if (!isId(body.userId)) throw new HttpError(404, 'メンバーが見つかりません');
      const target = db.get('SELECT * FROM users WHERE id = ? AND disabled_at IS NULL', body.userId);
      if (!target) throw new HttpError(404, 'メンバーが見つかりません');
      ({ name, role } = target);
      userId = target.id;
    } else {
      name = cleanText(body.name, 40);
      if (!name) throw new HttpError(400, '名前を入力してください');
      if (body.role === 'admin') role = 'admin';
    }
    const inv = createInvite({ name, role, userId, createdBy: user.id });
    sendJson(res, 201, { id: inv.id, url: baseUrl(req) + inv.path, expiresAt: Date.now() + (userId ? RELOGIN_TTL : INVITE_TTL) });
  }, { admin: true });

  route('DELETE', '/api/admin/invites/:id', (req, res, { params }) => {
    db.run('DELETE FROM invites WHERE id = ? AND used_at IS NULL', params.id);
    sendJson(res, 200, { ok: true });
  }, { admin: true });

  route('PATCH', '/api/admin/members/:id', async (req, res, { user, params }) => {
    const body = await readJson(req);
    const target = isId(params.id) && db.get('SELECT * FROM users WHERE id = ?', params.id);
    if (!target) throw new HttpError(404, 'メンバーが見つかりません');
    if (target.id === user.id && (body.disabled || body.role === 'member')) throw new HttpError(400, '自分自身は停止・降格できません');
    if (typeof body.disabled === 'boolean') {
      db.run('UPDATE users SET disabled_at = ? WHERE id = ?', body.disabled ? Date.now() : null, target.id);
      if (body.disabled) db.run('DELETE FROM sessions WHERE user_id = ?', target.id);
    }
    if (body.role === 'admin' || body.role === 'member') db.run('UPDATE users SET role = ? WHERE id = ?', body.role, target.id);
    if (body.name !== undefined) {
      const name = cleanText(body.name, 40);
      if (name) db.run('UPDATE users SET name = ? WHERE id = ?', name, target.id);
    }
    sendJson(res, 200, { ok: true });
  }, { admin: true });

  // 写真・動画ファイル本体
  async function serveMedia(req, res, user, id, variant, download) {
    const m = loadMedia(id);
    const dir = mediaDir(m.id);
    if (variant === 'original') {
      if (m.status !== 'ready') throw new HttpError(404, '見つかりません');
      return serveFile(req, res, path.join(dir, 'original'), m.mime, { download, filename: m.name, immutable: true });
    }
    if (variant === 'thumb' || variant === 'preview') {
      if (m.status !== 'ready' && m.uploader_id !== user.id) throw new HttpError(404, '見つかりません');
      return serveFile(req, res, path.join(dir, `${variant}.jpg`), 'image/jpeg', { immutable: true });
    }
    throw new HttpError(404, '見つかりません');
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const { pathname } = url;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");

    if (pathname.startsWith('/api/')) {
      // 他サイトからの書き込みリクエストを拒否（カスタムヘッダーは CORS 無しでは付けられない）
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-tkfm'] !== '1') {
        throw new HttpError(403, '不正なリクエストです');
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(pathname);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        let user = null;
        if (r.auth) {
          user = currentUser(req);
          if (!user) throw new HttpError(401, 'ログインが必要です');
          if (r.admin && user.role !== 'admin') throw new HttpError(403, '管理者だけが使える機能です');
        }
        return await r.handler(req, res, { user, params, query: url.searchParams });
      }
      throw new HttpError(404, '見つかりません');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method Not Allowed');

    const mm = /^\/media\/([^/]+)\/(original|thumb|preview)$/.exec(pathname);
    if (mm) {
      const user = currentUser(req);
      if (!user) throw new HttpError(401, 'ログインが必要です');
      return serveMedia(req, res, user, mm[1], mm[2], url.searchParams.has('dl'));
    }

    return serveStatic(req, res, pathname);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (res.headersSent) { res.destroy(); return; }
      if (req.readableEnded === false) req.resume();
      sendJson(res, status, { error: status === 500 ? 'サーバーでエラーが起きました' : err.message, ...(err.extra || {}) });
    });
  });
  server.requestTimeout = 0;          // 大きな動画の送受信を途中で切らない
  server.headersTimeout = 60_000;

  const timer = setInterval(() => cleanupStaleUploads().catch(console.error), 3600_000);
  timer.unref();
  cleanupStaleUploads().catch(console.error);
  server.on('close', () => { clearInterval(timer); db.close(); });

  return {
    server,
    db,
    createInvite,
    userCount: () => db.get('SELECT COUNT(*) AS n FROM users').n,
  };
}
