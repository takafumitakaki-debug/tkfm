import { createApp } from './lib/app.js';

const env = process.env;
const app = createApp({
  dataDir: env.DATA_DIR || './data',
  publicUrl: env.PUBLIC_URL || '',
  trustProxy: env.TRUST_PROXY === '1',
  maxUploadBytes: env.MAX_UPLOAD_GB ? Number(env.MAX_UPLOAD_GB) * 1024 ** 3 : undefined,
  appName: env.APP_NAME || undefined,
  ffmpeg: env.FFMPEG === 'off' ? '' : env.FFMPEG || undefined,
});

const port = Number(env.PORT || 8080);
const host = env.HOST || '0.0.0.0';
const base = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, '');

// node server.js invite "名前"  … 管理者の招待リンクを発行して終了
if (process.argv[2] === 'invite') {
  const name = process.argv[3] || '管理者';
  const inv = app.createInvite({ name, role: 'admin' });
  console.log(`\n${name} さん（管理者）の招待リンク（7日間・1回限り有効）:\n  ${base}${inv.path}\n`);
  app.db.close();
  process.exit(0);
}

app.server.listen(port, host, () => {
  console.log(`${env.APP_NAME || 'TKFM Share'} を起動しました: ${base}`);
  if (app.userCount() === 0) {
    const inv = app.createInvite({ name: '管理者', role: 'admin' });
    console.log('\nまだメンバーがいません。まず下の管理者用リンクをスマホかPCで開いてください（7日間・1回限り有効）:');
    console.log(`  ${base}${inv.path}\n`);
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { app.server.close(); process.exit(0); });
}
