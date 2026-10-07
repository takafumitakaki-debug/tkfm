import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../lib/app.js';

let app, base, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tkfm-share-'));
  app = createApp({ dataDir, ffmpeg: '' });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});

after(async () => {
  await new Promise((r) => app.server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function client(cookie = '') {
  const c = {
    cookie,
    async req(method, url, body, headers = {}) {
      const h = { 'X-TKFM': '1', ...headers };
      if (c.cookie) h.Cookie = c.cookie;
      let payload = body;
      if (body !== undefined && !(body instanceof Uint8Array)) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
      const res = await fetch(base + url, { method, headers: h, body: payload });
      const sc = res.headers.get('set-cookie');
      if (sc) c.cookie = sc.split(';')[0];
      return res;
    },
    async json(method, url, body, headers) {
      const res = await c.req(method, url, body, headers);
      return { status: res.status, body: await res.json() };
    },
  };
  return c;
}

const tokenOf = (p) => p.split('/').pop();

test('招待からアップロード・閲覧・権限まで一通り動く', async () => {
  // 未ログインは拒否
  const anon = client();
  assert.equal((await anon.json('GET', '/api/me')).status, 401);
  assert.equal((await anon.json('GET', '/api/albums')).status, 401);

  // 管理者招待 → 参加
  const inv = app.createInvite({ name: '管理者', role: 'admin' });
  const admin = client();
  assert.deepEqual((await admin.json('GET', `/api/invites/${tokenOf(inv.path)}`)).body.valid, true);
  assert.equal((await admin.json('POST', `/api/invites/${tokenOf(inv.path)}/accept`)).status, 200);
  const me = (await admin.json('GET', '/api/me')).body;
  assert.equal(me.role, 'admin');

  // 招待リンクは1回限り
  const again = client();
  assert.equal((await again.json('POST', `/api/invites/${tokenOf(inv.path)}/accept`)).status, 410);

  // CSRF 用ヘッダーが無い書き込みは拒否
  const noHeader = await fetch(base + '/api/albums', { method: 'POST', headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' }, body: '{"title":"x"}' });
  assert.equal(noHeader.status, 403);

  // メンバーを招待
  const mi = (await admin.json('POST', '/api/admin/invites', { name: 'ゆうこ' })).body;
  assert.match(mi.url, /\/invite\//);
  const member = client();
  await member.json('POST', `/api/invites/${tokenOf(mi.url)}/accept`);
  assert.equal((await member.json('GET', '/api/me')).body.name, 'ゆうこ');
  assert.equal((await member.json('GET', '/api/admin/members')).status, 403);

  // アルバム作成とアップロード（2チャンク）
  const album = (await member.json('POST', '/api/albums', { title: '夏休み' })).body;
  const data = new Uint8Array(1000).map((_, i) => i % 251);
  const created = (await member.json('POST', `/api/albums/${album.id}/media`, { name: 'a.mp4', size: data.length, mime: 'video/mp4', duration: 3.5 })).body;
  assert.ok(created.id);

  const ct = { 'Content-Type': 'application/octet-stream' };
  // 位置ずれは 409 + 受信済みサイズ
  const bad = await member.json('PUT', `/api/media/${created.id}/chunk?offset=10`, data.slice(10, 20), ct);
  assert.equal(bad.status, 409);
  assert.equal(bad.body.received, 0);
  assert.equal((await member.json('PUT', `/api/media/${created.id}/chunk?offset=0`, data.slice(0, 600), ct)).body.received, 600);
  assert.equal((await member.json('POST', `/api/media/${created.id}/complete`)).status, 409);
  // 他人は送信できない
  assert.equal((await admin.json('PUT', `/api/media/${created.id}/chunk?offset=600`, data.slice(600), ct)).status, 403);
  assert.equal((await member.json('GET', `/api/media/${created.id}/status`)).body.received, 600);
  assert.equal((await member.json('PUT', `/api/media/${created.id}/chunk?offset=600`, data.slice(600), ct)).body.received, 1000);
  // サムネイル（JPEG 以外は拒否）
  assert.equal((await member.json('PUT', `/api/media/${created.id}/thumb`, new Uint8Array([1, 2, 3, 4]), ct)).status, 415);
  assert.equal((await member.json('PUT', `/api/media/${created.id}/thumb`, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), ct)).status, 200);
  assert.equal((await member.json('POST', `/api/media/${created.id}/complete`)).status, 200);

  // 同じファイルの再アップロードは重複扱い
  assert.equal((await member.json('POST', `/api/albums/${album.id}/media`, { name: 'a.mp4', size: data.length, mime: 'video/mp4' })).body.duplicate, true);
  // 写真・動画以外は拒否
  assert.equal((await member.json('POST', `/api/albums/${album.id}/media`, { name: 'x.pdf', size: 10, mime: 'application/pdf' })).status, 415);

  // 他のメンバーから見える・Range で取れる
  const list = (await admin.json('GET', `/api/albums/${album.id}`)).body;
  assert.equal(list.media.length, 1);
  assert.equal(list.media[0].uploader, 'ゆうこ');
  assert.equal(list.media[0].hasThumb, true);
  const full = await admin.req('GET', `/media/${created.id}/original`);
  assert.equal(full.status, 200);
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), data);
  const part = await admin.req('GET', `/media/${created.id}/original`, undefined, { Range: 'bytes=100-199' });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 100-199/1000');
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()), data.slice(100, 200));
  const dl = await admin.req('GET', `/media/${created.id}/original?dl=1`);
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  await dl.arrayBuffer();
  assert.equal((await anon.req('GET', `/media/${created.id}/original`)).status, 401);

  // アルバム一覧の件数・表紙
  const albums = (await admin.json('GET', '/api/albums')).body;
  assert.equal(albums[0].count, 1);
  assert.equal(albums[0].coverId, created.id);

  // 作成者以外のメンバーはアルバムを消せない（管理者は可）
  const other = client();
  await other.json('POST', `/api/invites/${tokenOf((await admin.json('POST', '/api/admin/invites', { name: 'けん' })).body.url)}/accept`);
  assert.equal((await other.json('DELETE', `/api/albums/${album.id}`)).status, 403);
  assert.equal((await other.json('DELETE', `/api/media/${created.id}`)).status, 403);

  // ログインコードで別端末にログイン
  const code = (await member.json('POST', '/api/login-codes')).body.code;
  assert.match(code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  const ipad = client();
  assert.equal((await ipad.json('POST', '/api/login-codes/redeem', { code: 'ZZZZ-ZZZZ' })).status, 400);
  assert.equal((await ipad.json('POST', '/api/login-codes/redeem', { code: code.toLowerCase() })).status, 200);
  assert.equal((await ipad.json('GET', '/api/me')).body.name, 'ゆうこ');
  assert.equal((await client().json('POST', '/api/login-codes/redeem', { code })).status, 400);   // 使い回し不可
  assert.equal((await member.json('GET', '/api/me/devices')).body.length, 2);

  // 利用停止すると全端末が締め出される
  assert.equal((await admin.json('PATCH', `/api/admin/members/${me.id}`, { disabled: true })).status, 400);
  const memberId = (await member.json('GET', '/api/me')).body.id;
  await admin.json('PATCH', `/api/admin/members/${memberId}`, { disabled: true });
  assert.equal((await member.json('GET', '/api/me')).status, 401);
  assert.equal((await ipad.json('GET', '/api/me')).status, 401);

  // 再開 → 再ログインリンク
  await admin.json('PATCH', `/api/admin/members/${memberId}`, { disabled: false });
  const relog = (await admin.json('POST', '/api/admin/invites', { userId: memberId })).body;
  const phone2 = client();
  await phone2.json('POST', `/api/invites/${tokenOf(relog.url)}/accept`);
  assert.equal((await phone2.json('GET', '/api/me')).body.id, memberId);

  // 削除でファイルも消える
  assert.equal((await admin.json('DELETE', `/api/albums/${album.id}`)).status, 200);
  assert.equal((await admin.req('GET', `/media/${created.id}/original`)).status, 404);
  assert.equal(fs.existsSync(path.join(dataDir, 'media', created.id.slice(0, 2), created.id)), false);
});

test('SPA と静的ファイル', async () => {
  const res = await fetch(base + '/invite/abc');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<title>TKFM Share<\/title>/);
  assert.equal((await fetch(base + '/app.js')).status, 200);
  assert.equal((await fetch(base + '/..%2Fpackage.json')).status, 404);
  assert.equal((await fetch(base + '/%2E%2E/lib/app.js')).status, 404);
  assert.equal((await fetch(base + '/nope.js')).status, 404);
});
