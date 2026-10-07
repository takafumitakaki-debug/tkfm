// テスト用の架空サイト（意図的にSEO/AI対策上の問題を含む）
import http from 'node:http';

const layout = (title, body, { desc = '', head = '', h1 = true } = {}) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${desc ? `<meta name="description" content="${desc}">` : ''}${head}</head>
<body><header><nav><a href="/">ホーム</a> <a href="/services/">サービス</a> <a href="/blog/">ブログ</a> <a href="/contact">お問い合わせ</a></nav></header>
<main>${h1 ? '' : ''}${body}</main><footer><a href="/privacy">プライバシーポリシー</a></footer></body></html>`;

const long = '沖縄県内の飲食店向けに食材を毎朝配送しています。配送エリアは那覇市・浦添市・宜野湾市を中心に本島全域です。取り扱い品目は野菜・精肉・鮮魚・加工品の約3,000点で、前日22時までの注文で翌朝7時までにお届けします。';

const pages = {
  '/': () => layout('沖縄の業務用食材卸｜テスト食品', `<h1>沖縄の飲食店を支える業務用食材の卸売</h1><p>${long}</p>
    <a class="btn" style="background:#e60;color:#fff;padding:12px" href="/contact">無料で相談する</a>
    <h2>サービス</h2><p>テスト食品は1963年創業の食品卸です。<a href="/services/delivery">配送サービス</a>と<a href="/services/pb">自社商品</a>を提供しています。</p>
    <h2>よくある質問</h2><h3>最低注文金額はいくらですか？</h3><p>最低注文金額は5,000円（税込）です。5,000円未満の場合は配送料500円がかかります。</p>
    <h3>支払い方法は何がありますか？</h3><p>支払い方法は月末締め翌月末払いの請求書払い、または口座振替です。</p>
    <a href="/blog/">こちら</a> <a href="/old-page">旧ページ</a> <a href="/missing">リンク切れ</a> <a href="https://external.invalid/">外部</a> <a href="/secret/x">社内</a>`,
  { desc: '沖縄県内の飲食店に業務用食材を毎朝配送するテスト食品の公式サイト。野菜・精肉・鮮魚など約3,000品目、前日22時までの注文で翌朝お届け。', head: '<link rel="canonical" href="http://HOST/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"テスト食品","url":"http://HOST/"}</script>' }),
  '/services/delivery': () => layout('配送サービス｜テスト食品', `<h1>配送サービス</h1><h2>概要</h2><p>これは毎朝の配送サービスです。</p><h4>対応エリア</h4><p>${long.repeat(5)}</p>`),
  '/services/pb': () => layout('配送サービス｜テスト食品', `<h1>自社商品</h1><h1>PB商品</h1><p>短い。</p><img src="/a.jpg"><img src="/b.jpg" alt="">`),
  '/blog/': () => layout('ブログ一覧｜テスト食品', `<h1>ブログ</h1><a href="/blog/2024/01/post-1">記事1</a>`),
  '/blog/2024/01/post-1': () => layout('沖縄の食材の選び方', `<h1>沖縄の食材の選び方</h1><h2>島野菜とは？</h2><p>島野菜とは、沖縄で古くから栽培されてきた伝統野菜のことです。ゴーヤー・ナーベーラー・島らっきょうなどが代表的で、${long}</p><a href="/blog/2024/01/post-2">次の記事</a>`, { desc: '短い' }),
  '/blog/2024/01/post-2': () => layout('沖縄の食材の選び方', `<h1>続き</h1><p>${long}</p><a href="/blog/2024/01/post-3">次</a>`),
  '/blog/2024/01/post-3': () => layout('記事3｜テスト食品', `<h1>記事3</h1><p>${long}</p><a href="/blog/2024/01/post-4">次</a>`),
  '/blog/2024/01/post-4': () => layout('記事4｜テスト食品', `<h1>記事4</h1><p>${long}</p>`),
  '/contact': () => layout('お問い合わせ｜テスト食品', '<h1>お問い合わせ</h1><form><input name="q"><button>送信</button></form>'),
  '/privacy': () => layout('プライバシーポリシー｜テスト食品', '<h1>プライバシーポリシー</h1><p>個人情報を適切に管理します。</p>', { head: '<meta name="robots" content="noindex">' }),
  '/orphan': () => layout('孤立ページ｜テスト食品', `<h1>どこからもリンクされていないページ</h1><p>${long}</p>`),
  '/secret/x': () => layout('秘密', '<h1>秘密</h1>'),
};

export function startFixture(port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const host = req.headers.host;
      const path = req.url.split('?')[0];
      if (path === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(`User-agent: *\nDisallow: /secret/\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: http://${host}/sitemap.xml\n`); }
      if (path === '/sitemap.xml') { res.writeHead(200, { 'content-type': 'application/xml' }); return res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/services/delivery', '/orphan', '/privacy'].map((p) => `<url><loc>http://${host}${p}</loc></url>`).join('')}</urlset>`); }
      if (path === '/old-page') { res.writeHead(302, { location: '/old-page-2' }); return res.end(); }
      if (path === '/old-page-2') { res.writeHead(301, { location: '/services/delivery' }); return res.end(); }
      const page = pages[path];
      if (!page) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404</h1>'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page().replaceAll('HOST', host));
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startFixture(Number(process.argv[2] || 8090));
  console.log('fixture on', s.address().port);
}
